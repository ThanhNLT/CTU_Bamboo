-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();

-- Phòng nhân sự của tập đoàn (chung cho các công ty) và của công ty Điện thoại X
SELECT test.unit('TDX', 'ME_NS', 'ME', 'PHONG', 'Phòng Nhân sự Tập đoàn');
UPDATE core.org_unit SET is_hr = true WHERE id = test.id('ME_NS');
SELECT test.position('TDX', 'P_TP_NS_ME', 'ME_NS', 'Trưởng phòng Nhân sự Tập đoàn', true);
SELECT test.unit('TDX', 'DT_NS', 'DT', 'PHONG', 'Phòng Nhân sự Điện thoại X');
UPDATE core.org_unit SET is_hr = true WHERE id = test.id('DT_NS');
SELECT test.position('TDX', 'P_TP_NS_DT', 'DT_NS', 'Trưởng phòng Nhân sự Điện thoại X', true);
SELECT test.unit('TDX', 'DT_KV', 'DT', 'PHONG', 'Phòng Kho vận');
SELECT test.position('TDX', 'P_TP_KV_DT', 'DT_KV', 'Trưởng phòng Kho vận', true);
SELECT test.position('TDX', 'P_NV_MH_DT_2', 'DT_MH', 'Chuyên viên mua hàng 4');
SELECT test.position('TDX', 'P_A_MH', 'DT_MH', 'Chuyên viên mua hàng 6');
SELECT test.position('TDX', 'P_X_MH', 'DT_MH', 'Chuyên viên mua hàng 5');

SELECT test.person('TDX', 'nx', 'Nhân sự Tập đoàn');
SELECT test.assign('TDX', 'nx', 'P_TP_NS_ME');
SELECT test.person('TDX', 'ny', 'Nhân sự Điện thoại X');
SELECT test.assign('TDX', 'ny', 'P_TP_NS_DT');
SELECT test.person('TDX', 'tp_kv', 'Trưởng phòng Kho vận');
SELECT test.assign('TDX', 'tp_kv', 'P_TP_KV_DT');
SELECT test.person('TDX', 'x', 'Chuyên viên mua hàng 5');
SELECT test.assign('TDX', 'x', 'P_X_MH');
SELECT test.person('TDX', 'y', 'Chuyên viên mua hàng 2 (điều chuyển)');
SELECT test.assign('TDX', 'y', 'P_NV_MH_DT_2');

INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'DIEU_CHUYEN', 'Điều chuyển nhân sự');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, p FROM core.role r, unnest(ARRAY['hr.transfer.create', 'hr.transfer.read']) p
WHERE r.code = 'DIEU_CHUYEN';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope, scope_unit_id)
SELECT test.id('TDX'), r.id, test.id('P_TP_NS_DT'), 'SUBTREE', test.id('DT') FROM core.role r WHERE r.code = 'DIEU_CHUYEN';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope, scope_unit_id)
SELECT test.id('TDX'), r.id, test.id('P_TP_NS_ME'), 'TENANT', NULL FROM core.role r WHERE r.code = 'DIEU_CHUYEN';

-- Hỗ trợ: kiểm tra một lệnh phải lỗi và thông báo chứa p_like
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

CREATE FUNCTION test.tr_task(p_key text) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT t.id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
    WHERE s.entity_type = 'hr.transfer_request' AND s.entity_id = test.id(p_key) AND t.status = 'OPEN'
$$;

CREATE FUNCTION test.assignee_of_task(p_key text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT test.key(t.assignee_id) FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
    WHERE s.entity_type = 'hr.transfer_request' AND s.entity_id = test.id(p_key) AND t.status = 'OPEN'
$$;

CREATE FUNCTION test.tr_status(p_key text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT status FROM hr.transfer_request WHERE id = test.id(p_key) $$;

-- 1. Điều chuyển liên công ty (CHIP -> Điện thoại X): người lập là chính nhân viên
SELECT test.put('TR_A', hr.create_transfer_request(test.id('a'), test.id('a'), test.id('P_NV_KD_CHIP'),
                                                   test.id('DT_MH'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20,
                                                   'Nguyện vọng chuyển sang mua hàng'));
SELECT test.eq((SELECT requester_kind FROM hr.transfer_request WHERE id = test.id('TR_A')), 'SELF', 'người lập là chính nhân viên');
SELECT hr.submit_transfer_request(test.id('TR_A'), test.id('a'));
SELECT test.eq(test.tr_status('TR_A'), 'PENDING', 'gửi duyệt xong thì chờ duyệt');
SELECT test.eq(
    (SELECT array_agg(s.position_id ORDER BY s.step_order) FROM wf.approval_step s
     WHERE s.entity_type = 'hr.transfer_request' AND s.entity_id = test.id('TR_A')),
    ARRAY[test.id('P_TP_MH_DT'), test.id('P_TP_NS_ME')]::uuid[],
    'bước 1 là trưởng đơn vị tiếp nhận, bước 2 là trưởng phòng nhân sự công ty mẹ');
SELECT test.eq(test.assignee_of_task('TR_A'), 'tp_mh_dt', 'bước 1 giao cho trưởng đơn vị tiếp nhận');

-- Người không phải trưởng đơn vị tiếp nhận không chọn được vị trí
SELECT test.expect_fail(
    format('SELECT hr.choose_transfer_position(%L, %L, %L)', test.id('TR_A'), test.id('tp_kd_chip'), test.id('P_A_MH')),
    '%Chỉ trưởng đơn vị tiếp nhận%');
-- Không chọn trưởng phòng làm vị trí tiếp nhận
SELECT test.expect_fail(
    format('SELECT hr.choose_transfer_position(%L, %L, %L)', test.id('TR_A'), test.id('tp_mh_dt'), test.id('P_TP_MH_DT')),
    '%Không chọn vị trí trưởng%');
SELECT hr.choose_transfer_position(test.id('TR_A'), test.id('tp_mh_dt'), test.id('P_A_MH'));
SELECT wf.act(test.tr_task('TR_A'), test.id('tp_mh_dt'), 'APPROVE');
SELECT test.eq(test.assignee_of_task('TR_A'), 'nx', 'bước 2 giao cho trưởng phòng nhân sự công ty mẹ');
SELECT wf.act(test.tr_task('TR_A'), test.id('nx'), 'APPROVE');

SELECT test.eq(test.tr_status('TR_A'), 'APPROVED', 'duyệt xong thì đề nghị được duyệt');
SELECT test.eq(
    (SELECT upper(valid_period) FROM core.assignment WHERE person_id = test.id('a') AND position_id = test.id('P_NV_KD_CHIP')),
    hr.day_start((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20), 'vị trí cũ kết thúc đúng ngày chuyển');
SELECT test.eq(
    (SELECT person_id FROM core.position_holder(test.id('P_A_MH'), hr.day_start((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20))),
    test.id('a'), 'từ ngày chuyển, nhân viên giữ vị trí mới');

-- 2. Bổ nhiệm trực tiếp cho người đã có bổ nhiệm giữ chính bị chặn, kể cả khi kết thúc bổ nhiệm cũ trước
SELECT test.expect_fail(
    'SELECT test.assign(''TDX'', ''a'', ''P_X_MH'')',
    '%assignment_one_primary_per_person%');
-- Kết thúc bổ nhiệm cũ rồi bổ nhiệm mới không qua duyệt cũng bị chặn
SELECT test.position('TDX', 'P_BYPASS', 'DT_MH', 'Vị trí đã kết thúc');
SELECT test.position('TDX', 'P_NB_MH', 'DT_MH', 'Vị trí trống');
SELECT test.person('TDX', 'nb', 'Người đã nghỉ vị trí cũ');
SELECT test.assign('TDX', 'nb', 'P_BYPASS', 'PRIMARY', tstzrange(now() - interval '2 years', now() - interval '1 day'));
SELECT test.expect_fail(
    'SELECT test.assign(''TDX'', ''nb'', ''P_NB_MH'', ''PRIMARY'', tstzrange(now(), NULL))',
    '%chuyển vị trí phải qua đề nghị điều chuyển%');

-- 3. Trưởng đơn vị tiếp nhận chưa chọn vị trí thì duyệt bước cuối bị từ chối
-- (người được điều chuyển: y, từ Mua hàng sang Kho vận trong Điện thoại X)
SELECT test.put('TR_Y', hr.create_transfer_request(test.id('y'), test.id('y'), test.id('P_NV_MH_DT_2'),
                                                   test.id('DT_KV'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20,
                                                   'Muốn chuyển sang kho vận'));
SELECT hr.submit_transfer_request(test.id('TR_Y'), test.id('y'));
SELECT test.eq(test.assignee_of_task('TR_Y'), 'tp_kv', 'bước 1 giao cho trưởng Kho vận');
SELECT test.eq(
    (SELECT position_id FROM wf.approval_step WHERE entity_type = 'hr.transfer_request'
        AND entity_id = test.id('TR_Y') AND step_order = 2),
    test.id('P_TP_NS_DT'), 'cùng công ty thì trưởng phòng nhân sự của công ty đó duyệt');
SELECT wf.act(test.tr_task('TR_Y'), test.id('tp_kv'), 'APPROVE');
SELECT test.expect_fail(
    format('SELECT wf.act(%L, %L, %L)', test.tr_task('TR_Y'), test.id('ny'), 'APPROVE'),
    '%Chưa chọn vị trí tiếp nhận%');

-- 4. Từ chối: người được điều chuyển vẫn ở vị trí cũ
-- Trưởng phòng nhân sự từ chối vì đang quản lý dự án lớn
SELECT wf.act(test.tr_task('TR_Y'), test.id('ny'), 'REJECT', 'Đang quản lý dự án lớn');
SELECT test.eq(test.tr_status('TR_Y'), 'REJECTED', 'bị từ chối');
SELECT test.eq((SELECT person_id FROM core.position_holder(test.id('P_NV_MH_DT_2'))), test.id('y'),
               'người được điều chuyển vẫn giữ vị trí cũ');

-- 5. Ngày chuyển chưa đủ 14 ngày kế hoạch thì không gửi duyệt được
SELECT test.put('TR_X', hr.create_transfer_request(test.id('tp_mh_dt'), test.id('x'), test.id('P_X_MH'),
                                                   test.id('CHIP_KD'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 13,
                                                   'Điều về phòng kinh doanh'));
SELECT test.eq((SELECT requester_kind FROM hr.transfer_request WHERE id = test.id('TR_X')), 'MANAGER',
               'trưởng phòng lập giúp nhân viên');
SELECT test.expect_fail(format('SELECT hr.submit_transfer_request(%L, %L)', test.id('TR_X'), test.id('tp_mh_dt')),
                        '%14 ngày%');
SELECT hr.cancel_transfer_request(test.id('TR_X'), test.id('tp_mh_dt'), 'Lập sai ngày');
SELECT test.eq(test.tr_status('TR_X'), 'CANCELLED', 'hủy được khi chưa duyệt xong');

-- 6. Người không có quyền không lập được đề nghị
SELECT test.expect_fail(
    format('SELECT hr.create_transfer_request(%L, %L, %L, %L, %L, %L)', test.id('e'), test.id('y'), test.id('P_NV_MH_DT_2'),
           test.id('CHIP_KD'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20, 'thử'),
    '%Không có quyền lập%');

-- 7. Trưởng phòng nhân sự có quyền trong phạm vi công ty lập đề nghị cho người trong phạm vi đó
SELECT test.put('TR_Z', hr.create_transfer_request(test.id('ny'), test.id('x'), test.id('P_X_MH'),
                                                   test.id('DT_KV'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20,
                                                   'Hỗ trợ kho vận'));
SELECT test.eq((SELECT requester_kind FROM hr.transfer_request WHERE id = test.id('TR_Z')), 'EXECUTIVE',
               'người có quyền hr.transfer.create lập đề nghị');
SELECT test.expect_fail(
    format('SELECT hr.create_transfer_request(%L, %L, %L, %L, %L, %L)', test.id('ny'), test.id('tp_kd_chip'),
           test.id('P_TP_KD_CHIP'), test.id('DT_KV'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 20, 'ngoài phạm vi'),
    '%Không có quyền lập%');

-- 8. Hủy khi đang chờ duyệt: việc duyệt đang mở bị hủy theo
SELECT hr.cancel_transfer_request(test.id('TR_Z'), test.id('ny'), 'Rút đề nghị');
SELECT test.eq(test.tr_status('TR_Z'), 'CANCELLED', 'hủy được khi đang chờ duyệt');
SELECT test.eq((SELECT count(*) FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                WHERE s.entity_id = test.id('TR_Z') AND t.status = 'OPEN'), 0::bigint, 'không còn việc duyệt mở');
