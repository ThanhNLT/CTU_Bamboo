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
SELECT test.pr('pr1', 'c', 'P_NV_MH_DT', 1000000, false);
SELECT test.pr('pr2', 'c', 'P_NV_MH_DT', 2000000, false);

UPDATE proc.purchase_request SET proposed_partner_name = 'Công ty TNHH Mới', proposed_partner_tax_code = '0101234567'
WHERE id IN (test.id('pr1'), test.id('pr2'));
SELECT test.throws($$UPDATE proc.purchase_request SET proposed_partner_tax_code = '123' WHERE id = test.id('pr1')$$,
                   '%violates check%', 'Mã số thuế 10 chữ số (hoặc 10-3)');
SELECT test.throws($$UPDATE proc.purchase_request SET proposed_partner_name = NULL WHERE id = test.id('pr1')$$,
                   '%violates check%', 'Có mã số thuế thì phải có tên');
INSERT INTO mdm.partner (tenant_id, code, name) VALUES (test.id('TDX'), 'NCC_CU', 'Nhà cung cấp cũ')
RETURNING test.put('ncc_cu', id);
SELECT test.throws($$UPDATE proc.purchase_request SET partner_id = test.id('ncc_cu') WHERE id = test.id('pr1')$$,
                   '%violates check%', 'Không vừa chọn danh mục vừa đề xuất');

SELECT test.throws($$SELECT mdm.adopt_proposed_partner(test.id('pr1'), test.id('c'), 'NCC_MOI')$$,
                   '%mdm.manage%', 'Người lập không tự thêm vào danh mục');
INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'DLC', 'Dữ liệu chủ')
RETURNING test.put('R_DLC', id);
INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (test.id('TDX'), test.id('R_DLC'), 'mdm.manage');
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
VALUES (test.id('TDX'), test.id('R_DLC'), test.id('P_GD_DT'), 'TENANT');

SELECT test.put('ncc_moi', mdm.adopt_proposed_partner(test.id('pr1'), test.id('gd_dt'), 'NCC_MOI'));
SELECT test.eq((SELECT tax_code FROM mdm.partner WHERE id = test.id('ncc_moi')), '0101234567', 'Tạo NCC kèm mã số thuế');
SELECT test.eq((SELECT count(*) FROM proc.purchase_request
                WHERE partner_id = test.id('ncc_moi') AND proposed_partner_name IS NULL), 2::bigint,
               'Mọi đề nghị cùng mã số thuế chuyển sang NCC trong danh mục');

SELECT test.pr('pr3', 'c', 'P_NV_MH_DT', 3000000, false);
UPDATE proc.purchase_request SET proposed_partner_name = 'Cty Mới (viết khác)', proposed_partner_tax_code = '0101234567'
WHERE id = test.id('pr3');
SELECT test.eq(mdm.adopt_proposed_partner(test.id('pr3'), test.id('gd_dt'), NULL), test.id('ncc_moi'),
               'Cùng mã số thuế thì dùng lại NCC có sẵn');
SELECT test.throws($$SELECT mdm.adopt_proposed_partner(test.id('pr3'), test.id('gd_dt'), 'X')$$,
                   '%không có nhà cung cấp đề xuất%', 'Đã thêm rồi thì báo');

SELECT test.eq((SELECT storage_quota_bytes FROM core.tenant WHERE id = test.id('TDX')), 10737418240::bigint,
               'Mặc định 10 GB');
INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr1'), 'a.pdf', 'application/pdf', 1000, 'k1', test.id('c')),
       (test.id('TDX'), 'proc.purchase_request', test.id('pr1'), 'b.pdf', 'application/pdf', 500, 'k2', test.id('c'));
SELECT test.eq(core.storage_used(test.id('TDX')), 1500::bigint, 'Tệp đang tải lên giữ chỗ');
UPDATE core.attachment SET deleted_at = now() WHERE storage_key = 'k2';
SELECT test.eq(core.storage_used(test.id('TDX')), 1000::bigint, 'Tệp đã xóa không tính');
SELECT test.eq(core.storage_used(test.id('BVX')), 0::bigint, 'Tính riêng từng tenant');

SELECT test.eq((SELECT user_storage_quota_bytes FROM core.tenant WHERE id = test.id('TDX')), 5368709120::bigint,
               'Mỗi tài khoản mặc định 5 GB');
INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr1'), 'd.pdf', 'application/pdf', 300, 'k3', test.id('d'));
SELECT test.eq(core.storage_used_by(test.id('TDX'), test.id('c')), 1000::bigint, 'Chỉ tính tệp của chính người đó');
SELECT test.eq(core.storage_used_by(test.id('TDX'), test.id('d')), 300::bigint, 'Người khác tính riêng');
SELECT test.eq(core.storage_used(test.id('TDX')), 1300::bigint, 'Đơn vị vẫn tính tổng mọi người');
SELECT test.throws($$UPDATE core.tenant SET user_storage_quota_bytes = 0 WHERE id = test.id('TDX')$$,
                   '%violates check%', 'Hạn mức tài khoản phải dương');
