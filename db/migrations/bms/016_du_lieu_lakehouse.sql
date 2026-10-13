-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 016: Xem dữ liệu Lakehouse của tenant (ADR #45).
--
-- Trang Dịch vụ dữ liệu đọc tầng silver qua Trino: dịch vụ actions kiểm quyền này ở đơn vị gốc của tenant rồi
-- truy vấn dưới danh nghĩa người dùng Trino của tenant (t_<tenant_id>); row filter của Trino giữ dữ liệu trong
-- đúng tenant. Quyền cấp qua vai trò như mọi quyền khác (dữ liệu demo: vai trò PHAN_TICH_DU_LIEU).

INSERT INTO core.permission (code, description) VALUES
    ('data.lakehouse.read', 'Xem tập dữ liệu Lakehouse (tầng silver) của tenant, dữ liệu cá nhân đã che');
