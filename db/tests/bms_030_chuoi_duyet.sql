-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
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

SELECT test.pr('pr30', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq(test.status('pr30'), 'PENDING', 'Đề nghị 30 triệu đang chờ duyệt');
SELECT test.eq(test.assignee('pr30'), 'tp_mh_dt', '30 triệu: trưởng phòng mua hàng duyệt');
SELECT test.approve('pr30', 'tp_mh_dt');
SELECT test.eq(test.status('pr30'), 'APPROVED', 'Duyệt xong bước duy nhất thì đề nghị được duyệt');

SELECT test.pr('pr100', 'c', 'P_NV_MH_DT', 100000000);
SELECT test.eq(test.assignee('pr100'), 'gd_dt', '100 triệu: giám đốc Điện thoại X duyệt');

SELECT test.pr('pr600', 'a', 'P_NV_KD_CHIP', 600000000);
SELECT test.eq((SELECT array_agg(test.key(position_id) ORDER BY step_order) FROM wf.approval_step
                WHERE entity_id = test.id('pr600')),
               ARRAY['P_GD_CHIP', 'P_TGD'], 'Chuỗi duyệt 600 triệu là danh sách vị trí');
SELECT test.eq(test.assignee('pr600'), 'gd_chip', '600 triệu: bước 1 giám đốc Chip X');
SELECT test.approve('pr600', 'gd_chip');
SELECT test.eq(test.assignee('pr600'), 'tgd', '600 triệu: bước 2 TGĐ');
SELECT test.approve('pr600', 'tgd');
SELECT test.eq(test.status('pr600'), 'APPROVED', '600 triệu duyệt đủ hai bước');

SELECT test.pr('pr_tp', 'tp_mh_dt', 'P_TP_MH_DT', 20000000);
SELECT test.eq(test.assignee('pr_tp'), 'gd_dt', 'Trưởng phòng lập thì giám đốc công ty duyệt');

SELECT test.pr('pr_gd', 'gd_chip', 'P_GD_CHIP', 100000000);
SELECT test.eq(test.assignee('pr_gd'), 'tgd', 'Giám đốc tự lập 100 triệu thì TGĐ duyệt');
SELECT test.eq((test.open_task('pr_gd')).escalation_reason, 'REQUESTER', 'Lý do đẩy lên: trùng người lập');

SELECT test.pr('pr_x', 'c', 'P_NV_MH_DT', 10000000, false);
SELECT test.throws(format('SELECT proc.submit_purchase_request(%L, %L)', test.id('pr_x'), test.id('d')),
                   '%Chỉ người lập%', 'Người khác không gửi duyệt thay');
SELECT proc.submit_purchase_request(test.id('pr_x'), test.id('c'));
SELECT test.throws(format('SELECT proc.submit_purchase_request(%L, %L)', test.id('pr_x'), test.id('c')),
                   '%không gửi duyệt được%', 'Không gửi lại khi đang chờ duyệt');

SELECT wf.act((test.open_task('pr_x')).id, test.id('tp_mh_dt'), 'RETURN', 'Bổ sung báo giá');
SELECT test.eq(test.status('pr_x'), 'RETURNED', 'Đề nghị bị trả về');
UPDATE proc.purchase_request SET total_amount = 80000000 WHERE id = test.id('pr_x');
SELECT proc.submit_purchase_request(test.id('pr_x'), test.id('c'));
SELECT test.eq((SELECT approval_round FROM proc.purchase_request WHERE id = test.id('pr_x')), 2, 'Lần gửi thứ hai');
SELECT test.eq(test.assignee('pr_x'), 'gd_dt', 'Gửi lại 80 triệu thì giám đốc công ty duyệt');
SELECT wf.act((test.open_task('pr_x')).id, test.id('gd_dt'), 'REJECT');
SELECT test.eq(test.status('pr_x'), 'REJECTED', 'Đề nghị bị từ chối');

SELECT test.pr('pr_y', 'c', 'P_NV_MH_DT', 10000000);
SELECT test.throws(format($$SELECT wf.act(%L, %L, 'APPROVE')$$, (test.open_task('pr_y')).id, test.id('d')),
                   '%Không có quyền xử lý%', 'Người không nhận việc không duyệt được');

INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, max_amount, step_order, approver_unit_type_id, scope_unit_id)
VALUES (test.id('TDX'), 'PURCHASE_REQUEST', 0, 50000000, 1, test.id('TDX:CONG_TY'), test.id('DT'));
SELECT test.pr('pr_scope', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq(test.assignee('pr_scope'), 'gd_dt', 'Điện thoại X tự cấu hình: dưới 50 triệu cũng lên giám đốc');
SELECT test.pr('pr_scope_chip', 'a', 'P_NV_KD_CHIP', 30000000);
SELECT test.eq(test.assignee('pr_scope_chip'), 'tp_kd_chip', 'Chip X vẫn theo quy tắc chung');

SELECT test.pr('pr_lock', 'a', 'P_NV_KD_CHIP', 600000000);
UPDATE wf.approval_rule SET valid_period = tstzrange(lower(valid_period), now())
WHERE min_amount = 500000000 AND step_order = 2;
SELECT test.approve('pr_lock', 'gd_chip');
SELECT test.eq(test.assignee('pr_lock'), 'tgd', 'Bước TGĐ vẫn còn dù quy tắc đã hết hiệu lực');
