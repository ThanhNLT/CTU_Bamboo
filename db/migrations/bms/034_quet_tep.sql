-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Một tệp chỉ được coi là sạch (CLEAN) sau khi ít nhất một công cụ đã quét xong. Trước đây khi chưa bật ClamAV, tệp vẫn
-- được ghi "CLEAN – bỏ qua". Nay ghi rõ công cụ đã quét và báo cáo; tệp cũ chưa từng được quét được đánh dấu để quét lại.

ALTER TABLE core.attachment
    ADD COLUMN scan_engines text[] NOT NULL DEFAULT '{}',
    ADD COLUMN scan_report  jsonb;
COMMENT ON COLUMN core.attachment.scan_engines IS 'Các công cụ đã quét xong tệp; {unscanned} là tệp cũ chờ quét lại';
COMMENT ON COLUMN core.attachment.scan_report IS 'Báo cáo quét: công cụ, các kiểm tra đã chạy, phát hiện';

ALTER TABLE core.attachment DISABLE TRIGGER attachment_check;
UPDATE core.attachment
SET scan_engines = CASE WHEN scan_result IS NULL OR scan_result LIKE 'bỏ qua%' THEN ARRAY['unscanned']
                        ELSE ARRAY['ClamAV'] END
WHERE status = 'CLEAN';
ALTER TABLE core.attachment ENABLE TRIGGER attachment_check;

ALTER TABLE core.attachment
    ADD CONSTRAINT attachment_clean_scanned CHECK (status <> 'CLEAN' OR cardinality(scan_engines) > 0);

-- Như bản trước, thêm: quét lại phát hiện vấn đề thì tệp CLEAN được chuyển INFECTED / REJECTED (chỉ khi bật bms.rescan)
CREATE OR REPLACE FUNCTION core.attachment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF collab.entity_tenant(NEW.entity_type, NEW.entity_id) IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'Không tìm thấy chứng từ' USING ERRCODE = 'data_exception';
        END IF;
        IF NEW.entity_type = 'collab.kb_document' AND NOT EXISTS (
            SELECT 1 FROM collab.kb_document WHERE id = NEW.entity_id AND requester_id = NEW.uploaded_by
                                                  AND status IN ('DRAFT', 'RETURNED')) THEN
            RAISE EXCEPTION 'Chỉ người lập thêm tệp khi đề xuất còn nháp hoặc bị trả về'
                USING ERRCODE = 'data_exception';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id, NEW.entity_type, NEW.entity_id, NEW.storage_key, NEW.uploaded_by)
       IS DISTINCT FROM (OLD.tenant_id, OLD.entity_type, OLD.entity_id, OLD.storage_key, OLD.uploaded_by) THEN
        RAISE EXCEPTION 'Không đổi chứng từ, khóa lưu trữ hoặc người tải lên của tệp đính kèm';
    END IF;
    IF NEW.status <> OLD.status AND OLD.status <> 'PENDING'
       AND NOT (OLD.status = 'CLEAN' AND NEW.status IN ('INFECTED', 'REJECTED')
                AND coalesce(current_setting('bms.rescan', true), '') = 'on') THEN
        RAISE EXCEPTION 'Tệp đính kèm đã ở trạng thái %', OLD.status;
    END IF;
    IF OLD.status = 'CLEAN' AND NEW.status = 'CLEAN' AND NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
        RAISE EXCEPTION 'Không đổi mã băm của tệp đã nhận';
    END IF;
    IF OLD.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Tệp đính kèm đã bị xóa';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND (
        (NEW.entity_type = 'proc.purchase_request' AND EXISTS (
            SELECT 1 FROM proc.purchase_request WHERE id = NEW.entity_id AND status IN ('APPROVED', 'REJECTED', 'CANCELLED')))
        OR (NEW.entity_type = 'hr.onboarding_request' AND EXISTS (
            SELECT 1 FROM hr.onboarding_request WHERE id = NEW.entity_id AND status IN ('APPROVED', 'REJECTED', 'CANCELLED')))
        OR (NEW.entity_type = 'collab.kb_document' AND EXISTS (
            SELECT 1 FROM collab.kb_document WHERE id = NEW.entity_id AND status NOT IN ('DRAFT', 'RETURNED', 'PENDING')))
    ) THEN
        RAISE EXCEPTION 'Chứng từ đã có kết quả nên không xóa được tệp đính kèm';
    END IF;
    RETURN NEW;
END $$;

-- Tệp chờ quét lại, mới nhất trước (dùng cho tiến trình nền)
CREATE INDEX attachment_unscanned ON core.attachment (created_at) WHERE status = 'CLEAN' AND scan_engines = '{unscanned}';
