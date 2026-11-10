CREATE FUNCTION pm.attachment_tenant(p_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT tenant_id FROM pm.project WHERE id = p_id $$;

ALTER FUNCTION collab.entity_tenant(text, uuid) RENAME TO entity_tenant_h;
CREATE FUNCTION collab.entity_tenant(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_type = 'pm.project' THEN
        RETURN pm.attachment_tenant(p_id);
    END IF;
    RETURN collab.entity_tenant_h(p_type, p_id);
END $$;

ALTER FUNCTION wf.entity_can_read(text, uuid, uuid, timestamptz) RENAME TO entity_can_read_h;
CREATE FUNCTION wf.entity_can_read(p_type text, p_id uuid, p_person uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_type = 'pm.project' THEN
        RETURN p_person IS NOT NULL AND pm.can_read(p_id, p_person);
    END IF;
    RETURN wf.entity_can_read_h(p_type, p_id, p_person, p_at);
END $$;

ALTER FUNCTION collab.entity_label(text, uuid) RENAME TO entity_label_h;
CREATE FUNCTION collab.entity_label(p_type text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_type = 'pm.project' THEN
        RETURN (SELECT code || ' – ' || name FROM pm.project WHERE id = p_id);
    END IF;
    RETURN collab.entity_label_h(p_type, p_id);
END $$;

CREATE FUNCTION core.para_of(p_type text, p_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE p_type
        WHEN 'pm.project' THEN (
            SELECT CASE WHEN status IN ('DONE', 'CANCELLED') THEN 'ARCHIVES' ELSE 'PROJECTS' END
            FROM pm.project WHERE id = p_id)
        WHEN 'proc.purchase_request' THEN (
            SELECT CASE WHEN status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN 'ARCHIVES' ELSE 'PROJECTS' END
            FROM proc.purchase_request WHERE id = p_id)
        WHEN 'hr.onboarding_request' THEN (
            SELECT CASE WHEN status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN 'ARCHIVES' ELSE 'PROJECTS' END
            FROM hr.onboarding_request WHERE id = p_id)
        WHEN 'collab.kb_document' THEN (
            SELECT CASE WHEN status = 'APPROVED' THEN 'RESOURCES'
                        WHEN status IN ('RETIRED', 'REJECTED', 'CANCELLED') THEN 'ARCHIVES'
                        ELSE 'PROJECTS' END
            FROM collab.kb_document WHERE id = p_id)
        WHEN 'chat.conversation' THEN coalesce((
            SELECT CASE WHEN j.status IN ('DONE', 'CANCELLED') THEN 'ARCHIVES' ELSE 'PROJECTS' END
            FROM pm.project j WHERE j.conversation_id = p_id LIMIT 1), 'AREAS')
        ELSE 'RESOURCES'
    END
$$;

CREATE FUNCTION core.attachment_para(p_row core.attachment) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT core.para_of(p_row.entity_type, p_row.entity_id) $$;
