-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Số liệu KPI đã đóng băng đi vào Lakehouse qua CDC như các bảng nghiệp vụ khác (chỉ bảng bản chụp; kpi.value tính lại
-- từ dữ liệu nguồn nên không cần).
ALTER PUBLICATION bms_cdc ADD TABLE kpi.snapshot;

-- Vai trò CDC đọc được bảng này (grants.sql chỉ cấp cho schema nằm trọn trong publication)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bamboo_cdc') THEN
        GRANT USAGE ON SCHEMA kpi TO bamboo_cdc;
        GRANT SELECT ON kpi.snapshot TO bamboo_cdc;
    END IF;
END $$;
