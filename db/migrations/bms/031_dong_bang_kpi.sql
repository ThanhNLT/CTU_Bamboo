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

CREATE TABLE kpi.snapshot (
    tenant_id     uuid NOT NULL,
    kpi_key       text NOT NULL,
    period_start  timestamptz NOT NULL,
    period_end    timestamptz NOT NULL,
    grain         text NOT NULL CHECK (grain IN ('hour', 'day', 'week', 'month')),
    value         double precision NOT NULL,
    sha256        text NOT NULL,
    frozen_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, kpi_key, period_start),
    FOREIGN KEY (tenant_id, kpi_key) REFERENCES kpi.definition (tenant_id, key) ON DELETE CASCADE,
    CHECK (period_end > period_start)
);
CREATE INDEX ON kpi.snapshot (tenant_id, frozen_at DESC);

CREATE FUNCTION kpi.snapshot_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Số liệu KPI đã đóng băng, không sửa hoặc xóa' USING ERRCODE = 'data_exception';
END $$;
CREATE TRIGGER snapshot_guard BEFORE UPDATE OR DELETE ON kpi.snapshot
FOR EACH ROW EXECUTE FUNCTION kpi.snapshot_guard();

CREATE FUNCTION kpi.period_end(p_start timestamptz, p_grain text) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_grain
        WHEN 'hour' THEN p_start + interval '1 hour'
        WHEN 'day' THEN (p_start AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh'
        WHEN 'week' THEN (p_start AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '7 days') AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ELSE (p_start AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh'
    END
$$;

CREATE FUNCTION kpi.freeze(p_at timestamptz DEFAULT now()) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_count int;
BEGIN
    WITH closed AS (
        SELECT v.tenant_id, v.kpi_key, v.period_start, kpi.period_end(v.period_start, d.grain) AS period_end,
               d.grain, v.value
        FROM kpi.value v JOIN kpi.definition d ON d.tenant_id = v.tenant_id AND d.key = v.kpi_key
    ), ins AS (
        INSERT INTO kpi.snapshot (tenant_id, kpi_key, period_start, period_end, grain, value, sha256, frozen_at)
        SELECT c.tenant_id, c.kpi_key, c.period_start, c.period_end, c.grain, c.value,
               encode(sha256(convert_to(format('%s|%s|%s|%s|%s', c.tenant_id, c.kpi_key, c.period_start, c.period_end,
                                               c.value), 'UTF8')), 'hex'),
               p_at
        FROM closed c
        WHERE c.period_end <= p_at
        ON CONFLICT (tenant_id, kpi_key, period_start) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM ins;
    RETURN v_count;
END $$;

CREATE FUNCTION kpi.verify_snapshots(p_tenant uuid) RETURNS TABLE (kpi_key text, period_start timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT s.kpi_key, s.period_start FROM kpi.snapshot s
    WHERE s.tenant_id = p_tenant
      AND s.sha256 <> encode(sha256(convert_to(format('%s|%s|%s|%s|%s', s.tenant_id, s.kpi_key, s.period_start,
                                                      s.period_end, s.value), 'UTF8')), 'hex')
$$;
