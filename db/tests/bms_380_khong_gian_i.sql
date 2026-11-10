-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();
SELECT test.person('TDX', 'bi1', 'Người dựng biểu đồ');

INSERT INTO kpi.chart (tenant_id, person_id, name, chart_type, spec)
VALUES (test.id('TDX'), test.id('bi1'), 'Đề nghị theo tháng', 'bar', '{"source": "proc_purchase_request", "metrics": ["request_count"]}');

SELECT test.ok((SELECT kpi.chart_is_mine(c, json_build_object('x-hasura-user-id', test.id('bi1'))) FROM kpi.chart c),
               'biểu đồ của người gọi');
SELECT test.ok(NOT (SELECT kpi.chart_is_mine(c, json_build_object('x-hasura-user-id', test.id('c'))) FROM kpi.chart c),
               'biểu đồ của người khác');

SELECT test.throws($$ INSERT INTO kpi.chart (tenant_id, person_id, name, chart_type, spec)
                      VALUES (test.id('TDX'), test.id('bi1'), 'x', 'radar', '{"metrics": []}') $$,
                   '%chart_type%', 'kiểu biểu đồ ngoài danh sách');
SELECT test.throws($$ INSERT INTO kpi.chart (tenant_id, person_id, name, chart_type, spec)
                      VALUES (test.id('TDX'), test.id('bi1'), 'x', 'bar', '{"source": "a"}') $$,
                   '%spec%', 'định nghĩa phải có danh sách chỉ số');
SELECT test.throws($$ INSERT INTO kpi.chart (tenant_id, person_id, name, chart_type, spec)
                      VALUES (test.id('TDX'), test.id('bi1'), '  ', 'bar', '{"metrics": []}') $$,
                   '%name%', 'tên không được trống');

INSERT INTO kpi.chart (tenant_id, person_id, name, chart_type, spec)
SELECT test.id('TDX'), test.id('bi1'), 'Biểu đồ ' || n, 'line', '{"metrics": ["request_count"]}'
FROM generate_series(2, 50) n;
SELECT test.throws($$ INSERT INTO kpi.chart (tenant_id, person_id, name, chart_type, spec)
                      VALUES (test.id('TDX'), test.id('bi1'), 'Thứ 51', 'bar', '{"metrics": []}') $$,
                   '%tối đa 50%', 'mỗi người lưu tối đa 50 biểu đồ');

UPDATE kpi.chart SET updated_at = now() - interval '1 day' WHERE name = 'Đề nghị theo tháng';
UPDATE kpi.chart SET shared = true WHERE name = 'Đề nghị theo tháng';
SELECT test.ok((SELECT updated_at > now() - interval '1 minute' FROM kpi.chart WHERE name = 'Đề nghị theo tháng'),
               'sửa biểu đồ thì cập nhật updated_at');

DELETE FROM kpi.chart WHERE person_id = test.id('bi1') AND name <> 'Đề nghị theo tháng';
SELECT test.eq((SELECT count(*)::int FROM kpi.chart WHERE tenant_id = test.id('TDX')), 1, 'còn một biểu đồ');

SELECT test.eq((SELECT column_default FROM information_schema.columns
                WHERE table_schema = 'core' AND table_name = 'ai_question' AND column_name = 'attempts'), '0',
               'số lần thử lại mặc định 0');
