-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Ghi lại từng lần sao lưu theo lịch và từng lần diễn tập khôi phục (khôi phục vào CSDL tạm rồi kiểm tra chuỗi băm kiểm toán,
-- bản neo và số dòng). Bản ghi chỉ thêm, không sửa, để chứng minh bản sao lưu dùng được chứ không chỉ tồn tại.

CREATE TABLE audit.backup_run (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind         text NOT NULL CHECK (kind IN ('BACKUP', 'DRILL')),
    status       text NOT NULL CHECK (status IN ('OK', 'FAILED')),
    location     text,
    size_bytes   bigint,
    detail       jsonb NOT NULL DEFAULT '{}',
    started_at   timestamptz NOT NULL,
    finished_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit.backup_run (kind, finished_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.backup_run
FOR EACH ROW EXECUTE FUNCTION audit.append_only();

-- Diễn tập khôi phục phát hiện: pg_dump ghi mệnh đề WHEN của trigger không kèm tên lược đồ, còn pg_restore chạy với
-- search_path rỗng nên không tìm thấy toán tử của kiểu ltree (nằm trong lược đồ public) và bản sao lưu không khôi phục
-- được. So sánh dưới dạng văn bản thì chỉ dùng toán tử có sẵn của hệ thống.
DROP TRIGGER org_unit_after_move ON core.org_unit;
CREATE TRIGGER org_unit_after_move AFTER UPDATE OF parent_id ON core.org_unit
FOR EACH ROW WHEN (OLD.path::text IS DISTINCT FROM NEW.path::text)
EXECUTE FUNCTION core.org_unit_after_move();
