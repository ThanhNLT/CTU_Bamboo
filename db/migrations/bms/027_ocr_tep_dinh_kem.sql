-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 027: OCR tệp đính kèm quét (ADR #52).

-- Việc OCR của một tệp: ảnh luôn OCR, PDF chỉ OCR trang không có chữ. ai-worker làm từng trang một,
-- chung hàng đợi mô hình chính với lượt hỏi. Văn bản OCR chỉ dùng để tìm, không hiện riêng.
CREATE TABLE core.attachment_ocr (
    tenant_id        uuid NOT NULL,
    attachment_id    uuid PRIMARY KEY,
    status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'ERROR', 'SKIPPED')),
    pages            int[],
    pages_total      int,
    pages_done       int NOT NULL DEFAULT 0,
    page_texts       text[] NOT NULL DEFAULT '{}',
    note             text,
    error            text,
    attempts         int NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (tenant_id, attachment_id) REFERENCES core.attachment (tenant_id, id) ON DELETE CASCADE,
    CHECK (pages_done <= coalesce(pages_total, 0))
);
CREATE INDEX attachment_ocr_queue ON core.attachment_ocr (next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'RUNNING');

CREATE FUNCTION core.ocr_type(p_content_type text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_content_type IN ('application/pdf', 'image/png', 'image/jpeg') $$;

CREATE FUNCTION core.ocr_enqueue(p_tenant uuid, p_attachment uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO core.attachment_ocr (tenant_id, attachment_id) VALUES (p_tenant, p_attachment)
    ON CONFLICT (attachment_id) DO NOTHING;
    PERFORM pg_notify('ai_question', 'ocr:' || p_attachment);
END $$;

CREATE FUNCTION core.attachment_ocr_enqueue() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'CLEAN' AND OLD.status IS DISTINCT FROM 'CLEAN' AND NEW.deleted_at IS NULL
       AND core.ocr_type(NEW.content_type) AND search.attachment_indexable(NEW.entity_type) THEN
        PERFORM core.ocr_enqueue(NEW.tenant_id, NEW.id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER attachment_ocr_enqueue AFTER UPDATE OF status ON core.attachment
FOR EACH ROW EXECUTE FUNCTION core.attachment_ocr_enqueue();

-- OCR xong thì đánh chỉ mục lại tệp (và đoạn RAG nếu là tệp của tài liệu thư viện).
CREATE FUNCTION core.attachment_ocr_done() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    a record;
BEGIN
    SELECT entity_type, entity_id INTO a FROM core.attachment WHERE id = NEW.attachment_id;
    PERFORM search.mark(NEW.tenant_id, 'core.attachment', NEW.attachment_id);
    IF a.entity_type = 'collab.kb_document' THEN
        PERFORM search.mark_chunk(NEW.tenant_id, a.entity_id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER attachment_ocr_done AFTER UPDATE OF status ON core.attachment_ocr
FOR EACH ROW WHEN (NEW.status = 'DONE' AND OLD.status <> 'DONE') EXECUTE FUNCTION core.attachment_ocr_done();

-- Kiểm toán khi xếp hàng và khi người dùng thử lại; bỏ các bước worker ghi từng trang để văn bản OCR
-- không bị chép nhiều lần vào nhật ký.
CREATE TRIGGER audit_log AFTER INSERT ON core.attachment_ocr
FOR EACH ROW EXECUTE FUNCTION audit.log_change('attachment_id');
CREATE TRIGGER audit_log_retry AFTER UPDATE OF status ON core.attachment_ocr
FOR EACH ROW WHEN (NEW.status = 'PENDING' AND OLD.status <> 'PENDING')
EXECUTE FUNCTION audit.log_change('attachment_id');

-- Tệp đã có từ trước: xếp hàng OCR bù.
INSERT INTO core.attachment_ocr (tenant_id, attachment_id)
SELECT tenant_id, id FROM core.attachment
WHERE status = 'CLEAN' AND deleted_at IS NULL AND core.ocr_type(content_type)
  AND search.attachment_indexable(entity_type);
