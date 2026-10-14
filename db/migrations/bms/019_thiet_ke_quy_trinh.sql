-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

INSERT INTO core.permission (code, description) VALUES
    ('wf.process.design', 'Thiết kế, kiểm tra, chạy thử và phát hành quy trình BPMN của tenant');

CREATE TABLE wf.process_model (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    process_key  text NOT NULL CHECK (process_key ~ '^[A-Za-z_][A-Za-z0-9_-]{1,63}$'),
    name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
    description  text,
    bpmn_xml     text NOT NULL CHECK (length(bpmn_xml) <= 2000000),
    forms        jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(forms) = 'array'),
    created_by   uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   uuid,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, process_key)
);
CALL audit.enable('wf.process_model');

CREATE TABLE wf.process_version (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id      uuid NOT NULL,
    version       int NOT NULL CHECK (version > 0),
    bpmn_xml      text NOT NULL,
    forms         jsonb NOT NULL,
    sha256        text NOT NULL,
    note          text,
    published_by  uuid NOT NULL,
    published_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (model_id, version),
    FOREIGN KEY (tenant_id, model_id) REFERENCES wf.process_model (tenant_id, id) ON DELETE CASCADE
);
CREATE TRIGGER append_only BEFORE UPDATE ON wf.process_version
FOR EACH ROW EXECUTE FUNCTION audit.append_only();
CALL audit.enable('wf.process_version');

CREATE TABLE wf.sandbox_run (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id     uuid NOT NULL,
    xml_sha256   text NOT NULL,
    status       text NOT NULL CHECK (status IN ('COMPLETED', 'STOPPED', 'FAILED')),
    steps        jsonb NOT NULL DEFAULT '[]',
    variables    jsonb NOT NULL DEFAULT '{}',
    error        text,
    started_by   uuid NOT NULL,
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    FOREIGN KEY (tenant_id, model_id) REFERENCES wf.process_model (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ON wf.sandbox_run (model_id, started_at DESC);
