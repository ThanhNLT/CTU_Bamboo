-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();

SELECT test.position('TDX', 'P_NV_X', 'DT_MH', 'Chuyên viên mua hàng X');
SELECT test.position('TDX', 'P_NV_Y', 'DT_MH', 'Chuyên viên mua hàng Y');
SELECT test.position('TDX', 'P_NV_Z', 'DT_MH', 'Chuyên viên mua hàng Z');
SELECT test.position('TDX', 'P_PGD_DT', 'DT', 'Phó giám đốc Điện thoại X', false, 'P_GD_DT');
SELECT test.person('TDX', 'newbie', 'Nhân viên chưa có vị trí');

INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'QD_NHAN_SU', 'Quyết định nhân sự');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, p FROM core.role r, unnest(ARRAY['hr.decision.issue', 'hr.decision.read']) p
WHERE r.code = 'QD_NHAN_SU';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), r.id, test.id(p), 'TENANT' FROM core.role r, unnest(ARRAY['P_TGD', 'P_PTGD']) p
WHERE r.code = 'QD_NHAN_SU';

CREATE FUNCTION test.issue(p_actor text, p_type text, p_person text, p_src text, p_dst text, p_kind text,
                           p_days int DEFAULT 0, p_reason text DEFAULT 'Nhu cầu công tác') RETURNS uuid
LANGUAGE sql AS $$
    SELECT hr.issue_personnel_decision(test.id(p_actor), p_type, test.id(p_person),
                                       CASE WHEN p_src IS NULL THEN NULL ELSE test.id(p_src) END,
                                       CASE WHEN p_dst IS NULL THEN NULL ELSE test.id(p_dst) END, p_kind,
                                       (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + p_days, p_reason)
$$;

-- Quyền ban hành: chỉ người có hr.decision.issue; không tự ra quyết định về mình
SELECT test.throws($$ SELECT test.issue('c', 'TRANSFER', 'd', 'P_NV2_MH_DT', 'P_NV_X', NULL, 1) $$,
                   '%hr.decision.issue%', 'chuyên viên không có quyền ban hành');
SELECT test.throws($$ SELECT test.issue('tgd', 'TRANSFER', 'tgd', 'P_TGD', 'P_NV_X', NULL, 1) $$,
                   '%chính mình%', 'không tự ra quyết định về chính mình');
SELECT test.ok(hr.can_issue_decision(test.id('ptgd'), test.id('TDX')), 'phó tổng giám đốc ban hành được');
SELECT test.ok(NOT hr.can_issue_decision(test.id('gd_dt'), test.id('TDX')), 'giám đốc công ty không có quyền');
SELECT test.throws($$ SELECT test.issue('tgd', 'TRANSFER', 'd', 'P_NV2_MH_DT', 'P_NV_X', NULL, -1) $$,
                   '%từ hôm nay%', 'ngày hiệu lực không ở quá khứ');
SELECT test.throws($$ SELECT test.issue('tgd', 'TRANSFER', 'd', 'P_NV2_MH_DT', 'P_NV_X', NULL, 1, '  ') $$,
                   '%căn cứ%', 'phải ghi lý do');

-- Điều chuyển có hiệu lực từ ngày hiệu lực, giữ nguyên lịch sử bổ nhiệm cũ
SELECT test.put('QD1', test.issue('ptgd', 'TRANSFER', 'd', 'P_NV2_MH_DT', 'P_NV_X', NULL, 5));
SELECT test.eq((SELECT doc_no FROM hr.personnel_decision WHERE id = test.id('QD1')) ~ '^QD-\d{4}-\d{6}$', true,
               'số quyết định QD-năm-số');
SELECT test.eq((SELECT count(*) FROM core.assignment WHERE person_id = test.id('d') AND assignment_type = 'PRIMARY')::int,
               2, 'có bổ nhiệm cũ (đã kết thúc) và bổ nhiệm mới');
SELECT test.eq((SELECT upper(valid_period) IS NOT NULL FROM core.assignment
                WHERE person_id = test.id('d') AND position_id = test.id('P_NV2_MH_DT')), true, 'bổ nhiệm cũ có ngày kết thúc');
SELECT test.eq((SELECT lower(valid_period) = hr.day_start((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 5)
                FROM core.assignment WHERE person_id = test.id('d') AND position_id = test.id('P_NV_X')),
               true, 'bổ nhiệm mới bắt đầu đúng ngày hiệu lực');
SELECT test.eq((SELECT count(*) FROM collab.notification WHERE recipient_id = test.id('d') AND kind = 'HR_DECISION')::int,
               1, 'người được điều chuyển nhận thông báo');
SELECT test.throws($$ SELECT test.issue('tgd', 'TRANSFER', 'c', 'P_NV_MH_DT', 'P_NV_X', NULL, 5) $$,
                   '%đã có người ngồi%', 'vị trí đích đã có người từ ngày hiệu lực');

-- Bổ nhiệm: kiêm nhiệm cho người đang giữ chính; giữ chính cho người chưa có vị trí
SELECT test.put('QD2', test.issue('tgd', 'APPOINT', 'tp_mh_dt', NULL, 'P_PGD_DT', 'CONCURRENT', 0));
SELECT test.eq((SELECT assignment_type FROM core.assignment
                WHERE person_id = test.id('tp_mh_dt') AND position_id = test.id('P_PGD_DT')), 'CONCURRENT', 'kiêm nhiệm');
SELECT test.throws($$ SELECT test.issue('tgd', 'APPOINT', 'newbie', NULL, 'P_PGD_DT', 'CONCURRENT', 3) $$,
                   '%đã có người ngồi%', 'vị trí đã có người kiêm nhiệm');
SELECT test.throws($$ SELECT test.issue('tgd', 'APPOINT', 'newbie', NULL, 'P_NV_Y', 'CONCURRENT', 3) $$,
                   '%giữ chính một vị trí%', 'kiêm nhiệm cần đang giữ chính');
SELECT test.put('QD3', test.issue('tgd', 'APPOINT', 'newbie', NULL, 'P_NV_Y', 'PRIMARY', 2));
SELECT test.eq((SELECT assignment_type FROM core.assignment WHERE person_id = test.id('newbie')), 'PRIMARY', 'giữ chính cho người mới');
SELECT test.throws($$ SELECT test.issue('tgd', 'APPOINT', 'c', NULL, 'P_NV_Z', 'PRIMARY', 9) $$,
                   '%điều chuyển%', 'người đã có giữ chính phải dùng điều chuyển');
SELECT test.throws($$ SELECT test.issue('tgd', 'APPOINT', 'c', NULL, 'P_NV_Z', 'ACTING', 9) $$,
                   '%vị trí trưởng%', 'quyền trưởng chỉ cho vị trí trưởng');

-- Miễn nhiệm: kết thúc bổ nhiệm kiêm nhiệm, không miễn nhiệm vị trí giữ chính
SELECT test.put('QD4', test.issue('ptgd', 'DISMISS', 'tp_mh_dt', 'P_PGD_DT', NULL, NULL, 3));
SELECT test.eq((SELECT upper(valid_period) = hr.day_start((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 3)
                FROM core.assignment WHERE person_id = test.id('tp_mh_dt') AND position_id = test.id('P_PGD_DT')),
               true, 'kiêm nhiệm kết thúc đúng ngày hiệu lực');
SELECT test.throws($$ SELECT test.issue('ptgd', 'DISMISS', 'c', 'P_NV_MH_DT', NULL, NULL, 3) $$,
                   '%điều chuyển%', 'không miễn nhiệm vị trí giữ chính');

-- Quyết định bất biến
SELECT test.throws($$ UPDATE hr.personnel_decision SET reason = 'sửa' $$, '%chỉ cho ghi thêm%', 'không sửa quyết định');
SELECT test.throws($$ DELETE FROM hr.personnel_decision $$, '%chỉ cho ghi thêm%', 'không xóa quyết định');
