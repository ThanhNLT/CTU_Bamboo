DO $$
DECLARE
    s text;
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bamboo_app') THEN
        RAISE NOTICE 'chưa có role bamboo_app (db/roles/roles.sql), bỏ qua';
        RETURN;
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO bamboo_app', current_database());
    FOR s IN
        SELECT nspname FROM pg_namespace
        WHERE nspname NOT IN ('public', 'information_schema', 'test') AND nspname NOT LIKE 'pg\_%'
              AND nspname NOT LIKE 'hdb\_%'
    LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO bamboo_app', s);
        EXECUTE format('GRANT EXECUTE ON ALL ROUTINES IN SCHEMA %I TO bamboo_app', s);
        IF s = 'audit' THEN
            EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO bamboo_app', s);
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA %I FROM bamboo_app', s);
            IF to_regclass('audit.anchor') IS NOT NULL THEN
                GRANT INSERT ON audit.anchor TO bamboo_app;
                GRANT UPDATE (published) ON audit.anchor TO bamboo_app;
            END IF;
        ELSE
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO bamboo_app', s);
            EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO bamboo_app', s);
        END IF;
    END LOOP;

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bamboo_cdc') THEN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO bamboo_cdc', current_database());
        FOR s IN
            SELECT DISTINCT schemaname FROM pg_publication_tables WHERE pubname = 'bms_cdc'
        LOOP
            EXECUTE format('GRANT USAGE ON SCHEMA %I TO bamboo_cdc', s);
            EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO bamboo_cdc', s);
        END LOOP;
        IF to_regclass('cdc.heartbeat') IS NOT NULL THEN
            GRANT USAGE ON SCHEMA cdc TO bamboo_cdc;
            GRANT SELECT, UPDATE ON cdc.heartbeat TO bamboo_cdc;
        END IF;
    END IF;
END $$;
