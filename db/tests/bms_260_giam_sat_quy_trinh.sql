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

INSERT INTO core.role (tenant_id, code, name) VALUES
    (test.id('TDX'), 'TK_QT', 'Thiết kế quy trình'), (test.id('TDX'), 'GS_QT', 'Giám sát quy trình');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, CASE code WHEN 'TK_QT' THEN 'wf.process.design' ELSE 'wf.process.review' END
FROM core.role WHERE tenant_id = test.id('TDX') AND code IN ('TK_QT', 'GS_QT');
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope, scope_unit_id)
SELECT test.id('TDX'), r.id, test.id('P_TP_MH_DT'), 'SUBTREE', test.id('DT_MH') FROM core.role r WHERE r.code = 'TK_QT';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), r.id, test.id(p), 'TENANT' FROM core.role r, unnest(ARRAY['P_TP_MH_DT', 'P_GD_DT', 'P_GD_CHIP', 'P_TGD']) p
WHERE r.code = 'GS_QT';

INSERT INTO wf.process_model (tenant_id, id, process_key, name, bpmn_xml, created_by, owner_unit_id)
VALUES (test.id('TDX'), test.put('M1', gen_random_uuid()), 'duyet_mh', 'Quy trình mua hàng', '<x/>',
        test.id('tp_mh_dt'), test.id('DT_MH'));

SELECT test.eq(wf.process_access(test.id('tp_mh_dt'), test.id('M1')), 'design', 'trưởng phòng thiết kế trong phòng mình');
SELECT test.ok(wf.process_access(test.id('c'), test.id('M1')) IS NULL, 'bản nháp chưa phát hành: nhân viên không thấy');
SELECT test.ok(wf.process_access(test.id('gd_chip'), test.id('M1')) IS NULL, 'bản nháp: giám đốc công ty khác không thấy');
SELECT test.ok(wf.process_access(test.id('tp_kt_gd'), test.id('M1')) IS NULL, 'người không thuộc phạm vi không thấy');

INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by, audience)
VALUES (test.id('TDX'), test.id('M1'), 1, '<x/>', '[]', 'x', test.id('tp_mh_dt'), 'UNIT');
SELECT test.eq(wf.process_access(test.id('c'), test.id('M1')), 'view', 'nhân viên trong phòng chỉ xem');
SELECT test.eq(wf.process_access(test.id('d'), test.id('M1')), 'view', 'nhân viên khác trong phòng chỉ xem');
SELECT test.ok(wf.process_access(test.id('gd_dt'), test.id('M1')) IS NULL, 'đối tượng UNIT: giám đốc công ty ở ngoài phòng không thấy');
SELECT test.ok(wf.process_access(test.id('tp_kt_gd'), test.id('M1')) IS NULL, 'công ty khác không thấy');
SELECT test.eq(wf.notify_process_published(test.id('M1'), 1, test.id('tp_mh_dt'), 'Bản đầu'),
               (SELECT count(*)::int FROM wf.people_under(test.id('DT_MH')) x WHERE x <> test.id('tp_mh_dt')),
               'thông báo đúng số người trong đối tượng, trừ người phát hành');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('c') AND kind = 'PROCESS_PUBLISHED'),
               1, 'nhân viên nhận thông báo');
SELECT test.ok((SELECT body FROM collab.notification WHERE recipient_id = test.id('c') AND kind = 'PROCESS_PUBLISHED')
               NOT LIKE '%yêu cầu sửa chữa%', 'nhân viên chỉ được báo là xem sơ đồ');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('gd_dt') AND kind = 'PROCESS_PUBLISHED'),
               0, 'người ngoài đối tượng không nhận');

INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by, audience)
VALUES (test.id('TDX'), test.id('M1'), 2, '<x/>', '[]', 'y', test.id('tp_mh_dt'), 'COMPANY');
SELECT test.eq(wf.process_access(test.id('gd_dt'), test.id('M1')), 'review', 'giám đốc công ty có quyền giám sát');
SELECT test.ok(wf.process_access(test.id('gd_chip'), test.id('M1')) IS NULL, 'COMPANY: công ty con khác chưa thấy');

INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by, audience)
VALUES (test.id('TDX'), test.id('M1'), 3, '<x/>', '[]', 'z', test.id('tp_mh_dt'), 'GROUP');
SELECT test.eq(wf.process_access(test.id('gd_chip'), test.id('M1')), 'review', 'giám đốc công ty con khác thấy');
SELECT test.eq(wf.process_access(test.id('tgd'), test.id('M1')), 'review', 'tổng giám đốc (công ty mẹ) thấy và giám sát');
SELECT test.eq(wf.process_access(test.id('tp_kt_gd'), test.id('M1')), 'view', 'nhân viên công ty khác chỉ xem');
SELECT test.ok(wf.process_access(test.id('e'), test.id('M1')) IS NULL, 'người chưa có vị trí không thấy');
SELECT test.eq(wf.notify_process_published(test.id('M1'), 3, test.id('tp_mh_dt')),
               (SELECT count(*)::int FROM wf.people_under(wf.root_unit(test.id('TDX'))) x WHERE x <> test.id('tp_mh_dt')),
               'phát hành toàn tập đoàn báo mọi người trừ người phát hành');

INSERT INTO wf.process_model (tenant_id, id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), test.put('M2', gen_random_uuid()), 'toan_tenant', 'Quy trình toàn tập đoàn', '<x/>', test.id('tgd'));
SELECT test.ok(wf.process_access(test.id('tp_mh_dt'), test.id('M2')) IS NULL, 'quản lý cấp phòng không thấy bản nháp toàn tenant');

INSERT INTO wf.process_change_request (tenant_id, model_id, version, requested_by, message)
VALUES (test.id('TDX'), test.id('M1'), 3, test.id('gd_dt'), 'Bổ sung bước pháp chế');
SELECT test.throws($$ UPDATE wf.process_change_request SET status = 'RESOLVED' $$, '%check%', 'đã giải quyết phải có thời điểm');
UPDATE wf.process_change_request SET status = 'RESOLVED', resolved_by = test.id('tp_mh_dt'), resolved_at = now(),
       resolution_note = 'Đã thêm' WHERE model_id = test.id('M1');
SELECT test.eq((SELECT status FROM wf.process_change_request WHERE model_id = test.id('M1')), 'RESOLVED', 'đã xử lý');
