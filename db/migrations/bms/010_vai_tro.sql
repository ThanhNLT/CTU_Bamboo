-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Tài khoản ứng dụng đặc quyền tối thiểu (ADR #35): Hasura và actions không còn là superuser, chỉ được
-- đọc nhật ký kiểm toán (db/roles/grants.sql). Trigger ghi nhật ký chạy bằng quyền chủ sở hữu để vẫn
-- ghi được chuỗi hash khi người gọi không có quyền ghi vào schema audit.
-- search_path cố định: người gọi không chèn được hàm hay bảng giả vào thân hàm SECURITY DEFINER.
-- session_user (người đăng nhập thật) vẫn được ghi vào actor_role khi không có phiên Hasura.

ALTER FUNCTION audit.log_change() SECURITY DEFINER SET search_path = pg_catalog, pg_temp;
REVOKE EXECUTE ON FUNCTION audit.log_change() FROM PUBLIC;
