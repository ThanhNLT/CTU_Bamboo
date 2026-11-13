-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, 'core.ai.manage'
FROM core.role r
WHERE r.code = 'QUAN_TRI_TO_CHUC'
  AND NOT EXISTS (SELECT FROM core.role_permission p WHERE p.role_id = r.id AND p.permission_code = 'core.ai.manage');

CREATE OR REPLACE FUNCTION core.create_tenant(p_code text, p_name text, p_root_type text DEFAULT 'CONG_TY', p_parent text DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, root_unit_id uuid, director_position_id uuid, admin_position_id uuid)
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant uuid;
    v_root uuid;
    v_parent uuid;
    v_director uuid;
    v_admin uuid;
    v_role uuid;
    v_titles jsonb := '{}';
    v_types jsonb := '{}';
    t record;
    r record;
BEGIN
    IF p_code !~ '^[A-Z][A-Z0-9_]{1,19}$' THEN
        RAISE EXCEPTION 'Mã công ty % không hợp lệ: chữ in hoa không dấu, số, gạch dưới, 2-20 ký tự', p_code;
    END IF;
    IF EXISTS (SELECT FROM core.tenant WHERE code = p_code) THEN
        RAISE EXCEPTION 'Công ty % đã có, không tạo lại', p_code;
    END IF;
    INSERT INTO core.tenant (code, name) VALUES (p_code, p_name) RETURNING id INTO v_tenant;
    IF p_parent IS NOT NULL THEN
        SELECT id INTO v_parent FROM core.tenant WHERE code = p_parent;
        IF v_parent IS NULL THEN
            RAISE EXCEPTION 'Không có công ty mẹ %', p_parent;
        END IF;
        INSERT INTO core.tenant_relation (parent_tenant_id, child_tenant_id) VALUES (v_parent, v_tenant);
    END IF;

    FOR t IN SELECT * FROM (VALUES ('TAP_DOAN', 'Tập đoàn'), ('CONG_TY', 'Công ty'), ('BENH_VIEN', 'Bệnh viện'),
                                   ('HOI_DONG', 'Hội đồng'), ('KHOI', 'Khối'), ('PHONG', 'Phòng'),
                                   ('VAN_PHONG', 'Văn phòng'), ('NHA_MAY', 'Nhà máy'), ('PHAN_XUONG', 'Phân xưởng'),
                                   ('MIEN', 'Miền'), ('CHI_NHANH', 'Chi nhánh'), ('TRUNG_TAM', 'Trung tâm'),
                                   ('DOI', 'Đội'), ('KHOA', 'Khoa')) v(code, name) LOOP
        INSERT INTO core.catalog_item (tenant_id, catalog, code, name) VALUES (v_tenant, 'UNIT_TYPE', t.code, t.name)
        RETURNING jsonb_build_object(t.code, id) || v_types INTO v_types;
    END LOOP;
    IF NOT v_types ? p_root_type THEN
        RAISE EXCEPTION 'Loại đơn vị gốc % không hợp lệ', p_root_type;
    END IF;
    FOR t IN SELECT * FROM (VALUES ('GIAM_DOC', 'Giám đốc'), ('QUAN_TRI_HE_THONG', 'Quản trị hệ thống'),
                                   ('NHAN_VIEN', 'Nhân viên')) v(code, name) LOOP
        INSERT INTO core.catalog_item (tenant_id, catalog, code, name) VALUES (v_tenant, 'JOB_TITLE', t.code, t.name)
        RETURNING jsonb_build_object(t.code, id) || v_titles INTO v_titles;
    END LOOP;

    INSERT INTO core.org_unit (tenant_id, unit_type_id, code, name, is_legal_entity)
    VALUES (v_tenant, (v_types ->> p_root_type)::uuid, p_code, p_name, true) RETURNING id INTO v_root;
    INSERT INTO core.position (tenant_id, org_unit_id, job_title_id, name, is_head)
    VALUES (v_tenant, v_root, (v_titles ->> 'GIAM_DOC')::uuid, 'Giám đốc', true) RETURNING id INTO v_director;
    INSERT INTO core.position (tenant_id, org_unit_id, job_title_id, name)
    VALUES (v_tenant, v_root, (v_titles ->> 'QUAN_TRI_HE_THONG')::uuid, 'Quản trị hệ thống') RETURNING id INTO v_admin;

    FOR r IN SELECT * FROM (VALUES
        ('NHAN_VIEN', 'Nhân viên', ARRAY['proc.purchase_request.create', 'proc.purchase_request.read']),
        ('QUAN_LY', 'Quản lý', ARRAY['proc.purchase_request.read', 'wf.approval.act', 'hr.onboarding.read', 'ic.order.read']),
        ('KIEM_SOAT', 'Kiểm soát tài chính', ARRAY['proc.purchase_request.read', 'audit.read']),
        ('QUAN_TRI_TO_CHUC', 'Quản trị tổ chức', ARRAY['core.org.manage', 'core.permission.manage', 'core.module.manage',
                                                       'mdm.manage', 'audit.read', 'wf.process.design', 'core.ai.manage'])
    ) v(code, name, perms) LOOP
        INSERT INTO core.role (tenant_id, code, name) VALUES (v_tenant, r.code, r.name) RETURNING id INTO v_role;
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT v_tenant, v_role, unnest(r.perms);
        IF r.code = 'NHAN_VIEN' THEN
            INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope) VALUES (v_tenant, v_role, v_root, 'UNIT');
        ELSIF r.code = 'QUAN_TRI_TO_CHUC' THEN
            INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
            VALUES (v_tenant, v_role, v_admin, 'TENANT'), (v_tenant, v_role, v_director, 'TENANT');
        END IF;
    END LOOP;
    INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order)
    VALUES (v_tenant, 'PURCHASE_REQUEST', 0, 1), (v_tenant, 'ONBOARDING', 0, 1);

    RETURN QUERY SELECT v_tenant, v_root, v_director, v_admin;
END $$;
