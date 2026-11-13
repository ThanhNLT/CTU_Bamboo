-- Bamboo - DX-OS Open-Core
-- @version 0.5.0
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

CREATE TABLE audit.backup_run (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind         text NOT NULL CHECK (kind IN ('BACKUP', 'DRILL')),
    status       text NOT NULL CHECK (status IN ('OK', 'FAILED')),
    location     text,
    size_bytes   bigint,
    detail       jsonb NOT NULL DEFAULT '{}',
    started_at   timestamptz NOT NULL,
    finished_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit.backup_run (kind, finished_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.backup_run
FOR EACH ROW EXECUTE FUNCTION audit.append_only();

DROP TRIGGER org_unit_after_move ON core.org_unit;
CREATE TRIGGER org_unit_after_move AFTER UPDATE OF parent_id ON core.org_unit
FOR EACH ROW WHEN (OLD.path::text IS DISTINCT FROM NEW.path::text)
EXECUTE FUNCTION core.org_unit_after_move();
