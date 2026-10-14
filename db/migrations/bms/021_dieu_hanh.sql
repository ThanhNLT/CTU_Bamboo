-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

ALTER TABLE core.org_unit
    ADD COLUMN province text CHECK (province IS NULL OR length(btrim(province)) BETWEEN 2 AND 100),
    ADD COLUMN lat numeric(8, 5) CHECK (lat BETWEEN -90 AND 90),
    ADD COLUMN lng numeric(8, 5) CHECK (lng BETWEEN -180 AND 180),
    ADD CONSTRAINT org_unit_location_check CHECK ((lat IS NULL) = (lng IS NULL));

COMMENT ON COLUMN core.org_unit.province IS 'Tỉnh / thành của cơ sở (nhà máy, kho, bệnh viện); lọc trên Trung tâm điều hành';
COMMENT ON COLUMN core.org_unit.lat IS 'Vĩ độ cơ sở (WGS 84); có tọa độ thì đơn vị hiện trên bản đồ điều hành';

INSERT INTO core.permission (code, description) VALUES
    ('ops.group.read', 'Xem số liệu điều hành tổng hợp (không có chứng từ, không có dữ liệu cá nhân) của các tenant con');

CREATE FUNCTION core.child_tenants(p_tenant uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT child_tenant_id FROM core.tenant_relation WHERE parent_tenant_id = p_tenant
$$;

CREATE FUNCTION wf.entity_unit(p_type text, p_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT CASE p_type
        WHEN 'proc.purchase_request' THEN (SELECT org_unit_id FROM proc.purchase_request WHERE id = p_id)
        WHEN 'hr.onboarding_request' THEN (SELECT target_unit_id FROM hr.onboarding_request WHERE id = p_id)
        WHEN 'collab.kb_document' THEN (SELECT org_unit_id FROM collab.kb_document WHERE id = p_id)
        WHEN 'ic.ic_order' THEN (SELECT seller_unit_id FROM ic.ic_order WHERE id = p_id)
    END
$$;
