CREATE FUNCTION search.attachment_searchable(p_entity_type text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT search.attachment_indexable(p_entity_type) OR p_entity_type = 'hr.onboarding_request' $$;

CREATE FUNCTION search.attachment_name_only(p_entity_type text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_entity_type = 'hr.onboarding_request' $$;

CREATE OR REPLACE FUNCTION search.attachment_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF search.attachment_searchable(NEW.entity_type) AND (NEW.status = 'CLEAN' OR OLD.status = 'CLEAN') THEN
        PERFORM search.mark(NEW.tenant_id, 'core.attachment', NEW.id);
        IF NEW.entity_type = 'collab.kb_document' THEN
            PERFORM search.mark_chunk(NEW.tenant_id, NEW.entity_id);
        END IF;
    END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION search.attachment_visible(p_entity_type text, p_entity_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT CASE p_entity_type
        WHEN 'proc.purchase_request' THEN true
        WHEN 'hr.onboarding_request' THEN true
        WHEN 'collab.kb_document' THEN EXISTS (SELECT 1 FROM collab.kb_document WHERE id = p_entity_id
                                                                              AND status = 'APPROVED')
        ELSE false END
$$;

CREATE OR REPLACE FUNCTION search.mark_all() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    n int;
BEGIN
    INSERT INTO search.pending (tenant_id, entity_type, entity_id)
    SELECT tenant_id, 'proc.purchase_request', id FROM proc.purchase_request
    UNION ALL
    SELECT tenant_id, 'collab.kb_document', id FROM collab.kb_document WHERE status = 'APPROVED'
    UNION ALL
    SELECT tenant_id, 'core.attachment', id FROM core.attachment
    WHERE status = 'CLEAN' AND deleted_at IS NULL AND search.attachment_searchable(entity_type)
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET dirty = true, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp();
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_notify('search_sync', 'all');
    RETURN n;
END $$;

SELECT search.mark_all();
