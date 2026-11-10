-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE SCHEMA IF NOT EXISTS collab;

CREATE FUNCTION collab.entity_tenant(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT tenant_id FROM proc.purchase_request WHERE id = p_id);
    ELSE
        RETURN NULL;
    END CASE;
END $$;

CREATE FUNCTION collab.entity_label(p_type text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT doc_no || ' – ' || title FROM proc.purchase_request WHERE id = p_id);
    ELSE
        RETURN p_type || ' ' || p_id;
    END CASE;
END $$;

CREATE FUNCTION collab.entity_owner(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT requester_id FROM proc.purchase_request WHERE id = p_id);
    ELSE
        RETURN NULL;
    END CASE;
END $$;

CREATE TABLE collab.notification (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id  uuid NOT NULL,
    kind          text NOT NULL CHECK (kind IN (
                      'TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                      'REQUEST_CANCELLED', 'COMMENT', 'MENTION')),
    entity_type   text,
    entity_id     uuid,
    title         text NOT NULL,
    body          text,
    actor_id      uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, recipient_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, actor_id) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON collab.notification (tenant_id, recipient_id, created_at DESC);
CREATE INDEX ON collab.notification (tenant_id, actor_id);
CREATE INDEX ON collab.notification (entity_type, entity_id);

CREATE FUNCTION collab.notify(p_tenant uuid, p_recipient uuid, p_kind text, p_type text, p_id uuid,
                              p_title text, p_body text DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_recipient IS NULL OR p_recipient IS NOT DISTINCT FROM p_actor THEN
        RETURN;
    END IF;
    INSERT INTO collab.notification (tenant_id, recipient_id, kind, entity_type, entity_id, title, body, actor_id)
    VALUES (p_tenant, p_recipient, p_kind, p_type, p_id, p_title, p_body, p_actor)
    RETURNING id INTO v_id;
    PERFORM pg_notify('bms_notification', json_build_object(
        'tenant_id', p_tenant, 'recipient_id', p_recipient, 'id', v_id, 'kind', p_kind)::text);
END $$;

CREATE FUNCTION collab.mark_notifications_read(hasura_session json, ids uuid[] DEFAULT NULL)
RETURNS SETOF collab.notification
LANGUAGE sql VOLATILE AS $$
    UPDATE collab.notification
    SET read_at = now()
    WHERE recipient_id = core.session_person(hasura_session)
      AND tenant_id = (hasura_session ->> 'x-hasura-tenant-id')::uuid
      AND read_at IS NULL
      AND (ids IS NULL OR id = ANY (ids))
    RETURNING *
$$;

CREATE FUNCTION collab.task_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_step   wf.approval_step;
    v_title  text;
    d        record;
BEGIN
    IF NEW.status <> 'OPEN' OR NEW.assignee_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_step FROM wf.approval_step WHERE id = NEW.step_id;
    v_title := 'Việc cần duyệt: ' || collab.entity_label(v_step.entity_type, v_step.entity_id);
    PERFORM collab.notify(NEW.tenant_id, NEW.assignee_id, 'TASK_ASSIGNED', v_step.entity_type, v_step.entity_id,
                          v_title, CASE WHEN NEW.escalated THEN 'Được đẩy lên từ cấp dưới' END);
    FOR d IN
        SELECT DISTINCT delegate_id FROM core.delegation
        WHERE tenant_id = NEW.tenant_id AND delegator_id = NEW.assignee_id
          AND position_id = NEW.assigned_position_id AND valid_period @> now()
          AND (permission_codes IS NULL OR 'wf.approval.act' = ANY (permission_codes))
    LOOP
        PERFORM collab.notify(NEW.tenant_id, d.delegate_id, 'TASK_ASSIGNED', v_step.entity_type, v_step.entity_id,
                              v_title, 'Duyệt thay theo ủy quyền');
    END LOOP;
    RETURN NULL;
END $$;

CREATE TRIGGER task_notify AFTER INSERT ON wf.task
FOR EACH ROW EXECUTE FUNCTION collab.task_notify();

CREATE FUNCTION collab.purchase_request_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_step  wf.approval_step;
    v_kind  text := 'REQUEST_' || NEW.status;
    v_verb  text;
BEGIN
    IF NEW.status NOT IN ('APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED') THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_step FROM wf.approval_step
    WHERE entity_type = 'proc.purchase_request' AND entity_id = NEW.id AND round = NEW.approval_round
      AND acted_by IS NOT NULL
    ORDER BY acted_at DESC NULLS LAST, step_order DESC LIMIT 1;
    IF NEW.status = 'CANCELLED' THEN
        v_step := NULL;
        SELECT person_id INTO v_step.acted_by FROM wf.approval_history
        WHERE entity_type = 'proc.purchase_request' AND entity_id = NEW.id AND event = 'CANCELLED'
        ORDER BY id DESC LIMIT 1;
    END IF;
    v_verb := CASE NEW.status WHEN 'APPROVED' THEN 'đã được duyệt' WHEN 'REJECTED' THEN 'bị từ chối'
                              WHEN 'RETURNED' THEN 'bị trả về' ELSE 'đã bị hủy' END;
    PERFORM collab.notify(NEW.tenant_id, NEW.requester_id, v_kind, 'proc.purchase_request', NEW.id,
                          'Đề nghị ' || NEW.doc_no || ' ' || v_verb,
                          CASE WHEN NEW.status IN ('REJECTED', 'RETURNED') THEN v_step.note END,
                          v_step.acted_by);
    RETURN NULL;
END $$;

CREATE TRIGGER purchase_request_notify AFTER UPDATE OF status ON proc.purchase_request
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION collab.purchase_request_notify();

CREATE TABLE collab.comment (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type  text NOT NULL,
    entity_id    uuid NOT NULL,
    parent_id    uuid,
    author_id    uuid NOT NULL,
    body         text NOT NULL,
    mentions     uuid[] NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now(),
    edited_at    timestamptz,
    deleted_at   timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, parent_id) REFERENCES collab.comment (tenant_id, id),
    FOREIGN KEY (tenant_id, author_id) REFERENCES core.person (tenant_id, id),
    CHECK (deleted_at IS NOT NULL OR length(btrim(body)) > 0)
);
CREATE INDEX ON collab.comment (entity_type, entity_id, created_at);
CREATE INDEX ON collab.comment (tenant_id, parent_id);
CREATE INDEX ON collab.comment (tenant_id, author_id);

CREATE FUNCTION collab.comment_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_session  json := core.mutation_session();
    v_parent   collab.comment;
    v_bad      uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Bình luận đã xóa' USING ERRCODE = 'data_exception';
        END IF;
        IF (NEW.entity_type, NEW.entity_id, NEW.parent_id, NEW.author_id, NEW.mentions, NEW.created_at)
           IS DISTINCT FROM (OLD.entity_type, OLD.entity_id, OLD.parent_id, OLD.author_id, OLD.mentions, OLD.created_at) THEN
            RAISE EXCEPTION 'Chỉ sửa được nội dung bình luận' USING ERRCODE = 'data_exception';
        END IF;
        IF NEW.deleted_at IS NOT NULL THEN
            NEW.deleted_at := now();
            NEW.body := '';
        ELSE
            NEW.edited_at := now();
        END IF;
        RETURN NEW;
    END IF;

    IF collab.entity_tenant(NEW.entity_type, NEW.entity_id) IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'Không tìm thấy chứng từ' USING ERRCODE = 'data_exception';
    END IF;
    IF v_session IS NOT NULL AND v_session ->> 'x-hasura-role' <> 'admin' THEN
        IF NEW.author_id IS DISTINCT FROM core.session_person(v_session) THEN
            RAISE EXCEPTION 'Người viết phải là người đang đăng nhập' USING ERRCODE = 'data_exception';
        END IF;
    END IF;
    IF NOT wf.entity_can_read(NEW.entity_type, NEW.entity_id, NEW.author_id) THEN
        RAISE EXCEPTION 'Không có quyền xem chứng từ này' USING ERRCODE = 'data_exception';
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM collab.comment WHERE id = NEW.parent_id;
        IF (v_parent.entity_type, v_parent.entity_id) IS DISTINCT FROM (NEW.entity_type, NEW.entity_id) THEN
            RAISE EXCEPTION 'Trả lời phải cùng chứng từ với bình luận gốc' USING ERRCODE = 'data_exception';
        END IF;
    END IF;
    NEW.mentions := ARRAY(SELECT DISTINCT unnest(NEW.mentions));
    SELECT m INTO v_bad FROM unnest(NEW.mentions) m
    WHERE NOT EXISTS (SELECT 1 FROM core.person p WHERE p.id = m AND p.tenant_id = NEW.tenant_id)
       OR NOT wf.entity_can_read(NEW.entity_type, NEW.entity_id, m)
    LIMIT 1;
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Người được nhắc tên không xem được chứng từ này' USING ERRCODE = 'data_exception';
    END IF;
    NEW.created_at := now();
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    RETURN NEW;
END $$;

CREATE TRIGGER comment_before_write BEFORE INSERT OR UPDATE ON collab.comment
FOR EACH ROW EXECUTE FUNCTION collab.comment_before_write();

CREATE FUNCTION collab.comment_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_label  text := collab.entity_label(NEW.entity_type, NEW.entity_id);
    v_author text := (SELECT full_name FROM core.person WHERE id = NEW.author_id);
    v_body   text := left(NEW.body, 200);
    r        record;
BEGIN
    FOR r IN SELECT unnest(NEW.mentions) AS person_id LOOP
        PERFORM collab.notify(NEW.tenant_id, r.person_id, 'MENTION', NEW.entity_type, NEW.entity_id,
                              v_author || ' nhắc đến bạn ở ' || v_label, v_body, NEW.author_id);
    END LOOP;
    FOR r IN
        SELECT DISTINCT x AS person_id FROM unnest(ARRAY[
            collab.entity_owner(NEW.entity_type, NEW.entity_id),
            (SELECT author_id FROM collab.comment WHERE id = NEW.parent_id)]) x
        WHERE x IS NOT NULL AND x <> ALL (NEW.mentions)
    LOOP
        PERFORM collab.notify(NEW.tenant_id, r.person_id, 'COMMENT', NEW.entity_type, NEW.entity_id,
                              v_author || ' bình luận ở ' || v_label, v_body, NEW.author_id);
    END LOOP;
    RETURN NULL;
END $$;

CREATE TRIGGER comment_notify AFTER INSERT ON collab.comment
FOR EACH ROW EXECUTE FUNCTION collab.comment_notify();

CREATE FUNCTION collab.comment_can_read(p_row collab.comment, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read(p_row.entity_type, p_row.entity_id, core.session_person(hasura_session))
$$;

CALL audit.enable('collab.comment');
