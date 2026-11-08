CREATE FUNCTION core.session_person(p_session json) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(p_session ->> 'x-hasura-user-id', '')::uuid $$;

CREATE FUNCTION core.mutation_session() RETURNS json
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('hasura.user', true), '')::json $$;

CREATE FUNCTION wf.entity_can_read(p_type text, p_id uuid, p_person uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_unit       uuid;
    v_requester  uuid;
BEGIN
    IF p_person IS NULL THEN
        RETURN false;
    END IF;
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        SELECT org_unit_id, requester_id INTO v_unit, v_requester FROM proc.purchase_request WHERE id = p_id;
        IF v_requester = p_person OR core.has_permission(p_person, 'proc.purchase_request.read', v_unit, p_at) THEN
            RETURN true;
        END IF;
    ELSE
        RETURN false;
    END CASE;

    RETURN EXISTS (
        SELECT 1
        FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
        WHERE s.entity_type = p_type AND s.entity_id = p_id
          AND (t.assignee_id = p_person
               OR EXISTS (SELECT 1 FROM core.delegation d
                          WHERE d.delegator_id = t.assignee_id AND d.delegate_id = p_person
                            AND d.position_id = t.assigned_position_id AND d.valid_period @> p_at))
    );
END $$;

CREATE FUNCTION proc.purchase_request_can_read(p_row proc.purchase_request, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('proc.purchase_request', p_row.id, core.session_person(hasura_session))
$$;

CREATE FUNCTION wf.approval_step_can_read(p_row wf.approval_step, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read(p_row.entity_type, p_row.entity_id, core.session_person(hasura_session))
$$;

CREATE FUNCTION wf.approval_history_can_read(p_row wf.approval_history, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read(p_row.entity_type, p_row.entity_id, core.session_person(hasura_session))
$$;

CREATE FUNCTION wf.task_can_read(p_row wf.task, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read(s.entity_type, s.entity_id, core.session_person(hasura_session))
    FROM wf.approval_step s WHERE s.id = p_row.step_id
$$;

CREATE OR REPLACE FUNCTION proc.purchase_request_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM core.position_holder(NEW.requester_position_id) h
        WHERE h.person_id = NEW.requester_id
    ) THEN
        RAISE EXCEPTION 'Người lập không giữ vị trí dùng làm tư cách lập' USING ERRCODE = 'data_exception';
    END IF;
    SELECT org_unit_id INTO NEW.org_unit_id FROM core.position WHERE id = NEW.requester_position_id;
    RETURN NEW;
END $$;


CREATE FUNCTION proc.purchase_request_check_session() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_session json := core.mutation_session();
BEGIN
    IF v_session IS NULL OR v_session ->> 'x-hasura-role' = 'admin' THEN
        RETURN NEW;
    END IF;
    IF NEW.requester_id IS DISTINCT FROM core.session_person(v_session) THEN
        RAISE EXCEPTION 'Người lập phải là người đang đăng nhập' USING ERRCODE = 'data_exception';
    END IF;
    IF NOT core.has_permission(NEW.requester_id, 'proc.purchase_request.create', NEW.org_unit_id) THEN
        RAISE EXCEPTION 'Không có quyền lập đề nghị mua sắm ở đơn vị này' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER z_purchase_request_check_session BEFORE INSERT ON proc.purchase_request
FOR EACH ROW EXECUTE FUNCTION proc.purchase_request_check_session();

CREATE TABLE wf.flow_sync (
    tenant_id            uuid NOT NULL REFERENCES core.tenant,
    entity_type          text NOT NULL,
    entity_id            uuid NOT NULL,
    round                int NOT NULL,
    process_instance_id  text,
    dirty                boolean NOT NULL DEFAULT true,
    finished             boolean NOT NULL DEFAULT false,
    attempts             int NOT NULL DEFAULT 0,
    last_error           text,
    synced_at            timestamptz,
    updated_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, entity_id, round)
);
CREATE INDEX ON wf.flow_sync (tenant_id);
CREATE INDEX flow_sync_dirty ON wf.flow_sync (updated_at) WHERE dirty;

CREATE FUNCTION wf.mark_flow_sync(p_tenant uuid, p_type text, p_id uuid, p_round int) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO wf.flow_sync (tenant_id, entity_type, entity_id, round)
    VALUES (p_tenant, p_type, p_id, p_round)
    ON CONFLICT (entity_type, entity_id, round)
    DO UPDATE SET dirty = true, updated_at = clock_timestamp();
    PERFORM pg_notify('wf_flow_sync', p_type || ':' || p_id || ':' || p_round);
END $$;

CREATE FUNCTION wf.approval_step_flow_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.mark_flow_sync(NEW.tenant_id, NEW.entity_type, NEW.entity_id, NEW.round);
    RETURN NULL;
END $$;

CREATE TRIGGER approval_step_flow_sync AFTER INSERT OR UPDATE OF status ON wf.approval_step
FOR EACH ROW EXECUTE FUNCTION wf.approval_step_flow_sync();

CREATE FUNCTION wf.task_flow_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    s wf.approval_step;
BEGIN
    SELECT * INTO s FROM wf.approval_step WHERE id = NEW.step_id;
    PERFORM wf.mark_flow_sync(s.tenant_id, s.entity_type, s.entity_id, s.round);
    RETURN NULL;
END $$;

CREATE TRIGGER task_flow_sync AFTER INSERT OR UPDATE OF status, assignee_id ON wf.task
FOR EACH ROW EXECUTE FUNCTION wf.task_flow_sync();

CREATE VIEW wf.v_flow_state AS
SELECT s.tenant_id, s.entity_type, s.entity_id, s.round, s.step_order, s.status AS step_status,
       s.position_id, s.acted_by, s.on_behalf_of, s.note,
       t.assignee_id AS open_assignee_id
FROM wf.approval_step s
LEFT JOIN wf.task t ON t.step_id = s.id AND t.status = 'OPEN';
