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

CREATE TABLE core.ingest_job (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text NOT NULL,
    idempotency_key  text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    mode             text NOT NULL CHECK (mode IN ('BEST_EFFORT', 'ATOMIC')),
    dry_run          boolean NOT NULL DEFAULT false,
    status           text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'DONE', 'PARTIAL', 'FAILED', 'VALIDATED')),
    total            int NOT NULL DEFAULT 0,
    accepted         int NOT NULL DEFAULT 0,
    rejected         int NOT NULL DEFAULT 0,
    errors           jsonb NOT NULL DEFAULT '[]',
    failure          text,
    source_bytes     bigint NOT NULL DEFAULT 0,
    source_sha256    text,
    started_by       uuid NOT NULL,
    started_at       timestamptz NOT NULL DEFAULT now(),
    finished_at      timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, kind, idempotency_key),
    FOREIGN KEY (tenant_id, started_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON core.ingest_job (tenant_id, started_at DESC);
CALL audit.enable('core.ingest_job');
