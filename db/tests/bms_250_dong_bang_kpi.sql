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

SELECT test.fixture();

INSERT INTO kpi.definition (tenant_id, key, label, unit, good_direction, grain, definition) VALUES
    (test.id('TDX'), 'k-day', 'Theo ngày', 'x', 'up', 'day', 'x'),
    (test.id('TDX'), 'k-week', 'Theo tuần', 'x', 'up', 'week', 'x'),
    (test.id('TDX'), 'k-month', 'Theo tháng', 'x', 'up', 'month', 'x');

INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value)
SELECT test.id('TDX'), 'k-day', d, 10 FROM (VALUES
    (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '2 days'),
    (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')) t(d);
INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value)
SELECT test.id('TDX'), 'k-week', d, 20 FROM (VALUES
    (date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '7 days'),
    (date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')) t(d);
INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value)
SELECT test.id('TDX'), 'k-month', d, 30 FROM (VALUES
    (date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '1 month'),
    (date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')) t(d);

SELECT test.eq(kpi.freeze(), 3, 'chỉ chụp ba kỳ đã kết thúc, bỏ qua ba kỳ đang chạy');
SELECT test.eq(kpi.freeze(), 0, 'chạy lại không chụp thêm');
SELECT test.eq((SELECT count(*)::int FROM kpi.snapshot WHERE tenant_id = test.id('TDX')), 3, 'có ba bản chụp');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM kpi.snapshot WHERE period_end > now()), 'không có bản chụp của kỳ chưa đóng');
SELECT test.eq((SELECT value FROM kpi.snapshot WHERE kpi_key = 'k-week'), 20::double precision, 'giữ đúng giá trị');

UPDATE kpi.value SET value = 99 WHERE kpi_key = 'k-week';
SELECT kpi.freeze();
SELECT test.eq((SELECT value FROM kpi.snapshot WHERE kpi_key = 'k-week'), 20::double precision,
               'bản chụp không đổi theo giá trị tính lại');

SELECT test.eq(kpi.freeze(now() + interval '40 days'), 3, 'sau 40 ngày, ba kỳ hiện tại đã đóng');

SELECT test.throws($$ UPDATE kpi.snapshot SET value = 1 $$, '%đóng băng%', 'không sửa bản chụp');
SELECT test.throws($$ DELETE FROM kpi.snapshot $$, '%đóng băng%', 'không xóa bản chụp');
SELECT test.eq((SELECT count(*)::int FROM kpi.verify_snapshots(test.id('TDX'))), 0, 'mã băm khớp');

DELETE FROM kpi.definition WHERE key = 'k-day';
SELECT test.eq((SELECT count(*)::int FROM kpi.snapshot WHERE kpi_key = 'k-day'), 0, 'xóa KPI thì xóa cả bản chụp');

SELECT test.eq((SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND schemaname = 'kpi'
                AND tablename = 'snapshot'), 1, 'kpi.snapshot nằm trong publication CDC');
SELECT test.eq((SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND schemaname = 'kpi'
                AND tablename = 'value'), 0, 'kpi.value không đi vào CDC');
