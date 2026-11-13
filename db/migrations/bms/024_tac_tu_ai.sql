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

CREATE TABLE core.ai_agent (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    name text NOT NULL,
    model text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    guardrail_config jsonb NOT NULL DEFAULT '{"scope_guard": true, "pii_guard": true, "prompt_guard": true}',
    tool_list jsonb NOT NULL DEFAULT '[]',
    created_by uuid NOT NULL REFERENCES core.person(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_agent_tenant ON core.ai_agent(tenant_id);
CREATE INDEX idx_ai_agent_created_by ON core.ai_agent(created_by);

CREATE TRIGGER trg_ai_agent_updated_at
    BEFORE UPDATE ON core.ai_agent
    FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();

CALL audit.enable('core.ai_agent');

CREATE VIEW core.v_ai_admin AS
SELECT DISTINCT tenant_id, person_id
FROM core.v_permission_grant
WHERE permission_code = 'core.ai.manage'
  AND valid_period @> now();

INSERT INTO core.permission (code, description)
VALUES ('core.ai.manage', 'Quản trị tác tử AI: đăng ký, cấu hình, giám sát')
ON CONFLICT (code) DO NOTHING;