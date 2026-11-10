CREATE TABLE core.ingest_job (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text NOT NULL,
    idempotency_key  text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    mode             text NOT NULL CHECK (mode IN ('BEST_EFFORT', 'ATOMIC')),
    dry_run          boolean NOT NULL DEFAULT false,
    status           text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'DONE', 'PARTIAL', 'FAILED', 'VALIDATED')),
    total            int NOT NULL DEFAULT 0,
    accepted         int NOT NULL DEFAULT 0,
    rejected         int NOT NULL DEFAULT 0,
    errors           jsonb NOT NULL DEFAULT '[]',
    failure          text,
    source_bytes     bigint NOT NULL DEFAULT 0,
    source_sha256    text,
    started_by       uuid NOT NULL,
    started_at       timestamptz NOT NULL DEFAULT now(),
    finished_at      timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, kind, idempotency_key),
    FOREIGN KEY (tenant_id, started_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON core.ingest_job (tenant_id, started_at DESC);
CALL audit.enable('core.ingest_job');
