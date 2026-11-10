-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE TABLE wf.process_regulation (
    tenant_id       uuid NOT NULL REFERENCES core.tenant,
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        uuid NOT NULL,
    version         int,
    kb_document_id  uuid NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('SOURCE', 'REGULATION')),
    created_by      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'REGULATION') = (version IS NOT NULL)),
    FOREIGN KEY (tenant_id, model_id) REFERENCES wf.process_model (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (model_id, version) REFERENCES wf.process_version (model_id, version) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, kb_document_id) REFERENCES collab.kb_document (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id)
);
CREATE UNIQUE INDEX process_regulation_one_per_document ON wf.process_regulation (model_id, kb_document_id, kind);
CREATE UNIQUE INDEX process_regulation_one_document_per_version ON wf.process_regulation (kb_document_id)
    WHERE kind = 'REGULATION';
CREATE INDEX ON wf.process_regulation (model_id, kind);
CALL audit.enable('wf.process_regulation');
