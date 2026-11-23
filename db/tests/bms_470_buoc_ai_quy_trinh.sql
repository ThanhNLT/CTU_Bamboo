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

-- Migration 062: lần chạy tác tử của bước AI gắn với lần chạy quy trình tự động.
SELECT test.fixture();

INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), 'buoc_ai', 'Bước AI', '<definitions/>', test.id('tp_mh_dt'))
RETURNING test.put('model', id);
INSERT INTO wf.process_automation (tenant_id, model_id, version, flowable_deployment_id, flowable_definition_id,
                                   definition_key, activated_by)
VALUES (test.id('TDX'), test.id('model'), 1, 'dep-1', 'def-1', 'auto_buoc_ai', test.id('tp_mh_dt'))
RETURNING test.put('auto', id);
INSERT INTO wf.automation_run (tenant_id, automation_id, flowable_instance_id, trigger)
VALUES (test.id('TDX'), test.id('auto'), 'pi-1', 'MANUAL') RETURNING test.put('run', id);

INSERT INTO core.ai_agent (tenant_id, name, model, created_by)
VALUES (test.id('TDX'), 'Đánh giá bước', 'qwen3:4b', test.id('tp_mh_dt')) RETURNING test.put('ag', id);
SELECT test.ok((SELECT instructions IS NULL AND cardinality(triggers) = 0 FROM core.ai_agent WHERE id = test.id('ag')),
               'tác tử dùng trong bước không cần sự kiện kích hoạt hay nhiệm vụ chung');

INSERT INTO core.ai_agent_run (tenant_id, agent_id, event, payload, dedup_key, automation_run_id, element_id)
VALUES (test.id('TDX'), test.id('ag'), 'process.ai_step', '{"step_task": "Đánh giá rủi ro"}',
        'step:pi-1:danh_gia', test.id('run'), 'danh_gia')
RETURNING test.put('ai_run', id);
SELECT test.eq((SELECT (automation_run_id, element_id, status)::text FROM core.ai_agent_run WHERE id = test.id('ai_run')),
               (test.id('run'), 'danh_gia', 'queued')::text, 'lần chạy gắn lần chạy quy trình và phần tử');

SELECT test.throws($$ INSERT INTO core.ai_agent_run (tenant_id, agent_id, event, dedup_key, automation_run_id, element_id)
                      VALUES (test.id('TDX'), test.id('ag'), 'process.ai_step', 'step:pi-1:danh_gia',
                              test.id('run'), 'danh_gia') $$,
                   '%duplicate key%', 'Flowable giao lại việc không tạo lần chạy thứ hai');
SELECT test.throws($$ INSERT INTO core.ai_agent_run (tenant_id, agent_id, event, dedup_key, automation_run_id)
                      VALUES (test.id('TDX'), test.id('ag'), 'process.ai_step', 'step:pi-1:x', test.id('run')) $$,
                   '%check%', 'gắn lần chạy quy trình thì phải có mã phần tử');
SELECT test.throws($$ INSERT INTO core.ai_agent_run (tenant_id, agent_id, event, dedup_key, automation_run_id, element_id)
                      VALUES (test.id('BVX'), test.id('ag'), 'process.ai_step', 'step:pi-1:y', test.id('run'), 'y') $$,
                   '%foreign key%', 'không gắn được lần chạy quy trình của tenant khác');

DELETE FROM wf.automation_run WHERE id = test.id('run');
SELECT test.eq((SELECT (automation_run_id IS NULL, element_id, tenant_id)::text FROM core.ai_agent_run
                WHERE id = test.id('ai_run')),
               (true, 'danh_gia', test.id('TDX'))::text,
               'xóa lần chạy quy trình chỉ bỏ liên kết, giữ lịch sử lần chạy tác tử');
