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

ALTER TABLE iot.entity ADD COLUMN live_source text CHECK (live_source IN ('mqtt', 'api'));
COMMENT ON COLUMN iot.entity.live_source IS 'Nguồn số đo trực tiếp gần nhất; NULL = chỉ có dữ liệu mẫu (ADR #50)';

CREATE SEQUENCE iot.incident_live_seq;

CREATE FUNCTION iot.ingest(p_tenant uuid, p_entity text, p_values jsonb, p_observed timestamptz DEFAULT now(),
                           p_source text DEFAULT 'mqtt') RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_entity iot.entity;
    v_attrs  jsonb;
    v_key    text;
    v_value  double precision;
    v_attr   jsonb;
    v_side   text;
    v_limit  double precision;
    v_open   iot.incident;
    v_n      int := 0;
BEGIN
    SELECT * INTO v_entity FROM iot.entity
    WHERE tenant_id = p_tenant AND (code = p_entity OR urn = p_entity) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy thiết bị %', p_entity USING ERRCODE = 'data_exception';
    END IF;
    IF jsonb_typeof(p_values) <> 'object' OR p_values = '{}' THEN
        RAISE EXCEPTION 'Số đo phải là đối tượng {thuộc tính: giá trị}' USING ERRCODE = 'data_exception';
    END IF;
    IF p_observed > now() + interval '5 minutes' OR p_observed < now() - interval '7 days' THEN
        RAISE EXCEPTION 'Thời điểm đo % lệch quá xa giờ hệ thống', p_observed USING ERRCODE = 'data_exception';
    END IF;
    SELECT jsonb_object_agg(a ->> 'key', a) INTO v_attrs FROM iot.model m, jsonb_array_elements(m.attributes) a
    WHERE m.type = v_entity.type;
    SELECT k INTO v_key FROM jsonb_object_keys(p_values) k WHERE NOT v_attrs ? k LIMIT 1;
    IF v_key IS NOT NULL THEN
        RAISE EXCEPTION 'Thuộc tính % không có trong mô hình %', v_key, v_entity.type USING ERRCODE = 'data_exception';
    END IF;

    FOR v_key, v_value IN
        SELECT k, CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::double precision END
        FROM jsonb_each(p_values) AS e(k, v)
    LOOP
        IF v_value IS NULL OR v_value = 'NaN'::double precision OR abs(v_value) = 'Infinity'::double precision THEN
            RAISE EXCEPTION 'Giá trị của % phải là số', v_key USING ERRCODE = 'data_exception';
        END IF;
        INSERT INTO iot.measurement (tenant_id, entity_id, attribute, observed_at, value)
        VALUES (p_tenant, v_entity.id, v_key, p_observed, v_value)
        ON CONFLICT (entity_id, attribute, observed_at) DO UPDATE SET value = EXCLUDED.value;
        v_n := v_n + 1;

        v_attr := v_attrs -> v_key;
        v_side := CASE WHEN (v_attr ->> 'max') IS NOT NULL AND v_value > (v_attr ->> 'max')::double precision THEN 'above'
                       WHEN (v_attr ->> 'min') IS NOT NULL AND v_value < (v_attr ->> 'min')::double precision THEN 'below'
                  END;
        SELECT * INTO v_open FROM iot.incident
        WHERE entity_id = v_entity.id AND attribute = v_key AND status = 'open' ORDER BY started_at DESC LIMIT 1;
        IF v_open.id IS NOT NULL AND (v_side IS NULL OR v_side <> v_open.side) THEN
            UPDATE iot.incident SET status = 'closed', ended_at = greatest(p_observed, started_at),
                   minutes = greatest(0, floor(extract(epoch FROM (greatest(p_observed, started_at) - started_at)) / 60))::int
            WHERE id = v_open.id;
            v_open := NULL;
        END IF;
        IF v_side IS NOT NULL THEN
            v_limit := (v_attr ->> CASE v_side WHEN 'above' THEN 'max' ELSE 'min' END)::double precision;
            IF v_open.id IS NULL THEN
                INSERT INTO iot.incident (tenant_id, code, entity_id, attribute, side, threshold, started_at, minutes,
                                          peak, severity, status)
                VALUES (p_tenant, 'RT-' || lpad(nextval('iot.incident_live_seq')::text, 6, '0'), v_entity.id, v_key,
                        v_side, v_limit, p_observed, 0, v_value,
                        CASE WHEN abs(v_value - v_limit) > greatest(abs(v_limit) * 0.1, 1) THEN 'critical'
                             ELSE 'warning' END,
                        'open');
            ELSE
                UPDATE iot.incident SET
                    peak = CASE v_side WHEN 'above' THEN greatest(peak, v_value) ELSE least(peak, v_value) END,
                    minutes = greatest(minutes, floor(extract(epoch FROM (p_observed - started_at)) / 60)::int),
                    severity = CASE WHEN severity = 'critical'
                                      OR abs(v_value - v_limit) > greatest(abs(v_limit) * 0.1, 1) THEN 'critical'
                                    ELSE 'warning' END
                WHERE id = v_open.id;
            END IF;
        END IF;
    END LOOP;

    UPDATE iot.entity SET connection_state = 'online', live_source = p_source WHERE id = v_entity.id;
    RETURN v_n;
END $$;
COMMENT ON FUNCTION iot.ingest IS 'Nạp một lần đo của thiết bị (mã hoặc URN NGSI-LD) trong công ty; trả số giá trị đã ghi';

CREATE FUNCTION iot.mark_offline(p_minutes int DEFAULT 15) RETURNS int
LANGUAGE sql AS $$
    WITH changed AS (
        UPDATE iot.entity SET connection_state = 'offline'
        WHERE live_source IS NOT NULL AND connection_state = 'online'
          AND last_seen_at < now() - make_interval(mins => p_minutes)
        RETURNING 1)
    SELECT count(*)::int FROM changed
$$;

CREATE TABLE iot.mqtt_account (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    username    text PRIMARY KEY CHECK (username ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
    label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
    created_by  uuid NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz,
    revoked_by  uuid,
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, revoked_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX mqtt_account_tenant ON iot.mqtt_account (tenant_id);
CALL audit.enable('iot.mqtt_account', 'username');

INSERT INTO core.permission (code, description)
VALUES ('iot.ingest', 'Gửi số đo thiết bị vào bản sao số của đơn vị (qua cổng API, NGSI-LD)');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT DISTINCT tenant_id, role_id, 'iot.ingest' FROM core.role_permission WHERE permission_code = 'core.org.manage';
