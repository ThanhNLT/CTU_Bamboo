CREATE TABLE audit.backup_run (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind         text NOT NULL CHECK (kind IN ('BACKUP', 'DRILL')),
    status       text NOT NULL CHECK (status IN ('OK', 'FAILED')),
    location     text,
    size_bytes   bigint,
    detail       jsonb NOT NULL DEFAULT '{}',
    started_at   timestamptz NOT NULL,
    finished_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit.backup_run (kind, finished_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.backup_run
FOR EACH ROW EXECUTE FUNCTION audit.append_only();

DROP TRIGGER org_unit_after_move ON core.org_unit;
CREATE TRIGGER org_unit_after_move AFTER UPDATE OF parent_id ON core.org_unit
FOR EACH ROW WHEN (OLD.path::text IS DISTINCT FROM NEW.path::text)
EXECUTE FUNCTION core.org_unit_after_move();
