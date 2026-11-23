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

-- Tác tử mức đề xuất chờ duyệt (ADR #85): hành động của tác tử `suggest` thành đề xuất giao cho người có thẩm quyền,
-- người đó chấp nhận thì hệ thống thực hiện dưới quyền của chính họ. Trả lại chứng từ và tạo công việc dự án chỉ có ở
-- mức này, không bao giờ tự chạy.

ALTER TABLE core.ai_agent
    DROP CONSTRAINT ai_agent_autonomy_check,
    DROP CONSTRAINT ai_agent_allowed_actions_check,
    ADD COLUMN project_id uuid,
    ADD CONSTRAINT ai_agent_autonomy_check CHECK (autonomy IN ('act', 'dry_run', 'suggest')),
    ADD CONSTRAINT ai_agent_allowed_actions_check
        CHECK (allowed_actions <@ ARRAY['comment', 'notify', 'webhook', 'return_for_info', 'project_task']),
    ADD CONSTRAINT ai_agent_suggest_only_check
        CHECK (autonomy = 'suggest' OR NOT (allowed_actions && ARRAY['return_for_info', 'project_task'])),
    ADD CONSTRAINT ai_agent_project_check
        CHECK (NOT ('project_task' = ANY (allowed_actions)) OR project_id IS NOT NULL),
    ADD CONSTRAINT ai_agent_project_fkey FOREIGN KEY (tenant_id, project_id) REFERENCES pm.project (tenant_id, id);
CREATE INDEX ai_agent_project ON core.ai_agent (tenant_id, project_id);

CREATE TABLE core.ai_suggestion (
    tenant_id     uuid NOT NULL REFERENCES core.tenant ON DELETE CASCADE,
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id        uuid NOT NULL REFERENCES core.ai_agent_run ON DELETE CASCADE,
    agent_id      uuid NOT NULL REFERENCES core.ai_agent ON DELETE CASCADE,
    seq           int NOT NULL CHECK (seq BETWEEN 0 AND 9),
    entity_type   text,
    entity_id     uuid,
    action        jsonb NOT NULL CHECK (jsonb_typeof(action) = 'object'
                                        AND action ->> 'type' IN ('comment', 'notify', 'webhook', 'return_for_info',
                                                                  'project_task')),
    recipient_id  uuid NOT NULL,
    status        text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'ACCEPTED', 'DISMISSED', 'FAILED', 'EXPIRED')),
    decided_by    uuid,
    decided_at    timestamptz,
    reason        text CHECK (length(reason) <= 500),
    result        jsonb,
    expires_at    timestamptz NOT NULL DEFAULT now() + interval '14 days',
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (run_id, seq, recipient_id),
    FOREIGN KEY (tenant_id, recipient_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, decided_by) REFERENCES core.person (tenant_id, id),
    CHECK ((status = 'PENDING') = (decided_at IS NULL)),
    CHECK (action ->> 'type' <> 'return_for_info' OR entity_id IS NOT NULL)
);
CREATE INDEX ai_suggestion_recipient ON core.ai_suggestion (tenant_id, recipient_id, created_at DESC);
CREATE INDEX ai_suggestion_pending ON core.ai_suggestion (expires_at) WHERE status = 'PENDING';
CREATE INDEX ai_suggestion_entity ON core.ai_suggestion (entity_type, entity_id);
CREATE INDEX ai_suggestion_agent ON core.ai_suggestion (agent_id, created_at DESC);
CREATE INDEX ai_suggestion_decided_by ON core.ai_suggestion (tenant_id, decided_by);

CREATE FUNCTION core.ai_suggestion_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.tenant_id, NEW.run_id, NEW.agent_id, NEW.seq, NEW.entity_type, NEW.entity_id, NEW.recipient_id,
        NEW.created_at, NEW.expires_at)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.run_id, OLD.agent_id, OLD.seq, OLD.entity_type, OLD.entity_id, OLD.recipient_id,
        OLD.created_at, OLD.expires_at) THEN
        RAISE EXCEPTION 'Không sửa được nguồn gốc của đề xuất AI' USING ERRCODE = 'data_exception';
    END IF;
    IF OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Đề xuất AI đã được xử lý' USING ERRCODE = 'data_exception';
    END IF;
    IF NEW.action IS DISTINCT FROM OLD.action AND NEW.status NOT IN ('ACCEPTED', 'FAILED') THEN
        RAISE EXCEPTION 'Chỉ sửa được nội dung đề xuất khi chấp nhận' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER ai_suggestion_guard BEFORE UPDATE ON core.ai_suggestion
    FOR EACH ROW EXECUTE FUNCTION core.ai_suggestion_guard();

-- Đánh dấu hết hạn: quá expires_at, hoặc đề xuất trả lại mà người nhận không còn việc duyệt mở trên chứng từ
-- (chứng từ đã rời PENDING, việc đã chuyển người). p_recipient giới hạn theo một người (gọi khi đọc / chấp nhận).
CREATE FUNCTION core.ai_suggestion_expire(p_at timestamptz DEFAULT now(), p_recipient uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_n int;
BEGIN
    UPDATE core.ai_suggestion s
    SET status = 'EXPIRED', decided_at = p_at,
        reason = CASE WHEN s.expires_at <= p_at THEN 'Đề xuất quá hạn mà chưa được xử lý'
                      ELSE 'Chứng từ không còn chờ người nhận duyệt' END
    WHERE s.status = 'PENDING'
      AND (p_recipient IS NULL OR s.recipient_id = p_recipient)
      AND (s.expires_at <= p_at
           OR (s.action ->> 'type' = 'return_for_info'
               AND NOT EXISTS (SELECT FROM wf.open_approvers(s.entity_type, s.entity_id) a(p)
                               WHERE a.p = s.recipient_id)));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION wf.refresh_all(p_at timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    v_pos   uuid;
    v_count int := 0;
BEGIN
    FOR v_pos IN
        SELECT assigned_position_id FROM wf.task WHERE status = 'OPEN'
        UNION
        SELECT requester_position_id FROM proc.purchase_request WHERE status IN ('DRAFT', 'PENDING', 'RETURNED')
    LOOP
        PERFORM wf.refresh_position(v_pos, p_at);
        v_count := v_count + 1;
    END LOOP;
    PERFORM core.ai_suggestion_expire(p_at);
    RETURN v_count;
END $$;

CALL audit.enable('core.ai_suggestion');
