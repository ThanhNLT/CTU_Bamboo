-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

INSERT INTO core.permission (code, description) VALUES
    ('wf.process.review', 'Giám sát quy trình đã phát hành: yêu cầu sửa chữa và chạy demo (không sửa được sơ đồ)');

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED'));

ALTER TABLE wf.process_model ADD COLUMN owner_unit_id uuid;
ALTER TABLE wf.process_model ADD FOREIGN KEY (tenant_id, owner_unit_id) REFERENCES core.org_unit (tenant_id, id);
COMMENT ON COLUMN wf.process_model.owner_unit_id IS 'Đơn vị sở hữu quy trình; NULL là toàn tenant (đơn vị gốc)';

ALTER TABLE wf.process_version
    ADD COLUMN audience text NOT NULL DEFAULT 'GROUP' CHECK (audience IN ('UNIT', 'COMPANY', 'GROUP'));
ALTER TABLE wf.sandbox_run ADD COLUMN version int;
COMMENT ON COLUMN wf.sandbox_run.version IS 'Phiên bản phát hành được chạy demo; NULL nếu chạy bản nháp';

CREATE TABLE wf.process_change_request (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id         uuid NOT NULL,
    version          int NOT NULL CHECK (version > 0),
    requested_by     uuid NOT NULL,
    message          text NOT NULL CHECK (length(btrim(message)) BETWEEN 3 AND 2000),
    status           text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DECLINED')),
    resolution_note  text,
    resolved_by      uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    resolved_at      timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, model_id) REFERENCES wf.process_model (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, requested_by) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, resolved_by) REFERENCES core.person (tenant_id, id),
    CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);
CREATE INDEX ON wf.process_change_request (tenant_id, model_id, created_at DESC);
CREATE INDEX ON wf.process_change_request (tenant_id, requested_by);
CALL audit.enable('wf.process_change_request');

CREATE FUNCTION wf.root_unit(p_tenant uuid, p_at timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT u.id FROM core.org_unit u
    WHERE u.tenant_id = p_tenant AND u.parent_id IS NULL AND u.valid_period @> p_at
    ORDER BY u.created_at LIMIT 1
$$;

CREATE FUNCTION wf.audience_scope(p_tenant uuid, p_unit uuid, p_audience text, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p_unit IS NULL OR p_audience = 'GROUP' THEN wf.root_unit(p_tenant, p_at)
        WHEN p_audience = 'UNIT' THEN p_unit
        ELSE coalesce((SELECT c.id FROM core.org_unit c JOIN core.org_unit u ON u.id = p_unit
                       WHERE c.tenant_id = p_tenant AND c.is_legal_entity AND c.path @> u.path
                       ORDER BY nlevel(c.path) DESC LIMIT 1), wf.root_unit(p_tenant, p_at))
    END
$$;

CREATE FUNCTION wf.people_under(p_scope uuid, p_at timestamptz DEFAULT now()) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT DISTINCT a.person_id
    FROM core.org_unit s
    JOIN core.org_unit u ON u.tenant_id = s.tenant_id AND u.path <@ s.path
    JOIN core.position p ON p.org_unit_id = u.id
    JOIN core.assignment a ON a.position_id = p.id AND a.valid_period @> p_at
    WHERE s.id = p_scope
$$;

CREATE FUNCTION wf.audience_people(p_model uuid, p_audience text, p_at timestamptz DEFAULT now()) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT wf.people_under(wf.audience_scope(m.tenant_id, m.owner_unit_id, p_audience, p_at), p_at)
    FROM wf.process_model m WHERE m.id = p_model
$$;

CREATE FUNCTION wf.process_access(p_person uuid, p_model uuid, p_at timestamptz DEFAULT now()) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
    m          wf.process_model;
    v_unit     uuid;
    v_audience text;
BEGIN
    SELECT * INTO m FROM wf.process_model WHERE id = p_model;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM core.person WHERE id = p_person AND tenant_id = m.tenant_id) THEN
        RETURN NULL;
    END IF;
    v_unit := coalesce(m.owner_unit_id, wf.root_unit(m.tenant_id, p_at));
    IF core.has_permission(p_person, 'wf.process.design', v_unit, p_at) THEN
        RETURN 'design';
    END IF;
    SELECT audience INTO v_audience FROM wf.process_version WHERE model_id = p_model ORDER BY version DESC LIMIT 1;
    IF v_audience IS NULL OR NOT EXISTS (
        SELECT 1 FROM wf.people_under(wf.audience_scope(m.tenant_id, m.owner_unit_id, v_audience, p_at), p_at) x
        WHERE x = p_person) THEN
        RETURN NULL;
    END IF;
    IF core.has_permission(p_person, 'wf.process.review', wf.root_unit(m.tenant_id, p_at), p_at) THEN
        RETURN 'review';
    END IF;
    RETURN 'view';
END $$;

CREATE FUNCTION wf.people_with(p_tenant uuid, p_permission text, p_unit uuid, p_at timestamptz DEFAULT now())
RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT x FROM wf.people_under(wf.root_unit(p_tenant, p_at), p_at) x
    WHERE core.has_permission(x, p_permission, coalesce(p_unit, wf.root_unit(p_tenant, p_at)), p_at)
$$;

CREATE FUNCTION wf.notify_process_published(p_model uuid, p_version int, p_actor uuid, p_note text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    m           wf.process_model;
    v_audience  text;
    v_reviewers uuid[];
    r           uuid;
    v_count     int := 0;
BEGIN
    SELECT * INTO m FROM wf.process_model WHERE id = p_model;
    SELECT audience INTO v_audience FROM wf.process_version WHERE model_id = p_model AND version = p_version;
    SELECT coalesce(array_agg(x), '{}') INTO v_reviewers
    FROM (SELECT wf.people_with(m.tenant_id, 'wf.process.review', NULL) x) s;
    FOR r IN SELECT wf.audience_people(p_model, v_audience) LOOP
        CONTINUE WHEN r = p_actor;
        PERFORM collab.notify(
            m.tenant_id, r, 'PROCESS_PUBLISHED', 'wf.process_model', p_model,
            format('Quy trình “%s” đã phát hành v%s', m.name, p_version),
            coalesce(nullif(btrim(p_note), '') || '. ', '')
                || CASE WHEN r = ANY (v_reviewers)
                        THEN 'Bạn có thể xem sơ đồ, yêu cầu sửa chữa hoặc chạy demo để giám sát luồng công việc.'
                        ELSE 'Bạn có thể xem sơ đồ luồng công việc mới.' END,
            p_actor);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END $$;
