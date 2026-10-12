-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 015: Quản trị dữ liệu của tenant qua giao diện (ADR #44).
--
-- Người có quyền quản trị (core.org.manage, core.permission.manage, mdm.manage) tự nhập cơ cấu tổ chức,
-- người dùng, bổ nhiệm, vai trò, cấp quyền, danh mục và dữ liệu chủ. Ghi đi qua Action `admin_*` (kiểm quyền
-- bằng core.has_permission theo đơn vị đích); mọi ràng buộc nghiệp vụ vẫn nằm ở trigger và ràng buộc sẵn có.

-- Người đang có ít nhất một quyền quản trị trong tenant (không xét phạm vi đơn vị). Hasura dùng làm điều kiện
-- cho quản trị viên xem bảng vai trò và cấp quyền, như audit.v_reader cho nhật ký.
CREATE VIEW core.v_admin AS
SELECT DISTINCT tenant_id, person_id
FROM core.v_permission_grant
WHERE permission_code IN ('core.org.manage', 'core.permission.manage', 'mdm.manage')
  AND valid_period @> now();

-- Danh mục (loại đơn vị, chức danh, nhóm vật tư) giờ sửa được từ giao diện: ghi nhật ký như bảng tổ chức.
CALL audit.enable('core.catalog_item');
