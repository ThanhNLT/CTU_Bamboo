-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE SCHEMA iot;
CREATE SCHEMA meta;
CREATE SCHEMA kpi;

CREATE TABLE iot.model (
    type        text PRIMARY KEY,
    kind        text NOT NULL,
    category    text NOT NULL CHECK (category IN ('cleanroom', 'smt', 'medical')),
    grade       text NOT NULL,
    attributes  jsonb NOT NULL CHECK (jsonb_typeof(attributes) = 'array')
);

CREATE TABLE iot.site (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    code         text NOT NULL,
    org_unit_id  uuid NOT NULL,
    name         text NOT NULL,
    province     text,
    lat          numeric(8, 5),
    lng          numeric(8, 5),
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id)
);

CREATE TABLE iot.entity (
    tenant_id         uuid NOT NULL REFERENCES core.tenant,
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code              text NOT NULL,
    urn               text NOT NULL UNIQUE,
    type              text NOT NULL REFERENCES iot.model,
    name              text NOT NULL,
    site_code         text NOT NULL,
    org_unit_id       uuid NOT NULL,
    connection_state  text NOT NULL DEFAULT 'online' CHECK (connection_state IN ('online', 'offline')),
    last_seen_at      timestamptz,
    state             jsonb NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id, site_code) REFERENCES iot.site (tenant_id, code),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id)
);

CREATE TABLE iot.measurement (
    tenant_id    uuid NOT NULL,
    entity_id    uuid NOT NULL,
    attribute    text NOT NULL,
    observed_at  timestamptz NOT NULL,
    value        double precision NOT NULL,
    PRIMARY KEY (entity_id, attribute, observed_at),
    FOREIGN KEY (tenant_id, entity_id) REFERENCES iot.entity (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ON iot.measurement (tenant_id, observed_at);

CREATE FUNCTION iot.measurement_latest() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    WITH latest AS (
        SELECT DISTINCT ON (entity_id, attribute) entity_id, attribute, value, observed_at
        FROM new_rows ORDER BY entity_id, attribute, observed_at DESC
    ), merged AS (
        SELECT l.entity_id,
               jsonb_object_agg(l.attribute, jsonb_build_object('value', l.value, 'observed_at', l.observed_at)) AS patch,
               max(l.observed_at) AS seen
        FROM latest l JOIN iot.entity e ON e.id = l.entity_id
        WHERE e.state -> l.attribute IS NULL
           OR (e.state -> l.attribute ->> 'observed_at')::timestamptz <= l.observed_at
        GROUP BY l.entity_id
    )
    UPDATE iot.entity e SET state = e.state || m.patch, last_seen_at = greatest(e.last_seen_at, m.seen)
    FROM merged m WHERE e.id = m.entity_id;
    RETURN NULL;
END $$;

CREATE TRIGGER measurement_latest AFTER INSERT ON iot.measurement
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION iot.measurement_latest();

CREATE TABLE iot.incident (
    tenant_id        uuid NOT NULL,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL,
    entity_id        uuid NOT NULL,
    attribute        text NOT NULL,
    side             text NOT NULL CHECK (side IN ('above', 'below')),
    threshold        double precision NOT NULL,
    started_at       timestamptz NOT NULL,
    ended_at         timestamptz,
    minutes          int NOT NULL CHECK (minutes >= 0),
    peak             double precision NOT NULL,
    severity         text NOT NULL CHECK (severity IN ('critical', 'warning')),
    status           text NOT NULL CHECK (status IN ('open', 'closed')),
    acknowledged_by  uuid,
    acknowledged_at  timestamptz,
    ack_note         text CHECK (ack_note IS NULL OR length(ack_note) <= 1000),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id, entity_id) REFERENCES iot.entity (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, acknowledged_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON iot.incident (tenant_id, entity_id, started_at DESC);

CREATE FUNCTION iot.acknowledge(p_id uuid, p_person uuid, p_note text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v iot.incident;
BEGIN
    SELECT * INTO v FROM iot.incident WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM core.person WHERE id = p_person AND tenant_id = v.tenant_id) THEN
        RAISE EXCEPTION 'Không tìm thấy sự cố' USING ERRCODE = 'data_exception';
    END IF;
    IF v.acknowledged_at IS NOT NULL THEN
        RAISE EXCEPTION 'Sự cố đã được ghi nhận' USING ERRCODE = 'data_exception';
    END IF;
    IF nullif(btrim(p_note), '') IS NULL THEN
        RAISE EXCEPTION 'Ghi hướng xử lý khi ghi nhận sự cố' USING ERRCODE = 'data_exception';
    END IF;
    UPDATE iot.incident SET acknowledged_by = p_person, acknowledged_at = now(), ack_note = btrim(p_note)
    WHERE id = p_id;
END $$;

CALL audit.enable('iot.incident');

CREATE TABLE meta.lineage_node (
    id        text PRIMARY KEY,
    layer     text NOT NULL CHECK (layer IN ('source', 'stream', 'lake', 'serving', 'consumer')),
    tech      text NOT NULL,
    name      text NOT NULL,
    fqn       text NOT NULL UNIQUE,
    title     text NOT NULL,
    owner     text NOT NULL,
    used_by   text,
    app_link  text
);

CREATE TABLE meta.lineage_edge (
    from_node  text NOT NULL REFERENCES meta.lineage_node ON DELETE CASCADE,
    to_node    text NOT NULL REFERENCES meta.lineage_node ON DELETE CASCADE,
    columns    text[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (from_node, to_node),
    CHECK (from_node <> to_node)
);

CREATE TABLE meta.quality_check (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id     text NOT NULL REFERENCES meta.lineage_node ON DELETE CASCADE,
    rule        text NOT NULL,
    name        text NOT NULL,
    passed      boolean NOT NULL,
    detail      text NOT NULL,
    checked_at  timestamptz NOT NULL
);
CREATE INDEX ON meta.quality_check (node_id, checked_at DESC);

CREATE TABLE meta.pipeline_run (
    id          text PRIMARY KEY,
    task        text NOT NULL,
    engine      text NOT NULL,
    node_id     text NOT NULL REFERENCES meta.lineage_node ON DELETE CASCADE,
    started_at  timestamptz NOT NULL,
    duration_s  int NOT NULL CHECK (duration_s >= 0),
    result      text NOT NULL CHECK (result IN ('success', 'check_failed', 'failed', 'running'))
);

CREATE TABLE meta.data_issue (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id      text NOT NULL REFERENCES meta.lineage_node,
    reported_by  uuid NOT NULL,
    severity     text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    description  text NOT NULL CHECK (length(btrim(description)) BETWEEN 5 AND 2000),
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, reported_by) REFERENCES core.person (tenant_id, id)
);
CALL audit.enable('meta.data_issue');

CREATE TABLE kpi.definition (
    tenant_id       uuid NOT NULL REFERENCES core.tenant,
    key             text NOT NULL,
    label           text NOT NULL,
    unit            text NOT NULL,
    good_direction  text NOT NULL CHECK (good_direction IN ('up', 'down', 'neutral')),
    threshold       double precision,
    grain           text NOT NULL CHECK (grain IN ('hour', 'day', 'week', 'month')),
    lineage_node    text REFERENCES meta.lineage_node,
    definition      text NOT NULL,
    PRIMARY KEY (tenant_id, key)
);

CREATE TABLE kpi.value (
    tenant_id     uuid NOT NULL,
    kpi_key       text NOT NULL,
    period_start  timestamptz NOT NULL,
    value         double precision NOT NULL,
    PRIMARY KEY (tenant_id, kpi_key, period_start),
    FOREIGN KEY (tenant_id, kpi_key) REFERENCES kpi.definition (tenant_id, key) ON DELETE CASCADE
);

CREATE TABLE kpi.pin (
    tenant_id   uuid NOT NULL,
    person_id   uuid NOT NULL,
    kpi_key     text NOT NULL,
    position    int NOT NULL CHECK (position BETWEEN 1 AND 6),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, person_id, kpi_key),
    FOREIGN KEY (tenant_id, kpi_key) REFERENCES kpi.definition (tenant_id, key) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);

CREATE FUNCTION kpi.pin_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT count(*) FROM kpi.pin WHERE tenant_id = NEW.tenant_id AND person_id = NEW.person_id) > 6 THEN
        RAISE EXCEPTION 'Ghim tối đa 6 KPI' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER pin_limit AFTER INSERT ON kpi.pin FOR EACH ROW EXECUTE FUNCTION kpi.pin_limit();
