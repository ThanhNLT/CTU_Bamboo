-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 051: Không gian I (ADR #63): Trợ lý RAG dùng lại câu trả lời khi cùng câu hỏi trên cùng ngữ cảnh, giới hạn số lần
-- thử lại khi Ollama tạm lỗi; biểu đồ BI tự dựng trên lớp ngữ nghĩa được lưu lại.

ALTER TABLE core.ai_question
    -- Băm của câu hỏi đã chuẩn hóa, mô hình, chế độ và các đoạn tài liệu đưa vào ngữ cảnh
    ADD COLUMN context_key text,
    -- Lượt hỏi trước đó có cùng context_key mà câu trả lời được dùng lại (không gọi mô hình sinh)
    ADD COLUMN reused_from uuid REFERENCES core.ai_question ON DELETE SET NULL,
    -- Số lần trả về hàng đợi vì Ollama tạm không trả lời
    ADD COLUMN attempts int NOT NULL DEFAULT 0;

CREATE INDEX ai_question_context ON core.ai_question (tenant_id, context_key, finished_at DESC)
    WHERE status = 'done' AND context_key IS NOT NULL;
CREATE INDEX ai_question_reused ON core.ai_question (reused_from) WHERE reused_from IS NOT NULL;

-- Biểu đồ BI: định nghĩa truy vấn theo tên nghiệp vụ của lớp ngữ nghĩa (không lưu SQL, không lưu số liệu)
CREATE TABLE kpi.chart (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL,
    person_id   uuid NOT NULL,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    chart_type  text NOT NULL CHECK (chart_type IN ('bar', 'stacked', 'line', 'area', 'pie', 'table')),
    spec        jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object' AND spec ? 'metrics'),
    shared      boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX chart_owner ON kpi.chart (tenant_id, person_id, updated_at DESC);
CREATE INDEX chart_shared ON kpi.chart (tenant_id, updated_at DESC) WHERE shared;

CREATE FUNCTION kpi.chart_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT'
       AND (SELECT count(*) FROM kpi.chart WHERE tenant_id = NEW.tenant_id AND person_id = NEW.person_id) >= 50 THEN
        RAISE EXCEPTION 'Mỗi người lưu tối đa 50 biểu đồ' USING ERRCODE = 'data_exception';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER chart_touch BEFORE INSERT OR UPDATE ON kpi.chart FOR EACH ROW EXECUTE FUNCTION kpi.chart_touch();

-- Trường tính toán Hasura: biểu đồ của người gọi hay được người khác chia sẻ
CREATE FUNCTION kpi.chart_is_mine(p_row kpi.chart, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT p_row.person_id = (hasura_session ->> 'x-hasura-user-id')::uuid
$$;
