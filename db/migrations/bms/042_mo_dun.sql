-- Bamboo - DX-OS Open-Core
-- @version 0.5.0
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

INSERT INTO core.permission (code, description) VALUES
    ('core.module.manage', 'Bật, tắt mô-đun chức năng của công ty');

INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT DISTINCT tenant_id, role_id, 'core.module.manage'
FROM core.role_permission
WHERE permission_code = 'core.permission.manage';

INSERT INTO core.module_install (module, installed_by)
SELECT m, 'migration 042'
FROM unnest(ARRAY['approval', 'procurement', 'ic', 'hr', 'process', 'files', 'search', 'knowledge', 'ledger', 'data',
                  'ai']) m
WHERE EXISTS (SELECT FROM core.tenant);

INSERT INTO core.tenant_module (tenant_id, module)
SELECT t.id, i.module FROM core.tenant t CROSS JOIN core.module_install i;

CALL audit.enable('core.tenant_module', 'tenant_id', 'module');
