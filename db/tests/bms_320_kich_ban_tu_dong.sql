-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();

-- Duyệt xong một đề nghị mua sắm thì sinh sự kiện, mỗi lần chuyển trạng thái một sự kiện, mang số tiền và số chứng từ
SELECT test.pr('ev', 'c', 'P_NV_MH_DT', 20000000);
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.pending'), 1, 'gửi duyệt phát sự kiện');
SELECT test.approve('ev', 'tp_mh_dt');
SELECT test.eq((SELECT payload ->> 'status' FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 'APPROVED', 'duyệt xong phát sự kiện approved');
SELECT test.eq((SELECT (payload ->> 'amount')::numeric FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 20000000::numeric, 'sự kiện mang số tiền');
SELECT test.ok((SELECT payload ->> 'doc_no' FROM msg.queue WHERE topic = 'event.purchase_request.approved') LIKE 'DN-%' OR
               (SELECT payload ->> 'doc_no' FROM msg.queue WHERE topic = 'event.purchase_request.approved') IS NOT NULL, 'sự kiện mang số chứng từ');
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 1, 'không phát trùng');

-- Chỉ một người nhận tin theo từng khóa; phát lại cùng khóa không sinh thêm
SELECT wf.emit_event(test.id('TDX'), 'purchase_request.approved',
                     (SELECT substr(idempotency_key, length('ev:purchase_request.approved:') + 1) FROM msg.queue
                      WHERE topic = 'event.purchase_request.approved'), '{}');
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.approved'), 1, 'khóa chống trùng');

-- Quy trình tự động đăng ký sự kiện và mã webhook chỉ lưu dạng băm, không trùng
INSERT INTO wf.process_model (tenant_id, id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), test.put('MA', gen_random_uuid()), 'sk', 'Theo sự kiện', '<x/>', test.id('tgd'));
INSERT INTO wf.process_automation (tenant_id, id, model_id, version, flowable_deployment_id, flowable_definition_id, definition_key,
                                   activated_by, events, webhook_sha256)
VALUES (test.id('TDX'), gen_random_uuid(), test.id('MA'), 1, 'd', 'f', 'k', test.id('tgd'), ARRAY['purchase_request.approved'], repeat('a', 64));
SELECT test.throws($$INSERT INTO wf.process_automation (tenant_id, model_id, version, flowable_deployment_id, flowable_definition_id,
                         definition_key, activated_by, webhook_sha256, status, stopped_at)
                     VALUES (test.id('TDX'), test.id('MA'), 2, 'd', 'f', 'k2', test.id('tgd'), repeat('a', 64), 'STOPPED', now())$$,
                   '%process_automation_webhook%', 'mã webhook không trùng');

-- Sự kiện nhân sự
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.personnel_decision.issued'), 0, 'chưa có quyết định nhân sự');
