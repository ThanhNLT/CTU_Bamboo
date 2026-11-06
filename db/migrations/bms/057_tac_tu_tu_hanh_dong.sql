-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 057: Tác tử AI tự hành động khi có sự kiện nghiệp vụ (ADR #72).
-- Quản trị AI chọn sự kiện kích hoạt, nhiệm vụ và những hành động tác tử được phép làm (bình luận vào chứng từ, gửi
-- thông báo, gọi webhook đã khai sẵn). Mỗi sự kiện khớp sinh một lần chạy; ai-worker đọc chứng từ (và quy chế trong
-- thư viện nếu tác tử có search_docs), hỏi mô hình một kế hoạch dạng JSON, kiểm từng hành động theo cấu hình rồi mới làm.
-- Tác tử hành động thay mặt người phụ trách (người tạo): không bao giờ có quyền rộng hơn người đó.

ALTER TABLE core.ai_agent
    ADD COLUMN triggers         text[] NOT NULL DEFAULT '{}',
    ADD COLUMN instructions     text CHECK (length(instructions) <= 4000),
    ADD COLUMN allowed_actions  text[] NOT NULL DEFAULT '{}'
                                CHECK (allowed_actions <@ ARRAY['comment', 'notify', 'webhook']),
    ADD COLUMN autonomy         text NOT NULL DEFAULT 'act' CHECK (autonomy IN ('act', 'dry_run')),
    ADD COLUMN webhook_url      text CHECK (webhook_url IS NULL OR webhook_url ~ '^https://'),
    ADD CHECK (cardinality(triggers) = 0 OR (instructions IS NOT NULL AND btrim(instructions) <> '')),
    ADD CHECK (NOT ('webhook' = ANY (allowed_actions)) OR webhook_url IS NOT NULL);

CREATE TABLE core.ai_agent_run (
    tenant_id    uuid NOT NULL REFERENCES core.tenant ON DELETE CASCADE,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     uuid NOT NULL REFERENCES core.ai_agent ON DELETE CASCADE,
    event        text NOT NULL,
    entity_type  text,
    entity_id    uuid,
    payload      jsonb NOT NULL DEFAULT '{}',
    dedup_key    text NOT NULL,
    status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error', 'skipped')),
    attempts     int NOT NULL DEFAULT 0,
    assessment   text,
    risk         text CHECK (risk IN ('low', 'medium', 'high')),
    plan         jsonb,
    actions      jsonb NOT NULL DEFAULT '[]',
    error        text,
    model        text,
    prompt_tokens      int,
    completion_tokens  int,
    created_at   timestamptz NOT NULL DEFAULT now(),
    started_at   timestamptz,
    finished_at  timestamptz,
    UNIQUE (agent_id, dedup_key)
);
CREATE INDEX ai_agent_run_queue ON core.ai_agent_run (created_at) WHERE status = 'queued';
CREATE INDEX ai_agent_run_agent ON core.ai_agent_run (tenant_id, agent_id, created_at DESC);
CALL audit.enable('core.ai_agent_run');

-- Sự kiện nghiệp vụ: ngoài hàng đợi của quy trình tự động, sinh lần chạy cho mọi tác tử đang hoạt động đăng ký sự kiện
-- đó (cùng khóa chống trùng), rồi đánh thức ai-worker.
CREATE OR REPLACE FUNCTION wf.emit_event(p_tenant uuid, p_name text, p_key text, p_payload jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_type text := CASE split_part(p_name, '.', 1)
        WHEN 'purchase_request' THEN 'proc.purchase_request'
        WHEN 'onboarding' THEN 'hr.onboarding_request'
        WHEN 'ic_order' THEN 'ic.ic_order'
        WHEN 'personnel_decision' THEN 'hr.personnel_decision'
    END;
    v_n int;
BEGIN
    PERFORM msg.enqueue(p_tenant, 'event.' || p_name, p_payload, 'ev:' || p_name || ':' || p_key);
    INSERT INTO core.ai_agent_run (tenant_id, agent_id, event, entity_type, entity_id, payload, dedup_key)
    SELECT p_tenant, a.id, p_name, v_type, (p_payload ->> 'entity_id')::uuid, p_payload, p_name || ':' || p_key
    FROM core.ai_agent a
    WHERE a.tenant_id = p_tenant AND a.status = 'active' AND p_name = ANY (a.triggers)
      AND core.module_enabled(p_tenant, 'ai')
    ON CONFLICT (agent_id, dedup_key) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
        PERFORM pg_notify('ai_question', 'agent');
    END IF;
END $$;

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION', 'SECURITY', 'EXTERNAL',
                        'CHAT_MESSAGE', 'CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_CHANGED',
                        'PROJECT_TASK', 'PROJECT_REPORT', 'AI_AGENT'));

-- Người duyệt đang giữ việc của chứng từ (đích "approvers" của hành động notify)
CREATE FUNCTION wf.open_approvers(p_type text, p_id uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT DISTINCT t.assignee_id
    FROM wf.approval_step s JOIN wf.task t ON t.step_id = s.id
    WHERE s.entity_type = p_type AND s.entity_id = p_id AND t.status = 'OPEN' AND t.assignee_id IS NOT NULL
$$;
