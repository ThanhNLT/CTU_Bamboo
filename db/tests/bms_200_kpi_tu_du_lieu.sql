SELECT test.fixture();

SELECT test.pr('kpi_dung_han', 'c', 'P_NV_MH_DT', 20000000);
SELECT test.pr('kpi_tre_han', 'c', 'P_NV_MH_DT', 20000000);
UPDATE wf.task SET created_at = now() - interval '3 days' WHERE id = (test.open_task('kpi_tre_han')).id;
SELECT wf.act((test.open_task('kpi_dung_han')).id, test.id('tp_mh_dt'), 'APPROVE');
SELECT wf.act((test.open_task('kpi_tre_han')).id, test.id('tp_mh_dt'), 'APPROVE');

SELECT test.eq(kpi.on_time_rate(test.id('TDX'), now() - interval '1 minute', now() + interval '1 minute'), 50::double precision,
               'Một bước xong trong 48 giờ, một bước trễ: 50%');
SELECT test.ok(kpi.on_time_rate(test.id('TDX'), now() + interval '1 day', now() + interval '2 days') IS NULL,
               'Không có bước duyệt nào thì không có giá trị');

INSERT INTO kpi.definition (tenant_id, key, label, unit, good_direction, grain, definition) VALUES
    (test.id('TDX'), 'on-time', 'Duyệt đúng hạn', '%', 'up', 'day', 'x'),
    (test.id('TDX'), 'pr-value', 'Giá trị mua sắm đã duyệt', 'tỷ đồng', 'neutral', 'month', 'x'),
    (test.id('TDX'), 'lots-on-hold', 'Lô đang giữ', 'lô', 'down', 'week', 'x');
INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value) VALUES (test.id('TDX'), 'on-time', '2020-01-01', 1);
SELECT kpi.refresh();

SELECT test.eq((SELECT value FROM kpi.value WHERE tenant_id = test.id('TDX') AND kpi_key = 'on-time'
                ORDER BY period_start DESC LIMIT 1),
               kpi.on_time_rate(test.id('TDX'),
                                date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                                    - interval '29 days', now()),
               'KPI Duyệt đúng hạn mới nhất = tỷ lệ 30 ngày gần nhất, cùng cách tính với Trung tâm điều hành');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM kpi.value WHERE kpi_key = 'on-time' AND period_start = '2020-01-01'),
               'Giá trị cũ của KPI tính từ dữ liệu được thay hết');
SELECT test.ok((SELECT value FROM kpi.value WHERE tenant_id = test.id('TDX') AND kpi_key = 'pr-value'
                ORDER BY period_start DESC LIMIT 1) >= 0.04,
               'Giá trị mua sắm đã duyệt trong tháng gồm hai đề nghị vừa duyệt');
SELECT test.eq((SELECT value FROM kpi.value WHERE tenant_id = test.id('TDX') AND kpi_key = 'lots-on-hold'
                ORDER BY period_start DESC LIMIT 1),
               (SELECT count(*)::double precision FROM mfg.lot WHERE tenant_id = test.id('TDX') AND status = 'ON_HOLD'),
               'Lô đang giữ tuần này đếm trực tiếp từ bảng lô');
SELECT kpi.refresh();
SELECT test.eq((SELECT count(*) FROM kpi.value WHERE tenant_id = test.id('TDX') AND kpi_key = 'lots-on-hold'), 1::bigint,
               'Chạy lại không tạo trùng điểm của tuần hiện tại');
