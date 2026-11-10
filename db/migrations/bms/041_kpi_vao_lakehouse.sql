ALTER PUBLICATION bms_cdc ADD TABLE kpi.snapshot;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bamboo_cdc') THEN
        GRANT USAGE ON SCHEMA kpi TO bamboo_cdc;
        GRANT SELECT ON kpi.snapshot TO bamboo_cdc;
    END IF;
END $$;
