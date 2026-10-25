-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Neo chuỗi kiểm toán ra ngoài CSDL: định kỳ ký (khóa Ed25519 nằm trong OpenBao) đầu chuỗi băm của từng tenant và công bố
-- bản ký tới kho đối tượng, tùy chọn tới một điểm công bố bên ngoài. Kẻ sửa trực tiếp CSDL không viết lại được lịch sử
-- đã neo vì không thể ký lại; audit.check_anchors phát hiện bản ghi bị cắt hoặc viết lại.

CREATE TABLE audit.anchor (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seq          bigint NOT NULL CHECK (seq > 0),
    head_hash    bytea NOT NULL,
    statement    text NOT NULL,
    signature    jsonb NOT NULL,
    published    jsonb NOT NULL DEFAULT '[]',
    anchored_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, seq)
);
CREATE INDEX ON audit.anchor (tenant_id, seq DESC);

-- Chỉ được cập nhật nơi đã công bố (để thử công bố lại); nội dung đã ký và chữ ký bất biến
CREATE FUNCTION audit.anchor_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Bản neo chuỗi kiểm toán chỉ cho ghi thêm' USING ERRCODE = 'data_exception';
    END IF;
    IF (NEW.tenant_id, NEW.seq, NEW.head_hash, NEW.statement, NEW.signature, NEW.anchored_at)
       IS DISTINCT FROM (OLD.tenant_id, OLD.seq, OLD.head_hash, OLD.statement, OLD.signature, OLD.anchored_at) THEN
        RAISE EXCEPTION 'Bản neo chuỗi kiểm toán chỉ cho ghi thêm' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER anchor_guard BEFORE UPDATE OR DELETE ON audit.anchor
FOR EACH ROW EXECUTE FUNCTION audit.anchor_guard();

-- Đối chiếu từng bản neo với chuỗi hiện tại: thiếu bản ghi hoặc mã băm khác nghĩa là lịch sử đã bị cắt hoặc viết lại
CREATE FUNCTION audit.check_anchors(p_tenant uuid)
RETURNS TABLE (anchor_id uuid, anchor_seq bigint, problem text)
LANGUAGE sql STABLE AS $$
    SELECT a.id, a.seq,
           CASE WHEN l.id IS NULL THEN 'LOG_TRUNCATED' ELSE 'LOG_REWRITTEN' END
    FROM audit.anchor a
    LEFT JOIN audit.log l ON l.tenant_id = a.tenant_id AND l.seq = a.seq
    WHERE a.tenant_id = p_tenant AND (l.id IS NULL OR l.hash <> a.head_hash)
    ORDER BY a.seq
$$;
