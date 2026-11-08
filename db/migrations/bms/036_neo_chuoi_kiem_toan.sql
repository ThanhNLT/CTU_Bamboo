CREATE TABLE audit.anchor (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seq          bigint NOT NULL CHECK (seq > 0),
    head_hash    bytea NOT NULL,
    statement    text NOT NULL,
    signature    jsonb NOT NULL,
    published    jsonb NOT NULL DEFAULT '[]',
    anchored_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, seq)
);
CREATE INDEX ON audit.anchor (tenant_id, seq DESC);

CREATE FUNCTION audit.anchor_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Bản neo chuỗi kiểm toán chỉ cho ghi thêm' USING ERRCODE = 'data_exception';
    END IF;
    IF (NEW.tenant_id, NEW.seq, NEW.head_hash, NEW.statement, NEW.signature, NEW.anchored_at)
       IS DISTINCT FROM (OLD.tenant_id, OLD.seq, OLD.head_hash, OLD.statement, OLD.signature, OLD.anchored_at) THEN
        RAISE EXCEPTION 'Bản neo chuỗi kiểm toán chỉ cho ghi thêm' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER anchor_guard BEFORE UPDATE OR DELETE ON audit.anchor
FOR EACH ROW EXECUTE FUNCTION audit.anchor_guard();

CREATE FUNCTION audit.check_anchors(p_tenant uuid)
RETURNS TABLE (anchor_id uuid, anchor_seq bigint, problem text)
LANGUAGE sql STABLE AS $$
    SELECT a.id, a.seq,
           CASE WHEN l.id IS NULL THEN 'LOG_TRUNCATED' ELSE 'LOG_REWRITTEN' END
    FROM audit.anchor a
    LEFT JOIN audit.log l ON l.tenant_id = a.tenant_id AND l.seq = a.seq
    WHERE a.tenant_id = p_tenant AND (l.id IS NULL OR l.hash <> a.head_hash)
    ORDER BY a.seq
$$;
