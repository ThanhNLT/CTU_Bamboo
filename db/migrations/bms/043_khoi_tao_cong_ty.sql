-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Khởi tạo công ty lần đầu và chủ sở hữu (ADR #57).

-- Thông tin pháp lý của công ty; legal_status NULL là công ty có từ trước khi có quy trình khởi tạo (dữ liệu demo, lệnh CLI)
ALTER TABLE core.tenant
    ADD COLUMN tax_code text UNIQUE CHECK (tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'),
    ADD COLUMN legal_name text CHECK (length(btrim(legal_name)) BETWEEN 1 AND 300),
    ADD COLUMN address text CHECK (length(btrim(address)) BETWEEN 1 AND 500),
    ADD COLUMN legal_rep_name text CHECK (length(btrim(legal_rep_name)) BETWEEN 1 AND 200),
    ADD COLUMN legal_status text CHECK (legal_status IN ('UNVERIFIED', 'VERIFIED'));

-- Mã thiết lập một lần: chỉ lưu mã băm, mã rõ chỉ in ra log máy chủ (người có quyền trên máy chủ mới đọc được)
CREATE TABLE core.setup_code (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code_sha256  bytea NOT NULL CHECK (length(code_sha256) = 32),
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    failures     integer NOT NULL DEFAULT 0,
    used_at      timestamptz,
    revoked_at   timestamptz
);

-- Đơn đăng ký sử dụng: tệp PDF hệ thống sinh (kèm mã chống phát lại) để người đại diện ký số
CREATE TABLE core.setup_application (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose       text NOT NULL CHECK (purpose IN ('SETUP', 'VERIFY')),
    tenant_id     uuid REFERENCES core.tenant,
    token_sha256  bytea NOT NULL CHECK (length(token_sha256) = 32),
    nonce         text NOT NULL UNIQUE,
    data          jsonb NOT NULL,
    pdf           bytea NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    finished_at   timestamptz,
    CHECK ((purpose = 'VERIFY') = (tenant_id IS NOT NULL) OR finished_at IS NOT NULL)
);

-- Bằng chứng xác thực pháp lý: đơn đã ký và chứng thư của người ký
CREATE TABLE core.legal_verification (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    method           text NOT NULL CHECK (method = 'DIGITAL_SIGNATURE'),
    tax_code         text NOT NULL,
    signer_name      text,
    signer_subject   text NOT NULL,
    issuer           text NOT NULL,
    serial_number    text NOT NULL,
    signed_at        timestamptz,
    document_sha256  bytea NOT NULL CHECK (length(document_sha256) = 32),
    document         bytea NOT NULL,
    verified_at      timestamptz NOT NULL DEFAULT now(),
    verified_by      uuid,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, verified_by) REFERENCES core.person (tenant_id, id)
);

-- Chủ sở hữu: người đại diện theo pháp luật, mỗi công ty một người. `platform`: công ty tạo qua trang khởi tạo của máy
-- chủ tự cài, chủ sở hữu được cài/gỡ mô-đun trên máy như quản trị nền tảng (ADR #56)
CREATE TABLE core.tenant_owner (
    tenant_id        uuid PRIMARY KEY REFERENCES core.tenant,
    person_id        uuid NOT NULL,
    platform         boolean NOT NULL DEFAULT false,
    since            timestamptz NOT NULL DEFAULT now(),
    verification_id  uuid,
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, verification_id) REFERENCES core.legal_verification (tenant_id, id)
);

CALL audit.enable('core.tenant_owner', 'tenant_id');
CALL audit.enable('core.legal_verification');

-- Quyền quản trị chỉ chủ sở hữu được trao hoặc thu hồi ở công ty đã có chủ sở hữu
CREATE FUNCTION core.admin_permissions() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['core.org.manage', 'core.permission.manage', 'core.module.manage']
$$;

CREATE FUNCTION core.role_is_admin(p_role uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT FROM core.role_permission
                   WHERE role_id = p_role AND permission_code = ANY (core.admin_permissions()))
$$;

CREATE FUNCTION core.position_is_admin(p_position uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT FROM core.position p
        JOIN core.role_grant g ON g.tenant_id = p.tenant_id AND (g.position_id = p.id OR g.org_unit_id = p.org_unit_id)
        WHERE p.id = p_position AND (upper_inf(g.valid_period) OR upper(g.valid_period) > now())
          AND core.role_is_admin(g.role_id)
    )
$$;

CREATE FUNCTION core.require_owner(p_tenant uuid) RETURNS void
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_actor uuid := core.session_person(core.mutation_session());
    v_owner uuid;
BEGIN
    IF v_actor IS NULL THEN
        RETURN;  -- tiến trình hệ thống, migration, seed
    END IF;
    SELECT person_id INTO v_owner FROM core.tenant_owner WHERE tenant_id = p_tenant;
    IF v_owner IS NULL OR v_owner = v_actor THEN
        RETURN;  -- công ty chưa có chủ sở hữu giữ cách cũ
    END IF;
    RAISE EXCEPTION 'Chỉ chủ sở hữu công ty được trao hoặc thu hồi quyền quản trị';
END $$;

CREATE FUNCTION core.guard_admin_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    r record := coalesce(NEW, OLD);
BEGIN
    IF TG_TABLE_NAME = 'role_permission' THEN
        IF r.permission_code = ANY (core.admin_permissions())
           AND (TG_OP <> 'UPDATE' OR OLD.permission_code IS DISTINCT FROM NEW.permission_code) THEN
            PERFORM core.require_owner(r.tenant_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'role_grant' THEN
        IF core.role_is_admin(r.role_id) OR (TG_OP = 'UPDATE' AND core.role_is_admin(OLD.role_id)) THEN
            PERFORM core.require_owner(r.tenant_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'assignment' THEN
        IF core.position_is_admin(r.position_id) OR (TG_OP = 'UPDATE' AND core.position_is_admin(OLD.position_id)) THEN
            PERFORM core.require_owner(r.tenant_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'delegation' THEN
        IF TG_OP <> 'DELETE' AND core.position_is_admin(r.position_id)
           AND (r.permission_codes IS NULL OR r.permission_codes && core.admin_permissions()) THEN
            PERFORM core.require_owner(r.tenant_id);
        END IF;
    END IF;
    RETURN r;
END $$;

CREATE TRIGGER guard_admin_change BEFORE INSERT OR UPDATE OR DELETE ON core.role_permission
    FOR EACH ROW EXECUTE FUNCTION core.guard_admin_change();
CREATE TRIGGER guard_admin_change BEFORE INSERT OR UPDATE OR DELETE ON core.role_grant
    FOR EACH ROW EXECUTE FUNCTION core.guard_admin_change();
CREATE TRIGGER guard_admin_change BEFORE INSERT OR UPDATE OR DELETE ON core.assignment
    FOR EACH ROW EXECUTE FUNCTION core.guard_admin_change();
CREATE TRIGGER guard_admin_change BEFORE INSERT OR UPDATE ON core.delegation
    FOR EACH ROW EXECUTE FUNCTION core.guard_admin_change();

-- Dựng khung một công ty mới: đơn vị gốc, danh mục cơ bản, hai vị trí (Giám đốc là trưởng, Quản trị hệ thống), bốn vai
-- trò, quy tắc duyệt mặc định. Dùng chung cho trang khởi tạo (actions) và lệnh `python -m app.tenant` (seed)
CREATE FUNCTION core.create_tenant(p_code text, p_name text, p_root_type text DEFAULT 'CONG_TY', p_parent text DEFAULT NULL)
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
                                                       'mdm.manage', 'audit.read', 'wf.process.design'])
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

-- Một người mới giữ chính một vị trí từ hôm nay
CREATE FUNCTION core.place_person(p_tenant uuid, p_subject text, p_name text, p_employee_code text, p_position uuid)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_person uuid;
BEGIN
    INSERT INTO core.person (tenant_id, idp_subject, full_name, employee_code)
    VALUES (p_tenant, p_subject, p_name, p_employee_code) RETURNING id INTO v_person;
    INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
    VALUES (p_tenant, v_person, p_position, 'PRIMARY', tstzrange(now(), NULL));
    RETURN v_person;
END $$;
