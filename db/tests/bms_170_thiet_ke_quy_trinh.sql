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

INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), 'muaSam', 'Mua sắm', '<definitions/>', test.id('c'))
RETURNING test.put('m', id);
SELECT test.throws($$INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
                     VALUES (test.id('TDX'), 'muaSam', 'Trùng', '<x/>', test.id('c'))$$,
                   '%duplicate key%', 'Mã quy trình duy nhất trong tenant');
INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('BVX'), 'muaSam', 'Tenant khác dùng cùng mã', '<definitions/>', test.id('c'));
SELECT test.throws($$INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
                     VALUES (test.id('TDX'), '1 sai', 'Sai mã', '<x/>', test.id('c'))$$,
                   '%violates check%', 'Mã quy trình dạng NCName');

INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by)
VALUES (test.id('TDX'), test.id('m'), 1, '<definitions/>', '[]', 'x', test.id('c'));
SELECT test.throws($$UPDATE wf.process_version SET note = 'sửa' WHERE model_id = test.id('m')$$,
                   '%chỉ cho ghi thêm%', 'Phiên bản phát hành không sửa được');
SELECT test.throws($$INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by)
                     VALUES (test.id('TDX'), test.id('m'), 1, '<x/>', '[]', 'y', test.id('c'))$$,
                   '%duplicate key%', 'Mỗi số phiên bản một lần');
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'wf.process_model' AND row_id = test.id('m')::text),
               'Bản nháp có nhật ký kiểm toán');
SELECT test.ok(EXISTS (SELECT 1 FROM core.permission WHERE code = 'wf.process.design'), 'Có quyền wf.process.design');
