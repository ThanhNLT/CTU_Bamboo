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
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 80000000);

INSERT INTO core.ai_agent (tenant_id, name, model, created_by, triggers, instructions, allowed_actions)
VALUES (test.id('TDX'), 'Soát đề nghị', 'qwen3:4b', test.id('tp_mh_dt'), '{purchase_request.pending}',
        'Đối chiếu đề nghị với quy chế mua sắm', '{comment,notify}')
RETURNING test.put('ag', id);
INSERT INTO core.ai_agent (tenant_id, name, model, created_by, triggers, instructions, status)
VALUES (test.id('TDX'), 'Đã ngừng', 'qwen3:4b', test.id('tp_mh_dt'), '{purchase_request.pending}', 'x', 'inactive')
RETURNING test.put('ag_off', id);

SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, triggers)
                      VALUES (test.id('TDX'), 'Thiếu nhiệm vụ', 'qwen3:4b', test.id('c'), '{purchase_request.pending}') $$,
                   '%check%', 'có sự kiện kích hoạt thì phải có nhiệm vụ');
SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, allowed_actions)
                      VALUES (test.id('TDX'), 'Lạ', 'qwen3:4b', test.id('c'), '{shell}') $$,
                   '%check%', 'hành động ngoài danh mục bị chặn');
SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, allowed_actions)
                      VALUES (test.id('TDX'), 'Webhook', 'qwen3:4b', test.id('c'), '{webhook}') $$,
                   '%check%', 'webhook phải có địa chỉ');

DELETE FROM core.tenant_module WHERE tenant_id = test.id('TDX') AND module = 'ai';
SELECT wf.emit_event(test.id('TDX'), 'purchase_request.pending', test.id('pr')::text || ':0',
                     jsonb_build_object('entity_id', test.id('pr')));
SELECT test.eq((SELECT count(*)::int FROM core.ai_agent_run), 0, 'mô-đun AI tắt');

INSERT INTO core.module_install (module, installed_by) VALUES ('ai', 'test') ON CONFLICT DO NOTHING;
INSERT INTO core.tenant_module (tenant_id, module) VALUES (test.id('TDX'), 'ai') ON CONFLICT DO NOTHING;
SELECT wf.emit_event(test.id('TDX'), 'purchase_request.pending', test.id('pr')::text || ':1',
                     jsonb_build_object('entity_id', test.id('pr')));
SELECT wf.emit_event(test.id('TDX'), 'purchase_request.pending', test.id('pr')::text || ':1',
                     jsonb_build_object('entity_id', test.id('pr')));
SELECT wf.emit_event(test.id('TDX'), 'purchase_request.approved', test.id('pr')::text || ':1',
                     jsonb_build_object('entity_id', test.id('pr')));
SELECT test.eq((SELECT count(*)::int FROM core.ai_agent_run), 1,
               'một lần chạy: tác tử ngừng không chạy, sự kiện lặp không chạy lại, sự kiện không đăng ký bị bỏ qua');
SELECT test.eq((SELECT (agent_id, entity_type, entity_id, status)::text FROM core.ai_agent_run),
               (test.id('ag'), 'proc.purchase_request', test.id('pr'), 'queued')::text, 'lần chạy gắn đúng chứng từ');
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE topic = 'event.purchase_request.pending'), 2,
               'quy trình tự động vẫn nhận sự kiện như cũ');

SELECT test.eq((SELECT array_agg(p ORDER BY p) FROM wf.open_approvers('proc.purchase_request', test.id('pr')) p),
               (SELECT array_agg(DISTINCT t.assignee_id ORDER BY t.assignee_id)
                FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                WHERE s.entity_id = test.id('pr') AND t.status = 'OPEN'), 'người đang giữ việc duyệt');
UPDATE wf.task SET status = 'CANCELLED', closed_at = now()
WHERE step_id IN (SELECT id FROM wf.approval_step WHERE entity_id = test.id('pr'));
SELECT test.eq((SELECT count(*)::int FROM wf.open_approvers('proc.purchase_request', test.id('pr'))), 0,
               'việc đã đóng không còn là người đang duyệt');
