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

-- Bước AI trong sơ đồ BPMN (ADR #84): lần chạy tác tử gắn với lần chạy quy trình tự động và phần tử của bước.
-- Lần chạy theo sự kiện (wf.emit_event) để trống hai cột này.

ALTER TABLE core.ai_agent_run
    ADD COLUMN automation_run_id uuid,
    ADD COLUMN element_id        text CHECK (element_id IS NULL OR length(element_id) BETWEEN 1 AND 255),
    ADD CHECK ((automation_run_id IS NULL) OR (element_id IS NOT NULL)),
    ADD FOREIGN KEY (tenant_id, automation_run_id) REFERENCES wf.automation_run (tenant_id, id)
        ON DELETE SET NULL (automation_run_id);

CREATE INDEX ai_agent_run_automation ON core.ai_agent_run (tenant_id, automation_run_id);
