-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Đăng ký sử dụng đơn giản cho doanh nghiệp nhỏ (ADR #62).

-- Lĩnh vực kinh doanh và quy mô tự khai lúc đăng ký: dùng để gợi ý phòng ban, công cụ và báo cáo
ALTER TABLE core.tenant
    ADD COLUMN industry text CHECK (length(btrim(industry)) BETWEEN 1 AND 100),
    ADD COLUMN size_band text CHECK (size_band IN ('1-10', '11-50', '51-200', '200+'));

-- Hộ kinh doanh dùng mã số thuế cá nhân 12 chữ số (số định danh cá nhân)
ALTER TABLE core.tenant DROP CONSTRAINT tenant_tax_code_check;
ALTER TABLE core.tenant ADD CONSTRAINT tenant_tax_code_check
    CHECK (tax_code ~ '^([0-9]{10}(-[0-9]{3})?|[0-9]{12})$');

-- Thông tin liên hệ cơ bản của người dùng, khai khi đăng ký hoặc khi quản trị viên thêm người
ALTER TABLE core.person
    ADD COLUMN birth_year smallint CHECK (birth_year BETWEEN 1900 AND 2100),
    ADD COLUMN phone text CHECK (phone ~ '^\+?[0-9 .-]{8,20}$'),
    ADD COLUMN email text CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
