CREATE VIEW core.v_admin AS
SELECT DISTINCT tenant_id, person_id
FROM core.v_permission_grant
WHERE permission_code IN ('core.org.manage', 'core.permission.manage', 'mdm.manage')
  AND valid_period @> now();

CALL audit.enable('core.catalog_item');
