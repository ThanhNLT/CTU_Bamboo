SELECT test.fixture();

INSERT INTO iot.model (type, kind, category, grade, attributes)
VALUES ('CleanRoom', 'Phòng sạch', 'cleanroom', 'ISO 5',
        '[{"key": "particles05", "max": 3520}, {"key": "temperature", "min": 20, "max": 22}]');
INSERT INTO iot.site (tenant_id, code, org_unit_id, name) VALUES (test.id('TDX'), 'chip-bn', test.id('CHIP'), 'Nhà máy');
INSERT INTO iot.entity (tenant_id, code, urn, type, name, site_code, org_unit_id)
VALUES (test.id('TDX'), 'CR-09', 'urn:ngsi-ld:CleanRoom:t:CR-09', 'CleanRoom', 'Phòng sạch CR-09', 'chip-bn',
        test.id('CHIP'))
RETURNING test.put('E', id);

SELECT test.eq(iot.ingest(test.id('TDX'), 'CR-09', '{"particles05": 3000, "temperature": 21.2}',
                          now() - interval '20 minutes'), 2, 'ghi hai giá trị');
SELECT test.eq((SELECT (connection_state, live_source)::text FROM iot.entity WHERE id = test.id('E')),
               ('online', 'mqtt')::text, 'đánh dấu thiết bị có số đo trực tiếp');
SELECT test.eq((SELECT (state -> 'temperature' ->> 'value')::numeric FROM iot.entity WHERE id = test.id('E')), 21.2,
               'trigger cũ vẫn giữ giá trị mới nhất');

SELECT iot.ingest(test.id('TDX'), 'urn:ngsi-ld:CleanRoom:t:CR-09', '{"particles05": 3600}', now() - interval '15 minutes');
SELECT test.eq((SELECT (side, threshold, peak, severity, status)::text FROM iot.incident WHERE entity_id = test.id('E')),
               ('above', 3520, 3600, 'warning', 'open')::text, 'vượt nhẹ: cảnh báo');
SELECT iot.ingest(test.id('TDX'), 'CR-09', '{"particles05": 4200}', now() - interval '10 minutes');
SELECT test.eq((SELECT (peak, severity, minutes, count(*) OVER ())::text FROM iot.incident WHERE entity_id = test.id('E')),
               (4200, 'critical', 5, 1)::text, 'cùng một sự cố, đỉnh và mức tăng');
SELECT iot.ingest(test.id('TDX'), 'CR-09', '{"particles05": 3100}', now() - interval '5 minutes');
SELECT test.eq((SELECT (status, minutes)::text FROM iot.incident WHERE entity_id = test.id('E')), ('closed', 10)::text,
               'về ngưỡng thì đóng sự cố');
SELECT iot.ingest(test.id('TDX'), 'CR-09', '{"temperature": 19.4}', now());
SELECT test.eq((SELECT (side, threshold, status)::text FROM iot.incident
                WHERE entity_id = test.id('E') AND attribute = 'temperature'), ('below', 20, 'open')::text,
               'dưới ngưỡng dưới');

SELECT test.throws($$SELECT iot.ingest(test.id('TDX'), 'CR-09', '{"pressure": 1}')$$, '%không có trong mô hình%',
                   'thuộc tính lạ');
SELECT test.throws($$SELECT iot.ingest(test.id('TDX'), 'CR-09', '{"temperature": "nóng"}')$$, '%phải là số%',
                   'giá trị không phải số');
SELECT test.throws($$SELECT iot.ingest(test.id('BVX'), 'CR-09', '{"temperature": 21}')$$, '%Không tìm thấy thiết bị%',
                   'công ty khác không ghi được vào thiết bị');
SELECT test.throws($$SELECT iot.ingest(test.id('TDX'), 'CR-09', '{"temperature": 21}', now() + interval '1 hour')$$,
                   '%lệch quá xa%', 'thời điểm ở tương lai');

INSERT INTO iot.entity (tenant_id, code, urn, type, name, site_code, org_unit_id, last_seen_at)
VALUES (test.id('TDX'), 'CR-MAU', 'urn:ngsi-ld:CleanRoom:t:CR-MAU', 'CleanRoom', 'Mẫu', 'chip-bn', test.id('CHIP'),
        now() - interval '2 days');
UPDATE iot.entity SET last_seen_at = now() - interval '1 hour' WHERE id = test.id('E');
SELECT test.eq(iot.mark_offline(15), 1, 'một thiết bị trực tiếp im lặng quá 15 phút');
SELECT test.eq((SELECT connection_state FROM iot.entity WHERE code = 'CR-MAU'), 'online', 'dữ liệu mẫu giữ nguyên');

SELECT test.throws($$INSERT INTO iot.mqtt_account (tenant_id, username, label, created_by)
                     VALUES (test.id('TDX'), 'TDX_Gateway', 'x', test.id('c'))$$, '%check%', 'tên đăng nhập MQTT viết thường');
