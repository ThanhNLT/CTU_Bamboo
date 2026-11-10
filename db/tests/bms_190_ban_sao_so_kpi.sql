SELECT test.fixture();

INSERT INTO iot.model (type, kind, category, grade, attributes)
VALUES ('CleanRoom', 'Phòng sạch', 'cleanroom', 'ISO 5', '[{"key": "particles05", "max": 3520}]');
INSERT INTO iot.site (tenant_id, code, org_unit_id, name) VALUES (test.id('TDX'), 'chip-bn', test.id('CHIP'), 'Nhà máy');
INSERT INTO iot.entity (tenant_id, code, urn, type, name, site_code, org_unit_id)
VALUES (test.id('TDX'), 'CR-02', 'urn:ngsi-ld:CleanRoom:t:CR-02', 'CleanRoom', 'Phòng sạch CR-02', 'chip-bn',
        test.id('CHIP'))
RETURNING test.put('E', id);

INSERT INTO iot.measurement (tenant_id, entity_id, attribute, observed_at, value) VALUES
    (test.id('TDX'), test.id('E'), 'particles05', now() - interval '10 minutes', 3600),
    (test.id('TDX'), test.id('E'), 'particles05', now(), 3120),
    (test.id('TDX'), test.id('E'), 'particles05', now() - interval '5 minutes', 3700);
SELECT test.eq((SELECT (state -> 'particles05' ->> 'value')::numeric FROM iot.entity WHERE id = test.id('E')), 3120::numeric,
               'Giá trị mới nhất theo thời điểm đo, không theo thứ tự ghi');

INSERT INTO iot.incident (tenant_id, code, entity_id, attribute, side, threshold, started_at, minutes, peak, severity,
                          status)
VALUES (test.id('TDX'), 'SC-1', test.id('E'), 'particles05', 'above', 3520, now() - interval '10 minutes', 10, 3700,
        'critical', 'open')
RETURNING test.put('I', id);
SELECT test.throws($$SELECT iot.acknowledge(test.id('I'), test.id('a'), ' ')$$, '%hướng xử lý%', 'Phải ghi hướng xử lý');
SELECT test.throws($$SELECT iot.acknowledge(test.id('I'), (SELECT id FROM core.person WHERE tenant_id = test.id('BVX')
                                                           LIMIT 1), 'x')$$,
                   '%Không tìm thấy%', 'Người tenant khác không ghi nhận được');
SELECT iot.acknowledge(test.id('I'), test.id('a'), 'Đã thay bộ lọc');
SELECT test.ok((SELECT acknowledged_by = test.id('a') AND ack_note = 'Đã thay bộ lọc' FROM iot.incident
                WHERE id = test.id('I')), 'Ghi người và hướng xử lý');
SELECT test.throws($$SELECT iot.acknowledge(test.id('I'), test.id('c'), 'lần nữa')$$, '%đã được ghi nhận%',
                   'Chỉ ghi nhận một lần');

INSERT INTO kpi.definition (tenant_id, key, label, unit, good_direction, grain, definition)
SELECT test.id('TDX'), 'k' || g, 'KPI ' || g, '%', 'up', 'month', 'x' FROM generate_series(1, 7) g;
INSERT INTO kpi.pin (tenant_id, person_id, kpi_key, position)
SELECT test.id('TDX'), test.id('a'), 'k' || g, g FROM generate_series(1, 6) g;
SELECT test.throws($$INSERT INTO kpi.pin (tenant_id, person_id, kpi_key, position)
                     VALUES (test.id('TDX'), test.id('a'), 'k7', 6)$$, '%tối đa 6%', 'Ghim tối đa 6 KPI');
