-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 024: Quản trị tác tử AI (ADR #51).
--
-- Người có quyền `core.ai.manage` đăng ký, cấu hình và giám sát các tác tử AI.
-- Ghi đi qua Action `ai_agent_register/update/unregister` (kiểm quyền bằng core.has_permission
-- tại tài nguyên `ai_agent`); ràng buộc nghiệp vụ và guardrail cấu hình bởi người quản trị.

-- Bảng tác tử AI
CREATE TABLE core.ai_agent (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    name text NOT NULL,
    model text NOT NULL,               -- tên mô hình trong Ollama, ví dụ "qwen3:4b"
    status text NOT NULL DEFAULT 'active',  -- active | inactive
    guardrail_config jsonb NOT NULL DEFAULT '{"scope_guard": true, "pii_guard": true, "prompt_guard": true}',
    tool_list jsonb NOT NULL DEFAULT '[]',
    created_by uuid NOT NULL REFERENCES core.person(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index cho truy vấn theo tenant
CREATE INDEX idx_ai_agent_tenant ON core.ai_agent(tenant_id);
CREATE INDEX idx_ai_agent_created_by ON core.ai_agent(created_by);

-- Trigger cập nhật updated_at
CREATE TRIGGER trg_ai_agent_updated_at
    BEFORE UPDATE ON core.ai_agent
    FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();

-- Bật nhật ký kiểm toán
CALL audit.enable('core.ai_agent');

-- View cho quản trị viên AI: người có quyền core.ai.manage trong tenant
CREATE VIEW core.v_ai_admin AS
SELECT DISTINCT tenant_id, person_id
FROM core.v_permission_grant
WHERE permission_code = 'core.ai.manage'
  AND valid_period @> now();

-- Quyền core.ai.manage: thêm vào danh mục permission (nếu chưa có)
INSERT INTO core.permission (code, description)
VALUES ('core.ai.manage', 'Quản trị tác tử AI: đăng ký, cấu hình, giám sát')
ON CONFLICT (code) DO NOTHING;