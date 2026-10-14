-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 021: Trung tâm điều hành dùng dữ liệu thật (ADR #49).
--
-- Bảng Quy trình, Sản xuất, Bệnh viện, Chất lượng dữ liệu tính từ dữ liệu có sẵn (chuỗi duyệt, lô, đơn nội bộ, đơn
-- mua, tổ chức); không thêm bảng nghiệp vụ. Thêm: vị trí cơ sở trên đơn vị (tỉnh, tọa độ) cho khối bản đồ; quyền xem
-- số liệu TỔNG HỢP của tenant con (bệnh viện là tenant riêng vì dữ liệu y tế, ADR #22: công ty mẹ chỉ nhận số tổng).

-- ---------------------------------------------------------------------------
-- Vị trí cơ sở của đơn vị
-- ---------------------------------------------------------------------------

ALTER TABLE core.org_unit
    ADD COLUMN province text CHECK (province IS NULL OR length(btrim(province)) BETWEEN 2 AND 100),
    ADD COLUMN lat numeric(8, 5) CHECK (lat BETWEEN -90 AND 90),
    ADD COLUMN lng numeric(8, 5) CHECK (lng BETWEEN -180 AND 180),
    ADD CONSTRAINT org_unit_location_check CHECK ((lat IS NULL) = (lng IS NULL));

COMMENT ON COLUMN core.org_unit.province IS 'Tỉnh / thành của cơ sở (nhà máy, kho, bệnh viện); lọc trên Trung tâm điều hành';
COMMENT ON COLUMN core.org_unit.lat IS 'Vĩ độ cơ sở (WGS 84); có tọa độ thì đơn vị hiện trên bản đồ điều hành';

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------

INSERT INTO core.permission (code, description) VALUES
    ('ops.group.read', 'Xem số liệu điều hành tổng hợp (không có chứng từ, không có dữ liệu cá nhân) của các tenant con');

-- Tenant con trực tiếp của một tenant (ví dụ Bệnh viện X của Tập đoàn X).
CREATE FUNCTION core.child_tenants(p_tenant uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT child_tenant_id FROM core.tenant_relation WHERE parent_tenant_id = p_tenant
$$;

-- ---------------------------------------------------------------------------
-- Đơn vị phụ trách của một chứng từ (gom số liệu theo công ty / cơ sở)
-- ---------------------------------------------------------------------------

-- Đề nghị mua sắm, đề xuất tài liệu: đơn vị lập; tiếp nhận nhân sự: đơn vị nhận người; đơn nội bộ: bên bán.
CREATE FUNCTION wf.entity_unit(p_type text, p_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT CASE p_type
        WHEN 'proc.purchase_request' THEN (SELECT org_unit_id FROM proc.purchase_request WHERE id = p_id)
        WHEN 'hr.onboarding_request' THEN (SELECT target_unit_id FROM hr.onboarding_request WHERE id = p_id)
        WHEN 'collab.kb_document' THEN (SELECT org_unit_id FROM collab.kb_document WHERE id = p_id)
        WHEN 'ic.ic_order' THEN (SELECT seller_unit_id FROM ic.ic_order WHERE id = p_id)
    END
$$;
