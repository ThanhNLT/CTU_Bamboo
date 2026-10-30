-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Mô-đun chức năng (ADR #56). Danh mục mô-đun (tên, phụ thuộc, container, Action) khai báo trong mã
-- (services/actions/app/modules.py); CSDL chỉ giữ trạng thái hai tầng:
--   core.module_install  mô-đun đã cài trên máy (quản trị nền tảng; container của nó được chạy)
--   core.tenant_module   mô-đun công ty đã bật (quản trị công ty, chỉ trong số đã cài)
-- Bất biến: mô-đun đang bật ở một công ty thì phải đang cài trên máy.

CREATE TABLE core.module_install (
    module        text PRIMARY KEY CHECK (module ~ '^[a-z][a-z0-9_]{1,31}$'),
    installed_at  timestamptz NOT NULL DEFAULT now(),
    installed_by  text
);

CREATE TABLE core.tenant_module (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    module      text NOT NULL REFERENCES core.module_install ON DELETE RESTRICT,
    enabled_at  timestamptz NOT NULL DEFAULT now(),
    enabled_by  uuid,
    PRIMARY KEY (tenant_id, module),
    FOREIGN KEY (tenant_id, enabled_by) REFERENCES core.person (tenant_id, id)
);

CREATE FUNCTION core.module_enabled(p_tenant uuid, p_module text) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT FROM core.tenant_module WHERE tenant_id = p_tenant AND module = p_module)
$$;

-- Quản trị công ty bật/tắt mô-đun: cùng nhóm quyền quản trị (core.v_admin), thêm quyền riêng để giao được tách bạch
INSERT INTO core.permission (code, description) VALUES
    ('core.module.manage', 'Bật, tắt mô-đun chức năng của công ty');

INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT DISTINCT tenant_id, role_id, 'core.module.manage'
FROM core.role_permission
WHERE permission_code = 'core.permission.manage';

-- Nâng cấp hệ thống đang chạy: mọi mô-đun dựng sẵn coi như đã cài và đã bật cho các công ty hiện có, để không
-- chức năng nào đang dùng bị tắt. Hệ thống mới (chưa có công ty) bắt đầu chỉ với phần lõi.
INSERT INTO core.module_install (module, installed_by)
SELECT m, 'migration 042'
FROM unnest(ARRAY['approval', 'procurement', 'ic', 'hr', 'process', 'files', 'search', 'knowledge', 'ledger', 'data',
                  'ai']) m
WHERE EXISTS (SELECT FROM core.tenant);

INSERT INTO core.tenant_module (tenant_id, module)
SELECT t.id, i.module FROM core.tenant t CROSS JOIN core.module_install i;

CALL audit.enable('core.tenant_module', 'tenant_id', 'module');
