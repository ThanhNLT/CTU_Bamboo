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

INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), 'quyDinhMau', 'Quy trình mẫu', '<definitions/>', test.id('c'))
RETURNING test.put('m', id);
INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by)
VALUES (test.id('TDX'), test.id('m'), 1, '<definitions/>', '[]', 'x', test.id('c'));
INSERT INTO collab.kb_document (tenant_id, title, category, scope, requester_id, requester_position_id)
VALUES (test.id('TDX'), 'Quy trình mẫu (quy định)', 'sop', 'company', test.id('c'), test.id('P_NV_MH_DT'))
RETURNING test.put('d1', id);
INSERT INTO collab.kb_document (tenant_id, title, category, scope, requester_id, requester_position_id)
VALUES (test.id('TDX'), 'Tài liệu nguồn', 'guide', 'company', test.id('c'), test.id('P_NV_MH_DT'))
RETURNING test.put('d2', id);

INSERT INTO wf.process_regulation (tenant_id, model_id, version, kb_document_id, kind, created_by)
VALUES (test.id('TDX'), test.id('m'), 1, test.id('d1'), 'REGULATION', test.id('c'));
INSERT INTO wf.process_regulation (tenant_id, model_id, kb_document_id, kind, created_by)
VALUES (test.id('TDX'), test.id('m'), test.id('d2'), 'SOURCE', test.id('c'));

SELECT test.throws($$INSERT INTO wf.process_regulation (tenant_id, model_id, version, kb_document_id, kind, created_by)
                     VALUES (test.id('TDX'), test.id('m'), 1, test.id('d1'), 'REGULATION', test.id('c'))$$,
                   '%duplicate key%', 'Một văn bản chỉ là quy định của một phiên bản');
SELECT test.throws($$INSERT INTO wf.process_regulation (tenant_id, model_id, version, kb_document_id, kind, created_by)
                     VALUES (test.id('TDX'), test.id('m'), 7, test.id('d2'), 'REGULATION', test.id('c'))$$,
                   '%violates foreign key%', 'Quy định phải gắn với phiên bản đã phát hành');
SELECT test.throws($$INSERT INTO wf.process_regulation (tenant_id, model_id, kb_document_id, kind, created_by)
                     VALUES (test.id('TDX'), test.id('m'), test.id('d1'), 'REGULATION', test.id('c'))$$,
                   '%violates check%', 'Quy định bắt buộc có số phiên bản');
SELECT test.throws($$INSERT INTO wf.process_regulation (tenant_id, model_id, version, kb_document_id, kind, created_by)
                     VALUES (test.id('TDX'), test.id('m'), 1, test.id('d2'), 'SOURCE', test.id('c'))$$,
                   '%violates check%', 'Văn bản nguồn không gắn phiên bản');
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'wf.process_regulation'),
               'Liên kết quy trình–văn bản có nhật ký kiểm toán');
