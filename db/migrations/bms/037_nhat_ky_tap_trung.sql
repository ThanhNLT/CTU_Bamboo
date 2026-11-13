-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
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

CREATE SCHEMA obs;

CREATE TABLE obs.log_event (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts         timestamptz NOT NULL DEFAULT now(),
    service    text NOT NULL CHECK (length(service) BETWEEN 1 AND 60),
    level      text NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    logger     text,
    message    text NOT NULL,
    trace_id   text,
    tenant_id  uuid,
    person_id  uuid,
    fields     jsonb
);
CREATE INDEX ON obs.log_event (ts DESC);
CREATE INDEX ON obs.log_event (trace_id, ts) WHERE trace_id IS NOT NULL;
CREATE INDEX ON obs.log_event (service, level, ts DESC);
CREATE INDEX ON obs.log_event (tenant_id, ts DESC);

CREATE FUNCTION obs.purge(p_keep interval DEFAULT interval '14 days', p_keep_errors interval DEFAULT interval '60 days')
RETURNS int
LANGUAGE sql AS $$
    WITH gone AS (
        DELETE FROM obs.log_event
        WHERE (level IN ('ERROR', 'CRITICAL') AND ts < now() - p_keep_errors)
           OR (level NOT IN ('ERROR', 'CRITICAL') AND ts < now() - p_keep)
        RETURNING 1)
    SELECT count(*)::int FROM gone
$$;
