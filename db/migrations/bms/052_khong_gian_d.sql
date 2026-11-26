-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

CREATE SCHEMA live;
CREATE SCHEMA api;

CREATE UNLOGGED TABLE live.event (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id  uuid NOT NULL,
    topic      text NOT NULL,
    at         timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX event_latest ON live.event (tenant_id, topic, id DESC);
CREATE INDEX event_at ON live.event (at);

CREATE FUNCTION live.emit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, live AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO live.event (tenant_id, topic) SELECT DISTINCT tenant_id, TG_ARGV[0] FROM old_rows
            WHERE tenant_id IS NOT NULL;
    ELSE
        INSERT INTO live.event (tenant_id, topic) SELECT DISTINCT tenant_id, TG_ARGV[0] FROM new_rows
            WHERE tenant_id IS NOT NULL;
    END IF;
    IF random() < 0.01 THEN
        DELETE FROM live.event WHERE at < now() - interval '1 hour';
    END IF;
    RETURN NULL;
END $$;

CREATE PROCEDURE live.track(p_table regclass, p_topic text)
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('CREATE TRIGGER live_ins AFTER INSERT ON %s REFERENCING NEW TABLE AS new_rows
                    FOR EACH STATEMENT EXECUTE FUNCTION live.emit(%L)', p_table, p_topic);
    EXECUTE format('CREATE TRIGGER live_upd AFTER UPDATE ON %s REFERENCING NEW TABLE AS new_rows
                    FOR EACH STATEMENT EXECUTE FUNCTION live.emit(%L)', p_table, p_topic);
    EXECUTE format('CREATE TRIGGER live_del AFTER DELETE ON %s REFERENCING OLD TABLE AS old_rows
                    FOR EACH STATEMENT EXECUTE FUNCTION live.emit(%L)', p_table, p_topic);
END $$;

CALL live.track('wf.task', 'approval');
CALL live.track('wf.approval_history', 'approval');
CALL live.track('wf.approval_step', 'approval');
CALL live.track('proc.purchase_request', 'procurement');
CALL live.track('ic.ic_order', 'ic');
CALL live.track('mfg.lot', 'production');
CALL live.track('hr.onboarding_request', 'hr');
CALL live.track('hr.transfer_request', 'hr');
CALL live.track('iot.measurement', 'iot');
CALL live.track('iot.incident', 'iot');
CALL live.track('kpi.value', 'kpi');
CALL live.track('kpi.snapshot', 'kpi');
CALL live.track('meta.data_issue', 'lineage');
CALL live.track('meta.pipeline_run', 'lineage');
CALL live.track('core.attachment', 'files');
CALL live.track('collab.kb_document', 'knowledge');
CALL live.track('core.org_unit', 'org');
CALL live.track('core.position', 'org');
CALL live.track('core.assignment', 'org');

CREATE TABLE live.presence (
    tenant_id  uuid NOT NULL,
    person_id  uuid NOT NULL,
    device     text NOT NULL CHECK (device ~ '^[A-Za-z0-9-]{8,64}$'),
    path       text NOT NULL CHECK (path ~ '^/[^?#]{0,199}$'),
    seen_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, person_id, device),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX presence_seen ON live.presence (tenant_id, seen_at DESC);

CREATE FUNCTION live.presence_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.seen_at := now();
    IF random() < 0.02 THEN
        DELETE FROM live.presence WHERE seen_at < now() - interval '1 day';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER presence_touch BEFORE INSERT OR UPDATE ON live.presence
    FOR EACH ROW EXECUTE FUNCTION live.presence_touch();

CREATE VIEW live.v_online AS
SELECT DISTINCT ON (p.tenant_id, p.person_id)
       p.tenant_id, p.person_id, pe.full_name, p.path, p.seen_at
FROM live.presence p
JOIN core.person pe ON pe.tenant_id = p.tenant_id AND pe.id = p.person_id
WHERE p.seen_at > now() - interval '75 seconds'
ORDER BY p.tenant_id, p.person_id, p.seen_at DESC;

ALTER TABLE meta.lineage_node ADD COLUMN origin text NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'auto'));
ALTER TABLE meta.lineage_edge ADD COLUMN origin text NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'auto'));
ALTER TABLE meta.quality_check ADD COLUMN tenant_id uuid REFERENCES core.tenant ON DELETE CASCADE;
ALTER TABLE meta.pipeline_run ADD COLUMN tenant_id uuid REFERENCES core.tenant ON DELETE CASCADE;
CREATE INDEX quality_check_tenant ON meta.quality_check (tenant_id, node_id);
CREATE INDEX pipeline_run_tenant ON meta.pipeline_run (tenant_id, started_at DESC);

CREATE TABLE api.api_key (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    prefix        text NOT NULL CHECK (prefix ~ '^bak_[A-Za-z0-9_-]{6}$'),
    key_sha256    bytea NOT NULL UNIQUE CHECK (length(key_sha256) = 32),
    scopes        text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 20),
    allowed_ips   cidr[] NOT NULL DEFAULT '{}',
    created_by    uuid NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    revoked_at    timestamptz,
    revoked_by    uuid,
    last_used_at  timestamptz,
    last_ip       inet,
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '366 days'),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX api_key_tenant ON api.api_key (tenant_id, created_at DESC);
CALL audit.enable('api.api_key');

CREATE TABLE api.usage (
    key_id   uuid NOT NULL REFERENCES api.api_key ON DELETE CASCADE,
    day      date NOT NULL,
    calls    int NOT NULL DEFAULT 0,
    errors   int NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, day)
);
