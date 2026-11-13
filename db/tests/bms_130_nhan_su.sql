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

SELECT test.unit('TDX', 'DT_NS', 'DT', 'PHONG', 'Phòng Nhân sự');
SELECT test.position('TDX', 'P_TP_NS_DT', 'DT_NS', 'Trưởng phòng Nhân sự', true);
SELECT test.position('TDX', 'P_NV_NS_DT', 'DT_NS', 'Chuyên viên nhân sự');
SELECT test.position('TDX', 'P_NV3_MH_DT', 'DT_MH', 'Chuyên viên mua hàng 3');
SELECT test.unit('TDX', 'DT_KV', 'DT', 'PHONG', 'Phòng Kho vận');
SELECT test.position('TDX', 'P_TP_KV_DT', 'DT_KV', 'Trưởng phòng Kho vận', true);
SELECT test.person('TDX', 'ns', 'Chuyên viên nhân sự');
SELECT test.assign('TDX', 'ns', 'P_NV_NS_DT');

INSERT INTO core.role (tenant_id, code, name) VALUES
    (test.id('TDX'), 'NHAN_SU', 'Nhân sự'), (test.id('TDX'), 'QUAN_LY', 'Quản lý');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, p FROM core.role r,
       unnest(ARRAY['hr.onboarding.create', 'hr.onboarding.read', 'hr.onboarding.private.read']) p
WHERE r.code = 'NHAN_SU'
UNION ALL
SELECT r.tenant_id, r.id, 'hr.onboarding.read' FROM core.role r WHERE r.code = 'QUAN_LY';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope, scope_unit_id)
SELECT test.id('TDX'), id, test.id('P_NV_NS_DT'), 'SUBTREE', test.id('DT') FROM core.role WHERE code = 'NHAN_SU';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), r.id, p.id, 'SUBTREE' FROM core.role r, core.position p
WHERE r.code = 'QUAN_LY' AND p.is_head AND p.tenant_id = test.id('TDX');

INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, approver_unit_type_id, valid_period)
VALUES (test.id('TDX'), 'ONBOARDING', 0, 1, NULL, tstzrange(now() - interval '1 year', NULL)),
       (test.id('TDX'), 'ONBOARDING', 0, 2, test.id('TDX:CONG_TY'), tstzrange(now() - interval '1 year', NULL));

CREATE FUNCTION pg_temp.onboard(p_key text, p_position text, p_username text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO hr.onboarding_request (tenant_id, requester_id, requester_position_id, full_name, target_position_id,
                                       start_date, salary, username)
    VALUES (test.id('TDX'), test.id('ns'), test.id('P_NV_NS_DT'), 'Ứng viên ' || p_key, test.id(p_position),
            current_date + 7, 15000000, p_username)
    RETURNING test.put(p_key, id)
$$;

CREATE FUNCTION pg_temp.st(p_key text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT status FROM hr.onboarding_request WHERE id = test.id(p_key) $$;

SELECT pg_temp.onboard('o1', 'P_NV3_MH_DT', 'ung.vien.o1');
SELECT test.ok((SELECT doc_no FROM hr.onboarding_request WHERE id = test.id('o1')) ~ '^TN-\d{4}-000001$',
               'Số chứng từ tiếp nhận có tiền tố TN');
SELECT test.eq((SELECT target_unit_id FROM hr.onboarding_request WHERE id = test.id('o1')), test.id('DT_MH'),
               'Đơn vị nhận người lấy từ vị trí');
SELECT test.eq((SELECT org_unit_id FROM hr.onboarding_request WHERE id = test.id('o1')), test.id('DT_NS'),
               'Đơn vị của chứng từ là phòng nhân sự của người lập');

SELECT test.throws($$SELECT hr.submit_onboarding_request(test.id('o1'), test.id('ns'))$$,
                   '%chưa có số CCCD%', 'Thiếu CCCD không gửi được');
UPDATE hr.onboarding_request SET national_id_enc = 'vault:v1:x', national_id_masked = '•••••••••789'
WHERE id = test.id('o1');
SELECT test.throws($$SELECT hr.submit_onboarding_request(test.id('o1'), test.id('c'))$$,
                   '%Chỉ người lập%', 'Người khác không gửi thay');

SELECT hr.submit_onboarding_request(test.id('o1'), test.id('ns'));
SELECT test.eq(pg_temp.st('o1'), 'PENDING', 'Đã gửi duyệt');
SELECT test.eq((SELECT array_agg(position_id ORDER BY step_order) FROM wf.approval_step
                WHERE entity_id = test.id('o1')),
               ARRAY[test.id('P_TP_MH_DT'), test.id('P_GD_DT')], 'Chuỗi duyệt: quản lý của vị trí, rồi giám đốc công ty');
SELECT test.eq(test.assignee('o1'), 'tp_mh_dt', 'Bước 1 tới trưởng phòng Mua hàng');
SELECT test.ok(EXISTS (SELECT 1 FROM collab.notification WHERE recipient_id = test.id('tp_mh_dt')
                       AND entity_type = 'hr.onboarding_request' AND kind = 'TASK_ASSIGNED'),
               'Người duyệt nhận thông báo');

SELECT test.ok(wf.entity_can_read('hr.onboarding_request', test.id('o1'), test.id('ns')), 'Người lập xem được');
SELECT test.ok(wf.entity_can_read('hr.onboarding_request', test.id('o1'), test.id('tp_mh_dt')), 'Người duyệt xem được');
SELECT test.ok(wf.entity_can_read('hr.onboarding_request', test.id('o1'), test.id('gd_dt')),
               'Giám đốc công ty (quản lý cây) xem được');
SELECT test.ok(NOT wf.entity_can_read('hr.onboarding_request', test.id('o1'), test.id('c')),
               'Nhân viên cùng phòng không xem được');
SELECT test.ok(NOT wf.entity_can_read('hr.onboarding_request', test.id('o1'), test.id('gd_chip')),
               'Giám đốc công ty khác không xem được');
SELECT test.ok(hr.can_read_private(test.id('o1'), test.id('ns')), 'Nhân sự xem được bản rõ');
SELECT test.ok(NOT hr.can_read_private(test.id('o1'), test.id('tp_mh_dt')), 'Người duyệt chỉ thấy bản che');

SELECT test.throws($$SELECT wf.act((test.open_task('o1')).id, test.id('ns'), 'APPROVE')$$,
                   '%Không có quyền xử lý%', 'Người lập không duyệt được');
SELECT pg_temp.onboard('o2', 'P_NV3_MH_DT');
UPDATE hr.onboarding_request SET national_id_enc = 'vault:v1:y' WHERE id = test.id('o2');
SELECT test.throws($$SELECT hr.submit_onboarding_request(test.id('o2'), test.id('ns'))$$,
                   '%đang chờ duyệt cho vị trí này%', 'Không gửi hai hồ sơ cho một vị trí');

SELECT test.approve('o1', 'tp_mh_dt');
SELECT test.eq(test.assignee('o1'), 'gd_dt', 'Bước 2 tới giám đốc công ty');
SELECT test.approve('o1', 'gd_dt');
SELECT test.eq(pg_temp.st('o1'), 'APPROVED', 'Đã duyệt');
SELECT test.ok((SELECT p.employee_code ~ '^NV-\d{4}-\d{6}$' AND p.full_name = 'Ứng viên o1'
                FROM hr.onboarding_request r JOIN core.person p ON p.id = r.person_id WHERE r.id = test.id('o1')),
               'Tạo người với mã nhân viên NV');
SELECT test.eq((SELECT a.assignment_type || ':' || (lower(a.valid_period) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                FROM hr.onboarding_request r JOIN core.assignment a ON a.person_id = r.person_id
                WHERE r.id = test.id('o1') AND a.position_id = test.id('P_NV3_MH_DT')),
               'PRIMARY:' || (current_date + 7), 'Bổ nhiệm giữ chính từ ngày vào làm (giờ Việt Nam)');
SELECT test.eq((SELECT account_status FROM hr.onboarding_request WHERE id = test.id('o1')), 'PENDING',
               'Có tên đăng nhập thì chờ tạo tài khoản');
SELECT test.ok(EXISTS (SELECT 1 FROM collab.notification WHERE recipient_id = test.id('ns')
                       AND entity_id = test.id('o1') AND kind = 'REQUEST_APPROVED'),
               'Người lập nhận thông báo đã duyệt');

SELECT test.throws($$SELECT hr.submit_onboarding_request(test.id('o2'), test.id('ns'))$$,
                   '%đã có người ngồi%', 'Vị trí đã có người từ ngày vào làm');
SELECT pg_temp.onboard('o3', 'P_NV_MH_DT');
UPDATE hr.onboarding_request SET national_id_enc = 'vault:v1:z' WHERE id = test.id('o3');
SELECT test.throws($$SELECT hr.submit_onboarding_request(test.id('o3'), test.id('ns'))$$,
                   '%đã có người ngồi%', 'Vị trí đang có người');

SELECT pg_temp.onboard('o4', 'P_TP_KV_DT');
UPDATE hr.onboarding_request SET national_id_enc = 'vault:v1:w' WHERE id = test.id('o4');
SELECT hr.submit_onboarding_request(test.id('o4'), test.id('ns'));
SELECT test.approve('o4', 'gd_dt');
SELECT test.eq(pg_temp.st('o4'), 'APPROVED', 'Hai bước cùng người duyệt được gộp');
SELECT test.eq((SELECT account_status FROM hr.onboarding_request WHERE id = test.id('o4')), 'NONE',
               'Không có tên đăng nhập thì không tạo tài khoản');

SELECT test.throws($$SELECT pg_temp.onboard('o5', 'P_NV2_MH_DT', 'ung.vien.o1')$$,
                   '%onboarding_request_username%', 'Trùng tên đăng nhập');

SELECT test.throws($$SELECT hr.cancel_onboarding_request(test.id('o2'), test.id('c'), 'x')$$,
                   '%Chỉ người lập%', 'Người khác không hủy được');
SELECT test.throws($$SELECT hr.cancel_onboarding_request(test.id('o2'), test.id('ns'), ' ')$$,
                   '%lý do%', 'Hủy phải có lý do');
SELECT hr.cancel_onboarding_request(test.id('o2'), test.id('ns'), 'Ứng viên từ chối lời mời');
SELECT test.eq(pg_temp.st('o2'), 'CANCELLED', 'Đã hủy');

SELECT set_config('hasura.user', json_build_object('x-hasura-role', 'user', 'x-hasura-user-id', test.id('c'))::text, true);
SELECT test.throws($$INSERT INTO hr.onboarding_request (tenant_id, requester_id, requester_position_id, full_name,
                                                        target_position_id, start_date)
                     VALUES (test.id('TDX'), test.id('c'), test.id('P_NV_MH_DT'), 'X', test.id('P_NV2_MH_DT'),
                             current_date + 7)$$,
                   '%Không có quyền lập đề nghị tiếp nhận%', 'Nhân viên thường không lập được');
SELECT set_config('hasura.user', json_build_object('x-hasura-role', 'user', 'x-hasura-user-id', test.id('ns'))::text, true);
SELECT test.throws($$INSERT INTO hr.onboarding_request (tenant_id, requester_id, requester_position_id, full_name,
                                                        target_position_id, start_date)
                     VALUES (test.id('TDX'), test.id('ns'), test.id('P_NV_NS_DT'), 'X', test.id('P_NV_KD_CHIP'),
                             current_date + 7)$$,
                   '%Không có quyền lập đề nghị tiếp nhận%', 'Nhân sự Điện thoại X không lập hồ sơ cho Chip X');
SELECT set_config('hasura.user', '', true);

INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
VALUES (test.id('TDX'), 'hr.onboarding_request', test.id('o3'), 'cv.pdf', 'application/pdf', 10, 'k-cv', test.id('ns'));
UPDATE core.attachment SET status = 'CLEAN', sha256 = 'x', scan_engines = ARRAY['test'] WHERE storage_key = 'k-cv';
SELECT test.ok(EXISTS (SELECT 1 FROM search.pending p JOIN core.attachment a ON a.id = p.entity_id
                       WHERE a.storage_key = 'k-cv'), 'CV vào hàng đợi tìm kiếm');
SELECT test.ok(search.attachment_name_only('hr.onboarding_request'), 'CV chỉ lập chỉ mục tên tệp');
