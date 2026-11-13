-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
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

SELECT test.assign('TDX', 'a', 'P_HD_KT_GD', 'CONTRACT',
                   tstzrange(now() - interval '1 month', now() + interval '5 months'), 'HD-01');
SELECT test.pr('hd_nhap', 'a', 'P_HD_KT_GD', 10000000, false);
SELECT test.pr('hd_cho', 'a', 'P_HD_KT_GD', 10000000);
SELECT test.pr('hd_tra_ve', 'a', 'P_HD_KT_GD', 10000000);
SELECT wf.act((test.open_task('hd_tra_ve')).id, test.id('tp_kt_gd'), 'RETURN');
SELECT test.pr('hd_xong', 'a', 'P_HD_KT_GD', 10000000);
SELECT test.approve('hd_xong', 'tp_kt_gd');
SELECT test.end_assignment('a', 'P_HD_KT_GD');
SELECT test.eq(test.status('hd_nhap'), 'CANCELLED', 'Nháp bị hủy khi hết hợp đồng');
SELECT test.eq(test.status('hd_cho'), 'CANCELLED', 'Đang chờ duyệt bị hủy khi hết hợp đồng');
SELECT test.eq(test.status('hd_tra_ve'), 'CANCELLED', 'Bị trả về bị hủy khi hết hợp đồng');
SELECT test.eq(test.status('hd_xong'), 'APPROVED', 'Đã duyệt là cam kết của công ty, giữ nguyên');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                           WHERE s.entity_id = test.id('hd_cho') AND t.status = 'OPEN'),
               'Việc duyệt của chứng từ bị hủy cũng đóng');
SELECT test.ok(EXISTS (SELECT 1 FROM wf.approval_history WHERE entity_id = test.id('hd_cho') AND event = 'CANCELLED'
                       AND detail->>'reason' LIKE '%hợp đồng%'),
               'Lịch sử ghi lý do hủy');

SELECT test.pr('c_cho', 'c', 'P_NV_MH_DT', 10000000);
SELECT test.pr('c_nhap', 'c', 'P_NV_MH_DT', 10000000, false);
SELECT test.end_assignment('c', 'P_NV_MH_DT');
SELECT test.eq(test.status('c_cho'), 'PENDING', 'Chưa có người kế nhiệm: chứng từ vẫn chờ');
SELECT test.person('TDX', 'c2', 'Người kế nhiệm chị C');
SELECT test.assign('TDX', 'c2', 'P_NV_MH_DT', 'PRIMARY', tstzrange(now(), NULL));
SELECT test.eq((SELECT test.key(requester_id) FROM proc.purchase_request WHERE id = test.id('c_cho')), 'c2',
               'Đề nghị đang chờ chuyển cho người kế nhiệm');
SELECT test.eq((SELECT test.key(requester_id) FROM proc.purchase_request WHERE id = test.id('c_nhap')), 'c2',
               'Nháp chuyển cho người kế nhiệm');
SELECT test.ok(EXISTS (SELECT 1 FROM wf.approval_history WHERE entity_id = test.id('c_cho') AND event = 'OWNER_TRANSFERRED'),
               'Lịch sử ghi chuyển người lập');
SELECT proc.submit_purchase_request(test.id('c_nhap'), test.id('c2'));
SELECT test.eq(test.status('c_nhap'), 'PENDING', 'Người kế nhiệm gửi duyệt được');

SELECT test.pr('d_cho', 'd', 'P_NV2_MH_DT', 10000000);
SELECT test.eq(test.assignee('d_cho'), 'tp_mh_dt', 'Trưởng phòng nhận việc');
SELECT test.end_assignment('d', 'P_NV2_MH_DT');
SELECT test.assign('TDX', 'tp_mh_dt', 'P_NV2_MH_DT', 'CONCURRENT', tstzrange(now(), NULL));
SELECT test.eq((SELECT test.key(requester_id) FROM proc.purchase_request WHERE id = test.id('d_cho')), 'tp_mh_dt',
               'Trưởng phòng kiêm nhiệm ghế của người lập');
SELECT test.eq(test.assignee('d_cho'), 'gd_dt', 'Không tự duyệt: việc đẩy lên giám đốc');

SELECT test.person('TDX', 'g', 'Anh G');
SELECT test.position('TDX', 'P_HD2_KT_GD', 'GD_KT', 'Kỹ sư hợp đồng 2', false, 'P_TP_KT_GD');
SELECT test.assign('TDX', 'g', 'P_HD2_KT_GD', 'CONTRACT',
                   tstzrange(now() - interval '1 month', now() + interval '1 day'), 'HD-02');
SELECT test.pr('g_cho', 'g', 'P_HD2_KT_GD', 10000000);
SELECT test.pr('g_nhap', 'g', 'P_HD2_KT_GD', 10000000, false);
SELECT test.throws(format('SELECT proc.submit_purchase_request(%L, %L, %L)', test.id('g_nhap'), test.id('g'),
                          now() + interval '2 days'),
                   '%không còn giữ vị trí%', 'Hết hợp đồng thì không gửi duyệt được, kể cả trước khi job chạy');
SELECT test.ok(wf.refresh_all(now()) > 0, 'refresh_all chạy');
SELECT test.eq(test.status('g_cho'), 'PENDING', 'Còn hạn hợp đồng: chưa hủy');
SELECT wf.refresh_all(now() + interval '2 days');
SELECT test.eq(test.status('g_cho'), 'CANCELLED', 'Quá hạn hợp đồng: refresh_all hủy chứng từ');
