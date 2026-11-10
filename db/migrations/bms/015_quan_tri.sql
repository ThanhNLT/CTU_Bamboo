-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE VIEW core.v_admin AS
SELECT DISTINCT tenant_id, person_id
FROM core.v_permission_grant
WHERE permission_code IN ('core.org.manage', 'core.permission.manage', 'mdm.manage')
  AND valid_period @> now();

CALL audit.enable('core.catalog_item');
