-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 009: Tệp đính kèm chứng từ (ADR #26; dịch vụ nền tảng mục 2).
--
-- Tệp nằm ở S3 (SeaweedFS), CSDL chỉ giữ metadata. Vòng đời:
--   PENDING   đã cấp link tải lên bucket cách ly, chờ trình duyệt PUT và confirm_upload
--   CLEAN     đã quét sạch, chuyển sang bucket chính; chỉ trạng thái này tải về được
--   INFECTED  quét thấy mã độc, tệp đã bị xóa
--   REJECTED  tệp tải lên không khớp khai báo (thiếu, quá cỡ), tệp đã bị xóa
-- Dịch vụ actions là nơi duy nhất ghi bảng này (Hasura chỉ cho xem).

CREATE TABLE core.attachment (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   text NOT NULL,
    entity_id     uuid NOT NULL,
    file_name     text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
    content_type  text NOT NULL,
    size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
    storage_key   text NOT NULL UNIQUE,
    status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEAN', 'INFECTED', 'REJECTED')),
    sha256        text,
    scan_result   text,
    uploaded_by   uuid NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    scanned_at    timestamptz,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, uploaded_by) REFERENCES core.person (tenant_id, id),
    CHECK (status <> 'CLEAN' OR sha256 IS NOT NULL)
);
CREATE INDEX ON core.attachment (entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX ON core.attachment (tenant_id, uploaded_by);

-- Chứng từ phải cùng tenant; trạng thái chỉ đi tiếp từ PENDING.
CREATE FUNCTION core.attachment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF collab.entity_tenant(NEW.entity_type, NEW.entity_id) IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'Không tìm thấy chứng từ' USING ERRCODE = 'data_exception';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id, NEW.entity_type, NEW.entity_id, NEW.storage_key, NEW.uploaded_by)
       IS DISTINCT FROM (OLD.tenant_id, OLD.entity_type, OLD.entity_id, OLD.storage_key, OLD.uploaded_by) THEN
        RAISE EXCEPTION 'Không đổi chứng từ, khóa lưu trữ hoặc người tải lên của tệp đính kèm';
    END IF;
    IF NEW.status <> OLD.status AND OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Tệp đính kèm đã ở trạng thái %', OLD.status;
    END IF;
    IF OLD.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Tệp đính kèm đã bị xóa';
    END IF;
    -- Chứng từ đã có kết quả thì giữ nguyên tệp làm chứng cứ.
    IF NEW.deleted_at IS NOT NULL AND NEW.entity_type = 'proc.purchase_request' AND EXISTS (
        SELECT 1 FROM proc.purchase_request WHERE id = NEW.entity_id AND status IN ('APPROVED', 'REJECTED', 'CANCELLED')
    ) THEN
        RAISE EXCEPTION 'Đề nghị đã có kết quả nên không xóa được tệp đính kèm';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER attachment_check BEFORE INSERT OR UPDATE ON core.attachment
FOR EACH ROW EXECUTE FUNCTION core.attachment_check();

-- Computed field `can_read` của Hasura: xem tệp khi xem được chứng từ gốc.
CREATE FUNCTION core.attachment_can_read(p_row core.attachment, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read(p_row.entity_type, p_row.entity_id, core.session_person(hasura_session))
$$;

CALL audit.enable('core.attachment');
