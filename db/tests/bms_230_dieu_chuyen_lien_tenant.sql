SELECT test.fixture();

SELECT test.unit('TDX', 'ME_NS', 'ME', 'PHONG', 'Phòng Nhân sự Tập đoàn');
UPDATE core.org_unit SET is_hr = true WHERE id = test.id('ME_NS');
SELECT test.position('TDX', 'P_TP_NS_ME', 'ME_NS', 'Trưởng phòng Nhân sự Tập đoàn', true);
SELECT test.person('TDX', 'nx', 'Nhân sự Tập đoàn');
SELECT test.assign('TDX', 'nx', 'P_TP_NS_ME');

SELECT test.unit('TDX', 'CHIP_NS', 'CHIP', 'PHONG', 'Phòng Nhân sự Chip X');
UPDATE core.org_unit SET is_hr = true WHERE id = test.id('CHIP_NS');
SELECT test.position('TDX', 'P_TP_NS_CHIP', 'CHIP_NS', 'Trưởng phòng Nhân sự Chip X', true);
SELECT test.person('TDX', 'ns_chip', 'Nhân sự Chip X');
SELECT test.assign('TDX', 'ns_chip', 'P_TP_NS_CHIP');

SELECT test.unit('BVX', 'BV', NULL, 'BENH_VIEN', 'Bệnh viện X', true);
SELECT test.unit('BVX', 'BV_KHTH', 'BV', 'PHONG', 'Phòng Kế hoạch tổng hợp');
SELECT test.position('BVX', 'P_TP_KHTH', 'BV_KHTH', 'Trưởng phòng KHTH', true);
SELECT test.position('BVX', 'P_NV_KHTH', 'BV_KHTH', 'Chuyên viên KHTH');
SELECT test.person('BVX', 'bvx_kh', 'Trưởng phòng KHTH BVX');
SELECT test.assign('BVX', 'bvx_kh', 'P_TP_KHTH');
SELECT test.unit('BVX', 'BV_NS', 'BV', 'PHONG', 'Phòng Nhân sự Bệnh viện X');
UPDATE core.org_unit SET is_hr = true WHERE id = test.id('BV_NS');
SELECT test.position('BVX', 'P_TP_NS_BVX', 'BV_NS', 'Trưởng phòng Nhân sự Bệnh viện X', true);
SELECT test.person('BVX', 'bvx_ns', 'Nhân sự Bệnh viện X');
SELECT test.assign('BVX', 'bvx_ns', 'P_TP_NS_BVX');

CREATE FUNCTION test.expect_fail(p_sql text, p_like text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    msg text := 'không báo lỗi';
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        msg := SQLERRM;
    END;
    PERFORM test.ok(msg LIKE p_like, format('lỗi mong đợi %s, nhận: %s', p_like, msg));
END $$;

CREATE FUNCTION test.plus_days(n int) RETURNS date
LANGUAGE sql AS $$ SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + n $$;

CREATE FUNCTION test.wf_open_task(p_type text, p_key text) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT t.id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
    WHERE s.entity_type = p_type AND s.entity_id = test.id(p_key) AND t.status = 'OPEN'
$$;

CREATE FUNCTION test.wf_assignee(p_type text, p_key text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT test.key((SELECT t.assignee_id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
    WHERE s.entity_type = p_type AND s.entity_id = test.id(p_key) AND t.status = 'OPEN')) $$;

SELECT test.put('OUT_R', hr.create_transfer_out(test.id('a'), test.id('a'), test.id('P_NV_KD_CHIP'),
                                                test.id('BVX'), test.id('BV_KHTH'), test.plus_days(20),
                                                'Muốn chuyển sang bệnh viện'));
SELECT hr.submit_transfer_out(test.id('OUT_R'), test.id('a'));
SELECT test.eq(test.wf_assignee('hr.transfer_out', 'OUT_R'), 'tp_kd_chip', 'bước 1: quản lý trực tiếp ở tenant nguồn');
SELECT wf.act(test.wf_open_task('hr.transfer_out', 'OUT_R'), test.id('tp_kd_chip'), 'APPROVE');
SELECT wf.act(test.wf_open_task('hr.transfer_out', 'OUT_R'), test.id('ns_chip'), 'APPROVE');
SELECT test.eq((SELECT stage FROM hr.transfer_out WHERE id = test.id('OUT_R')), 'TARGET', 'sang tenant đích');
SELECT test.put('IN_R', (SELECT id FROM hr.transfer_in WHERE out_id = test.id('OUT_R')));
SELECT test.eq(test.wf_assignee('hr.transfer_in', 'IN_R'), 'bvx_kh', 'tenant đích: trưởng đơn vị tiếp nhận');
SELECT wf.act(test.wf_open_task('hr.transfer_in', 'IN_R'), test.id('bvx_kh'), 'REJECT', 'Không nhận thêm người');
SELECT test.eq((SELECT status FROM hr.transfer_out WHERE id = test.id('OUT_R')), 'REJECTED', 'từ chối lan về tenant nguồn');
SELECT test.eq((SELECT stage FROM hr.transfer_out WHERE id = test.id('OUT_R')), 'DONE', 'chứng từ đi đã kết thúc');
SELECT test.eq((SELECT count(*) FROM core.assignment WHERE person_id = test.id('a') AND position_id = test.id('P_NV_KD_CHIP')
                AND upper_inf(valid_period)), 1::bigint, 'từ chối thì vẫn giữ vị trí cũ');

SELECT test.expect_fail(format('SELECT hr.create_transfer_out(%L,%L,%L,%L,%L,%L,%L)', test.id('a'), test.id('a'),
    test.id('P_NV_KD_CHIP'), test.id('TDX'), test.id('CHIP_KD'), test.plus_days(20), 'x'),
    '%nội bộ%');
SELECT test.put('OUT_A', hr.create_transfer_out(test.id('a'), test.id('a'), test.id('P_NV_KD_CHIP'),
                                                test.id('BVX'), test.id('BV_KHTH'), test.plus_days(20),
                                                'Chuyển sang bệnh viện'));
SELECT test.expect_fail(format('SELECT hr.create_transfer_out(%L,%L,%L,%L,%L,%L,%L)', test.id('a'), test.id('a'),
    test.id('P_NV_KD_CHIP'), test.id('BVX'), test.id('BV_KHTH'), test.plus_days(20), 'y'),
    '%chưa xong%');
SELECT hr.submit_transfer_out(test.id('OUT_A'), test.id('a'));
SELECT wf.act(test.wf_open_task('hr.transfer_out', 'OUT_A'), test.id('tp_kd_chip'), 'APPROVE');
SELECT wf.act(test.wf_open_task('hr.transfer_out', 'OUT_A'), test.id('ns_chip'), 'APPROVE');
SELECT test.put('IN_A', (SELECT id FROM hr.transfer_in WHERE out_id = test.id('OUT_A')));
SELECT test.expect_fail(format('SELECT wf.act(%L,%L,%L)', test.wf_open_task('hr.transfer_in', 'IN_A'),
    test.id('bvx_ns'), 'APPROVE'), '%Không có quyền xử lý%');
SELECT test.expect_fail(format('SELECT hr.choose_transfer_in_position(%L,%L,%L)', test.id('IN_A'),
    test.id('bvx_ns'), test.id('P_NV_KHTH')), '%Chỉ trưởng đơn vị tiếp nhận%');
SELECT hr.choose_transfer_in_position(test.id('IN_A'), test.id('bvx_kh'), test.id('P_NV_KHTH'));
SELECT wf.act(test.wf_open_task('hr.transfer_in', 'IN_A'), test.id('bvx_kh'), 'APPROVE');
SELECT test.eq(test.wf_assignee('hr.transfer_in', 'IN_A'), 'bvx_ns', 'tenant đích: trưởng phòng nhân sự BVX');
SELECT wf.act(test.wf_open_task('hr.transfer_in', 'IN_A'), test.id('bvx_ns'), 'APPROVE');
SELECT test.put('GR_A', (SELECT id FROM hr.transfer_group WHERE out_id = test.id('OUT_A')));
SELECT test.eq((SELECT tenant_id FROM hr.transfer_group WHERE id = test.id('GR_A')), test.id('TDX'),
               'quyết định lập ở tập đoàn mẹ');
SELECT test.eq(test.wf_assignee('hr.transfer_group', 'GR_A'), 'nx', 'tập đoàn: trưởng phòng nhân sự tập đoàn');
SELECT test.eq((SELECT stage FROM hr.transfer_out WHERE id = test.id('OUT_A')), 'GROUP', 'chờ tập đoàn');
SELECT wf.act(test.wf_open_task('hr.transfer_group', 'GR_A'), test.id('nx'), 'APPROVE');

SELECT test.eq((SELECT status FROM hr.transfer_out WHERE id = test.id('OUT_A')), 'APPROVED', 'đã duyệt xong');
SELECT test.ok(upper((SELECT valid_period FROM core.assignment WHERE person_id = test.id('a')
                      AND position_id = test.id('P_NV_KD_CHIP'))) = hr.day_start(test.plus_days(20)),
               'bổ nhiệm cũ kết thúc đúng ngày chuyển');
SELECT test.eq(
    (SELECT person_id FROM core.position_holder(test.id('P_NV_KHTH'), hr.day_start(test.plus_days(20)))),
    (SELECT id FROM core.person WHERE tenant_id = test.id('BVX') AND idp_subject = 'a'),
    'từ ngày chuyển, người đó giữ vị trí ở Bệnh viện X');
SELECT test.eq((SELECT count(*) FROM core.person WHERE tenant_id = test.id('BVX') AND idp_subject = 'a'), 1::bigint,
               'một hồ sơ người ở tenant đích');
