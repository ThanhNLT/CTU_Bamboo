-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();

INSERT INTO pm.project (tenant_id, id, code, name, org_unit_id, manager_id, start_date, end_date, created_by)
VALUES (test.id('TDX'), test.put('DA', gen_random_uuid()), 'ERP-2027', 'Triển khai ERP', test.id('DT_MH'),
        test.id('tp_mh_dt'), '2026-11-02', '2026-12-31', test.id('tp_mh_dt'));
INSERT INTO pm.member (tenant_id, project_id, person_id, role)
VALUES (test.id('TDX'), test.id('DA'), test.id('c'), 'MEMBER');

SELECT test.ok(pm.can_read(test.id('DA'), test.id('tp_mh_dt')) AND pm.can_manage(test.id('DA'), test.id('tp_mh_dt')),
               'người quản lý xem và sửa');
SELECT test.ok(pm.can_read(test.id('DA'), test.id('c')) AND NOT pm.can_manage(test.id('DA'), test.id('c')),
               'thành viên chỉ xem');
SELECT test.ok(NOT pm.can_read(test.id('DA'), test.id('a')), 'người ngoài không xem');
SELECT test.throws($$ INSERT INTO pm.project (tenant_id, code, name, org_unit_id, manager_id, start_date, end_date, created_by)
                      VALUES (test.id('TDX'), 'erp 2027', 'x', test.id('DT_MH'), test.id('c'), '2026-11-02',
                              '2026-11-01', test.id('c')) $$, '%check%', 'mã dự án viết hoa, ngày hợp lệ');

INSERT INTO pm.task (tenant_id, id, project_id, seq, name, start_date, end_date, progress)
VALUES (test.id('TDX'), test.put('T1', gen_random_uuid()), test.id('DA'), 1, 'Khảo sát', '2026-11-02', '2026-11-06', 100),
       (test.id('TDX'), test.put('T2', gen_random_uuid()), test.id('DA'), 2, 'Triển khai', '2026-11-09', '2026-11-20', 0);
INSERT INTO pm.task (tenant_id, id, project_id, parent_id, seq, name, start_date, end_date, progress, milestone)
VALUES (test.id('TDX'), test.put('T21', gen_random_uuid()), test.id('DA'), test.id('T2'), 1, 'Cài đặt', '2026-11-09',
        '2026-11-18', 50, false),
       (test.id('TDX'), test.put('T22', gen_random_uuid()), test.id('DA'), test.id('T2'), 2, 'Nghiệm thu', '2026-11-20',
        '2026-11-20', 0, true);

SELECT test.eq((SELECT actual_pct FROM pm.stats(test.id('DA'), '2026-11-13')), 66.67::numeric, 'thực hiện bình quân theo ngày');
SELECT test.eq((SELECT planned_pct FROM pm.stats(test.id('DA'), '2026-11-13')), 66.67::numeric, 'kế hoạch theo ngày đã trôi qua');
SELECT test.eq((SELECT spi FROM pm.stats(test.id('DA'), '2026-11-13')), 1.000::numeric, 'đúng tiến độ thì SPI = 1');
SELECT test.eq((SELECT late_tasks FROM pm.stats(test.id('DA'), '2026-11-30')), 2, 'qua hạn mà chưa xong là trễ');
SELECT test.eq((SELECT total_tasks FROM pm.stats(test.id('DA'))), 3, 'chỉ đếm công việc lá');

SELECT test.throws($$ INSERT INTO pm.task (tenant_id, project_id, name, start_date, end_date, milestone)
                      VALUES (test.id('TDX'), test.id('DA'), 'x', '2026-11-02', '2026-11-03', true) $$,
                   '%check%', 'mốc không kéo dài');
SELECT test.throws($$ UPDATE pm.task SET parent_id = test.id('T21') WHERE id = test.id('T2') $$,
                   '%con của chính nó%', 'cây công việc không có vòng');

INSERT INTO pm.dependency (tenant_id, project_id, predecessor_id, successor_id)
VALUES (test.id('TDX'), test.id('DA'), test.id('T1'), test.id('T21')),
       (test.id('TDX'), test.id('DA'), test.id('T21'), test.id('T22'));
SELECT test.throws($$ INSERT INTO pm.dependency (tenant_id, project_id, predecessor_id, successor_id)
                      VALUES (test.id('TDX'), test.id('DA'), test.id('T22'), test.id('T1')) $$,
                   '%vòng lặp%', 'không tạo vòng phụ thuộc');
SELECT test.throws($$ INSERT INTO pm.dependency (tenant_id, project_id, predecessor_id, successor_id)
                      VALUES (test.id('TDX'), test.id('DA'), test.id('T2'), test.id('T21')) $$,
                   '%tổng hợp%', 'không phụ thuộc giữa cha và con');

INSERT INTO pm.report (tenant_id, id, project_id, period_from, period_to, health, summary, planned_pct, actual_pct, created_by)
VALUES (test.id('TDX'), test.put('BC', gen_random_uuid()), test.id('DA'), '2026-11-02', '2026-11-13', 'GREEN',
        'Đúng tiến độ', 66.67, 66.67, test.id('tp_mh_dt'));
SELECT test.throws($$ UPDATE pm.report SET summary = 'sửa' WHERE id = test.id('BC') $$, '%không sửa được%',
                   'báo cáo đã lập không sửa');
SELECT test.ok(EXISTS (SELECT FROM audit.log WHERE table_name = 'pm.task'), 'công việc có nhật ký kiểm toán');
SELECT test.eq((SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND schemaname = 'pm'), 0,
               'pm không vào CDC');
