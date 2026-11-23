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

SELECT test.pr('ev', 'c', 'P_NV_MH_DT', 20000000);
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.pending'), 1, 'gửi duyệt phát sự kiện');
SELECT test.approve('ev', 'tp_mh_dt');
SELECT test.eq((SELECT payload ->> 'status' FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 'APPROVED', 'duyệt xong phát sự kiện approved');
SELECT test.eq((SELECT (payload ->> 'amount')::numeric FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 20000000::numeric, 'sự kiện mang số tiền');
SELECT test.ok((SELECT payload ->> 'doc_no' FROM msg.queue WHERE topic = 'event.purchase_request.approved') LIKE 'DN-%' OR
               (SELECT payload ->> 'doc_no' FROM msg.queue WHERE topic = 'event.purchase_request.approved') IS NOT NULL, 'sự kiện mang số chứng từ');
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 1, 'không phát trùng');

SELECT wf.emit_event(test.id('TDX'), 'purchase_request.approved',
                     (SELECT substr(idempotency_key, length('ev:purchase_request.approved:') + 1) FROM msg.queue
                      WHERE topic = 'event.purchase_request.approved'), '{}');
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 1, 'khóa chống trùng');

INSERT INTO wf.process_model (tenant_id, id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), test.put('MA', gen_random_uuid()), 'sk', 'Theo sự kiện', '<x/>', test.id('tgd'));
INSERT INTO wf.process_automation (tenant_id, id, model_id, version, flowable_deployment_id, flowable_definition_id, definition_key,
                                   activated_by, events, webhook_sha256)
VALUES (test.id('TDX'), gen_random_uuid(), test.id('MA'), 1, 'd', 'f', 'k', test.id('tgd'), ARRAY['purchase_request.approved'], repeat('a', 64));
SELECT test.throws($$INSERT INTO wf.process_automation (tenant_id, model_id, version, flowable_deployment_id, flowable_definition_id,
                         definition_key, activated_by, webhook_sha256, status, stopped_at)
                     VALUES (test.id('TDX'), test.id('MA'), 2, 'd', 'f', 'k2', test.id('tgd'), repeat('a', 64), 'STOPPED', now())$$,
                   '%process_automation_webhook%', 'mã webhook không trùng');

SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.personnel_decision.issued'), 0, 'chưa có quyết định nhân sự');

INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by, audience)
VALUES (test.id('TDX'), test.id('MA'), 1, '<x/>', '[]', repeat('b', 64), test.id('tgd'), 'UNIT');
UPDATE wf.process_model SET owner_unit_id = test.id('DT_MH') WHERE id = test.id('MA');
SELECT test.eq(wf.automation_in_scope((SELECT id FROM wf.process_automation WHERE model_id = test.id('MA')),
                                      jsonb_build_array(test.id('DT_MH'))), true, 'chứng từ của chính phòng: áp dụng');
SELECT test.eq(wf.automation_in_scope((SELECT id FROM wf.process_automation WHERE model_id = test.id('MA')),
                                      jsonb_build_array(test.id('GD_KT'))), false, 'chứng từ của phòng khác: không áp dụng');
SELECT test.eq(wf.automation_in_scope((SELECT id FROM wf.process_automation WHERE model_id = test.id('MA')), '[]'), false,
               'sự kiện không mang đơn vị: không áp dụng');
