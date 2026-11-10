ALTER FUNCTION audit.log_change() SECURITY DEFINER SET search_path = pg_catalog, pg_temp;
REVOKE EXECUTE ON FUNCTION audit.log_change() FROM PUBLIC;
