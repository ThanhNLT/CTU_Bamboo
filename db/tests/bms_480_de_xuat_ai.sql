-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

-- Tác tử mức đề xuất (ADR #85): ràng buộc hành động chỉ-đề-xuất, hết hạn đề xuất, không quyết định hai lần.
SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 80000000);
CREATE TEMP TABLE duyet AS SELECT p FROM wf.open_approvers('proc.purchase_request', test.id('pr')) p LIMIT 1;
CREATE FUNCTION pg_temp.duyet() RETURNS uuid LANGUAGE sql AS $$ SELECT p FROM duyet $$;

INSERT INTO pm.project (tenant_id, id, code, name, org_unit_id, manager_id, start_date, end_date, created_by)
VALUES (test.id('TDX'), test.put('DA', gen_random_uuid()), 'BG-2027', 'Chuẩn hoá báo giá', test.id('DT_MH'),
        test.id('tp_mh_dt'), '2026-11-02', '2026-12-31', test.id('tp_mh_dt'));

SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, allowed_actions, autonomy)
                      VALUES (test.id('TDX'), 'Tự trả', 'qwen3:4b', test.id('c'), '{return_for_info}', 'act') $$,
                   '%ai_agent_suggest_only_check%', 'trả lại chứng từ không bật được ở mức tự thực hiện');
SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, allowed_actions, autonomy, project_id)
                      VALUES (test.id('TDX'), 'Thử', 'qwen3:4b', test.id('c'), '{project_task}', 'dry_run', test.id('DA')) $$,
                   '%ai_agent_suggest_only_check%', 'tạo việc dự án không bật được ở mức chỉ ghi kế hoạch');
SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, allowed_actions, autonomy)
                      VALUES (test.id('TDX'), 'Thiếu dự án', 'qwen3:4b', test.id('c'), '{project_task}', 'suggest') $$,
                   '%ai_agent_project_check%', 'tạo việc dự án phải có dự án đích');
SELECT test.throws($$ INSERT INTO core.ai_agent (tenant_id, name, model, created_by, autonomy)
                      VALUES (test.id('TDX'), 'Lạ', 'qwen3:4b', test.id('c'), 'auto') $$,
                   '%ai_agent_autonomy_check%', 'mức tự chủ ngoài danh mục');

INSERT INTO core.ai_agent (tenant_id, name, model, created_by, triggers, instructions, allowed_actions, autonomy,
                           project_id)
VALUES (test.id('TDX'), 'Kiểm tra báo giá', 'qwen3:4b', test.id('tp_mh_dt'), '{purchase_request.pending}',
        'Thiếu báo giá thì đề nghị trả lại', '{return_for_info,project_task,comment}', 'suggest', test.id('DA'))
RETURNING test.put('ag', id);
INSERT INTO core.ai_agent_run (tenant_id, agent_id, event, entity_type, entity_id, dedup_key, status)
VALUES (test.id('TDX'), test.id('ag'), 'purchase_request.pending', 'proc.purchase_request', test.id('pr'), 'x', 'done')
RETURNING test.put('run', id);

INSERT INTO core.ai_suggestion (tenant_id, run_id, agent_id, seq, entity_type, entity_id, action, recipient_id)
VALUES (test.id('TDX'), test.id('run'), test.id('ag'), 0, 'proc.purchase_request', test.id('pr'),
        '{"type": "return_for_info", "note": "Thiếu báo giá thứ ba"}', pg_temp.duyet())
RETURNING test.put('s_tra', id);
INSERT INTO core.ai_suggestion (tenant_id, run_id, agent_id, seq, entity_type, entity_id, action, recipient_id)
VALUES (test.id('TDX'), test.id('run'), test.id('ag'), 1, 'proc.purchase_request', test.id('pr'),
        '{"type": "comment", "text": "Cần đủ 3 báo giá"}', test.id('tp_mh_dt'))
RETURNING test.put('s_bl', id);
INSERT INTO core.ai_suggestion (tenant_id, run_id, agent_id, seq, entity_type, entity_id, action, recipient_id)
VALUES (test.id('TDX'), test.id('run'), test.id('ag'), 2, 'proc.purchase_request', test.id('pr'),
        '{"type": "project_task", "name": "Bổ sung báo giá", "days": 3}', test.id('tp_mh_dt'))
RETURNING test.put('s_viec', id);

SELECT test.throws($$ INSERT INTO core.ai_suggestion (tenant_id, run_id, agent_id, seq, action, recipient_id)
                      VALUES (test.id('TDX'), test.id('run'), test.id('ag'), 3, '{"type": "shell"}', test.id('c')) $$,
                   '%check%', 'loại hành động ngoài danh mục');
SELECT test.throws($$ INSERT INTO core.ai_suggestion (tenant_id, run_id, agent_id, seq, entity_type, entity_id, action,
                                                      recipient_id)
                      VALUES (test.id('TDX'), test.id('run'), test.id('ag'), 0, 'proc.purchase_request', test.id('pr'),
                              '{"type": "return_for_info", "note": "lặp"}', pg_temp.duyet()) $$,
                   '%duplicate%', 'một lần chạy không tạo trùng đề xuất');

SELECT test.eq(core.ai_suggestion_expire(), 0, 'đề xuất còn hiệu lực không hết hạn');

UPDATE core.ai_suggestion SET status = 'DISMISSED', decided_by = recipient_id, decided_at = now()
WHERE id = test.id('s_bl');
SELECT test.throws($$ UPDATE core.ai_suggestion SET status = 'ACCEPTED' WHERE id = test.id('s_bl') $$,
                   '%đã được xử lý%', 'không quyết định lại đề xuất đã bỏ qua');
SELECT test.throws($$ UPDATE core.ai_suggestion SET recipient_id = test.id('c') WHERE id = test.id('s_viec') $$,
                   '%nguồn gốc%', 'không đổi người nhận');
SELECT test.throws($$ UPDATE core.ai_suggestion SET action = '{"type": "comment", "text": "khác"}'
                      WHERE id = test.id('s_viec') $$,
                   '%khi chấp nhận%', 'nội dung chỉ đổi cùng lúc chấp nhận');

UPDATE wf.task SET status = 'CANCELLED', closed_at = now()
WHERE step_id IN (SELECT id FROM wf.approval_step WHERE entity_id = test.id('pr')) AND status = 'OPEN';
SELECT test.eq(wf.refresh_all() >= 0, true, 'quét định kỳ chạy được');
SELECT test.eq((SELECT (status, reason) FROM core.ai_suggestion WHERE id = test.id('s_tra'))::text,
               ('EXPIRED', 'Chứng từ không còn chờ người nhận duyệt')::text,
               'người nhận không còn việc duyệt mở: đề xuất trả lại hết hạn');
SELECT test.eq((SELECT status FROM core.ai_suggestion WHERE id = test.id('s_viec')), 'PENDING',
               'đề xuất không gắn việc duyệt vẫn còn');

SELECT test.eq(core.ai_suggestion_expire(now() + interval '15 days', test.id('c')), 0, 'chỉ quét người nhận được hỏi');
SELECT test.eq(core.ai_suggestion_expire(now() + interval '15 days', test.id('tp_mh_dt')), 1, 'quá 14 ngày thì hết hạn');
SELECT test.eq((SELECT reason FROM core.ai_suggestion WHERE id = test.id('s_viec')),
               'Đề xuất quá hạn mà chưa được xử lý', 'ghi lý do hết hạn');
SELECT test.ok(EXISTS (SELECT FROM audit.log WHERE table_name LIKE '%ai_suggestion'), 'đề xuất có nhật ký kiểm toán');
