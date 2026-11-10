-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE SCHEMA IF NOT EXISTS wf;

CREATE TABLE wf.approval_rule (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    process_code           text NOT NULL,
    min_amount             numeric(18, 2) NOT NULL DEFAULT 0,
    max_amount             numeric(18, 2),
    step_order             int NOT NULL CHECK (step_order > 0),
    approver_unit_type_id  uuid,
    scope_unit_id          uuid,
    category_code          text,
    valid_period           tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, approver_unit_type_id) REFERENCES core.catalog_item (tenant_id, id),
    FOREIGN KEY (tenant_id, scope_unit_id) REFERENCES core.org_unit (tenant_id, id),
    CHECK (max_amount IS NULL OR max_amount > min_amount)
);
CREATE INDEX ON wf.approval_rule (tenant_id, process_code);
CREATE INDEX ON wf.approval_rule (tenant_id, approver_unit_type_id);
CREATE INDEX ON wf.approval_rule (tenant_id, scope_unit_id);

CREATE TABLE wf.approval_step (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   text NOT NULL,
    entity_id     uuid NOT NULL,
    round         int NOT NULL,
    step_order    int NOT NULL,
    rule_id       uuid,
    position_id   uuid NOT NULL,
    status        text NOT NULL DEFAULT 'WAITING'
                  CHECK (status IN ('WAITING', 'ACTIVE', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED')),
    acted_by      uuid,
    on_behalf_of  uuid,
    acted_at      timestamptz,
    note          text,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, entity_type, entity_id, round, step_order),
    FOREIGN KEY (tenant_id, rule_id) REFERENCES wf.approval_rule (tenant_id, id),
    FOREIGN KEY (tenant_id, position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, acted_by) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, on_behalf_of) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON wf.approval_step (tenant_id, rule_id);
CREATE INDEX ON wf.approval_step (tenant_id, position_id);
CREATE INDEX ON wf.approval_step (tenant_id, acted_by);
CREATE INDEX ON wf.approval_step (tenant_id, on_behalf_of);

CREATE TABLE wf.task (
    tenant_id             uuid NOT NULL REFERENCES core.tenant,
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id               uuid NOT NULL,
    assignee_id           uuid,
    assigned_position_id  uuid NOT NULL,
    escalated             boolean NOT NULL DEFAULT false,
    escalation_reason     text CHECK (escalation_reason IN ('VACANT', 'CONTRACT', 'REQUESTER', 'CONFLICT')),
    status                text NOT NULL DEFAULT 'OPEN'
                          CHECK (status IN ('OPEN', 'DONE', 'TRANSFERRED', 'CANCELLED')),
    flowable_task_id      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    closed_at             timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, step_id) REFERENCES wf.approval_step (tenant_id, id),
    FOREIGN KEY (tenant_id, assignee_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, assigned_position_id) REFERENCES core.position (tenant_id, id),
    CHECK (escalated = (escalation_reason IS NOT NULL))
);
CREATE UNIQUE INDEX task_one_open_per_step ON wf.task (step_id) WHERE status = 'OPEN';
CREATE INDEX ON wf.task (tenant_id, step_id);
CREATE INDEX ON wf.task (tenant_id, assignee_id);
CREATE INDEX ON wf.task (tenant_id, assigned_position_id);

CREATE TABLE wf.approval_history (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_type   text NOT NULL,
    entity_id     uuid NOT NULL,
    step_id       uuid,
    event         text NOT NULL CHECK (event IN (
                      'SUBMITTED', 'ASSIGNED', 'ESCALATED', 'MERGED', 'TRANSFERRED',
                      'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'OWNER_TRANSFERRED', 'COMPLETED')),
    person_id     uuid,
    on_behalf_of  uuid,
    detail        jsonb NOT NULL DEFAULT '{}',
    created_at    timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, step_id) REFERENCES wf.approval_step (tenant_id, id),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, on_behalf_of) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON wf.approval_history (entity_type, entity_id);
CREATE INDEX ON wf.approval_history (tenant_id, step_id);
CREATE INDEX ON wf.approval_history (tenant_id, person_id);
CREATE INDEX ON wf.approval_history (tenant_id, on_behalf_of);

CREATE FUNCTION wf.entity_requester(p_type text, p_id uuid,
                                    OUT tenant_id uuid, OUT requester_id uuid, OUT requester_position_id uuid)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM proc.purchase_request r WHERE r.id = p_id;
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

CREATE FUNCTION wf.conflict_persons(p_type text, p_id uuid) RETURNS uuid[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_ic uuid;
    v_result uuid[];
BEGIN
    IF p_type <> 'proc.purchase_request' THEN
        RETURN '{}';
    END IF;
    SELECT ic_order_id INTO v_ic FROM proc.purchase_request WHERE id = p_id;
    IF v_ic IS NULL THEN
        RETURN '{}';
    END IF;
    SELECT array_agg(DISTINCT x) INTO v_result FROM (
        SELECT created_by AS x FROM ic.ic_order WHERE id = v_ic
        UNION
        SELECT acted_by FROM wf.approval_step
        WHERE entity_type = 'ic.ic_order' AND entity_id = v_ic AND acted_by IS NOT NULL
    ) s;
    RETURN coalesce(v_result, '{}');
END $$;

CREATE FUNCTION wf.set_entity_status(p_type text, p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        UPDATE proc.purchase_request SET status = p_status, updated_at = now() WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

CREATE FUNCTION wf.resolve_approval_chain(p_tenant uuid, p_process text, p_requester_position uuid,
                                          p_amount numeric, p_category text,
                                          p_at timestamptz DEFAULT now())
RETURNS TABLE (step_order int, rule_id uuid, position_id uuid)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
    v_unit_path   ltree;
    v_best_scope  uuid;
    v_best_cat    text;
    v_found       boolean := false;
    r             record;
    v_target_unit uuid;
    v_target      uuid;
BEGIN
    SELECT u.path INTO v_unit_path
    FROM core.position p JOIN core.org_unit u ON u.id = p.org_unit_id
    WHERE p.id = p_requester_position AND p.tenant_id = p_tenant;

    SELECT ar.scope_unit_id, ar.category_code, true INTO v_best_scope, v_best_cat, v_found
    FROM wf.approval_rule ar
    LEFT JOIN core.org_unit su ON su.id = ar.scope_unit_id
    WHERE ar.tenant_id = p_tenant AND ar.process_code = p_process AND ar.valid_period @> p_at
      AND p_amount >= ar.min_amount AND (ar.max_amount IS NULL OR p_amount < ar.max_amount)
      AND (ar.scope_unit_id IS NULL OR v_unit_path <@ su.path)
      AND (ar.category_code IS NULL OR ar.category_code = p_category)
    ORDER BY coalesce(nlevel(su.path), 0) DESC, (ar.category_code IS NOT NULL) DESC
    LIMIT 1;
    IF NOT v_found THEN
        RETURN;
    END IF;

    FOR r IN
        SELECT ar.id, ar.step_order, ar.approver_unit_type_id
        FROM wf.approval_rule ar
        WHERE ar.tenant_id = p_tenant AND ar.process_code = p_process AND ar.valid_period @> p_at
          AND p_amount >= ar.min_amount AND (ar.max_amount IS NULL OR p_amount < ar.max_amount)
          AND ar.scope_unit_id IS NOT DISTINCT FROM v_best_scope
          AND ar.category_code IS NOT DISTINCT FROM v_best_cat
        ORDER BY ar.step_order
    LOOP
        IF r.approver_unit_type_id IS NULL THEN
            v_target := core.manager_position(p_requester_position, p_at);
        ELSE
            SELECT u.id INTO v_target_unit
            FROM core.org_unit u
            WHERE u.tenant_id = p_tenant AND u.path @> v_unit_path
              AND u.unit_type_id = r.approver_unit_type_id
            ORDER BY nlevel(u.path) DESC
            LIMIT 1;
            SELECT p.id INTO v_target
            FROM core.position p
            WHERE p.org_unit_id = v_target_unit AND p.is_head AND p.valid_period @> p_at;
        END IF;
        IF v_target IS NULL THEN
            RAISE EXCEPTION 'Không xác định được vị trí duyệt cho bước % (thiếu đơn vị hoặc vị trí trưởng)', r.step_order;
        END IF;
        step_order := r.step_order;
        rule_id := r.id;
        position_id := v_target;
        RETURN NEXT;
    END LOOP;
END $$;

CREATE FUNCTION wf.resolve_assignee(p_position uuid, p_requester uuid, p_conflicts uuid[],
                                    p_at timestamptz DEFAULT now(), p_allow_none boolean DEFAULT false)
RETURNS TABLE (person_id uuid, position_id uuid, escalation_reason text)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
    v_pos     uuid := p_position;
    v_person  uuid;
    v_type    text;
    v_reason  text;
    i         int := 0;
BEGIN
    LOOP
        v_person := NULL;
        v_type := NULL;
        SELECT h.person_id, h.assignment_type INTO v_person, v_type
        FROM core.position_holder(v_pos, p_at) h;

        IF v_person IS NULL THEN
            v_reason := coalesce(v_reason, 'VACANT');
        ELSIF v_type = 'CONTRACT' THEN
            v_reason := coalesce(v_reason, 'CONTRACT');
        ELSIF v_person = p_requester THEN
            v_reason := coalesce(v_reason, 'REQUESTER');
        ELSIF v_person = ANY (p_conflicts) THEN
            v_reason := coalesce(v_reason, 'CONFLICT');
        ELSE
            person_id := v_person;
            position_id := v_pos;
            escalation_reason := v_reason;
            RETURN NEXT;
            RETURN;
        END IF;

        v_pos := core.manager_position(v_pos, p_at);
        i := i + 1;
        IF v_pos IS NULL OR i > 64 THEN
            IF p_allow_none THEN
                person_id := NULL;
                position_id := p_position;
                escalation_reason := v_reason;
                RETURN NEXT;
                RETURN;
            END IF;
            RAISE EXCEPTION 'Không tìm được người duyệt hợp lệ từ vị trí %', p_position;
        END IF;
    END LOOP;
END $$;

CREATE FUNCTION wf.assign_step(p_step wf.approval_step, p_person uuid, p_position uuid,
                               p_reason text, p_event text, p_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_task uuid;
BEGIN
    INSERT INTO wf.task (tenant_id, step_id, assignee_id, assigned_position_id, escalated, escalation_reason, created_at)
    VALUES (p_step.tenant_id, p_step.id, p_person, p_position, p_reason IS NOT NULL, p_reason, p_at)
    RETURNING id INTO v_task;

    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, step_id, event, person_id, detail, created_at)
    VALUES (p_step.tenant_id, p_step.entity_type, p_step.entity_id, p_step.id,
            CASE WHEN p_event = 'ASSIGNED' AND p_reason IS NOT NULL THEN 'ESCALATED' ELSE p_event END,
            p_person,
            jsonb_build_object('task_id', v_task, 'position_id', p_position, 'step_position_id', p_step.position_id)
                || CASE WHEN p_reason IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reason', p_reason) END,
            p_at);
    RETURN v_task;
END $$;

CREATE FUNCTION wf.activate_next(p_type text, p_id uuid, p_round int, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_req   record;
    v_step  wf.approval_step;
    v_prev  uuid;
    v_res   record;
BEGIN
    v_req := wf.entity_requester(p_type, p_id);
    LOOP
        SELECT * INTO v_step FROM wf.approval_step
        WHERE entity_type = p_type AND entity_id = p_id AND round = p_round AND status = 'WAITING'
        ORDER BY step_order LIMIT 1;

        IF NOT FOUND THEN
            PERFORM wf.set_entity_status(p_type, p_id, 'APPROVED');
            INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, created_at)
            VALUES (v_req.tenant_id, p_type, p_id, 'COMPLETED', p_at);
            RETURN;
        END IF;

        SELECT s.acted_by INTO v_prev FROM wf.approval_step s
        WHERE s.entity_type = p_type AND s.entity_id = p_id AND s.round = p_round
          AND s.step_order < v_step.step_order
        ORDER BY s.step_order DESC LIMIT 1;

        SELECT * INTO v_res FROM wf.resolve_assignee(
            v_step.position_id, v_req.requester_id, wf.conflict_persons(p_type, p_id), p_at);

        IF v_prev IS NOT NULL AND v_res.person_id = v_prev THEN
            UPDATE wf.approval_step
            SET status = 'APPROVED', acted_by = v_prev, acted_at = p_at,
                note = 'Gộp với bước trước: cùng người duyệt'
            WHERE id = v_step.id;
            INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, step_id, event, person_id, created_at)
            VALUES (v_step.tenant_id, p_type, p_id, v_step.id, 'MERGED', v_prev, p_at);
            CONTINUE;
        END IF;

        UPDATE wf.approval_step SET status = 'ACTIVE' WHERE id = v_step.id;
        PERFORM wf.assign_step(v_step, v_res.person_id, v_res.position_id, v_res.escalation_reason, 'ASSIGNED', p_at);
        RETURN;
    END LOOP;
END $$;

CREATE FUNCTION wf.cancel_entity(p_type text, p_id uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_req record;
BEGIN
    v_req := wf.entity_requester(p_type, p_id);
    UPDATE wf.task t SET status = 'CANCELLED', closed_at = p_at
    FROM wf.approval_step s
    WHERE s.id = t.step_id AND s.entity_type = p_type AND s.entity_id = p_id AND t.status = 'OPEN';
    UPDATE wf.approval_step SET status = 'CANCELLED'
    WHERE entity_type = p_type AND entity_id = p_id AND status IN ('WAITING', 'ACTIVE');
    PERFORM wf.set_entity_status(p_type, p_id, 'CANCELLED');
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, detail, created_at)
    VALUES (v_req.tenant_id, p_type, p_id, 'CANCELLED', jsonb_build_object('reason', p_reason), p_at);
END $$;

CREATE FUNCTION wf.act(p_task uuid, p_actor uuid, p_action text, p_note text DEFAULT NULL,
                       p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_task       wf.task;
    v_step       wf.approval_step;
    v_req        record;
    v_on_behalf  uuid;
    v_status     text;
BEGIN
    IF p_action NOT IN ('APPROVE', 'REJECT', 'RETURN') THEN
        RAISE EXCEPTION 'Thao tác không hợp lệ: %', p_action;
    END IF;

    SELECT * INTO v_task FROM wf.task WHERE id = p_task FOR UPDATE;
    IF NOT FOUND OR v_task.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Việc duyệt không còn mở';
    END IF;
    IF v_task.assignee_id IS NULL THEN
        RAISE EXCEPTION 'Việc duyệt đang chờ có người giữ vị trí';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position_holder(v_task.assigned_position_id, p_at) h
                   WHERE h.person_id = v_task.assignee_id) THEN
        RAISE EXCEPTION 'Người nhận việc không còn giữ vị trí: chạy wf.refresh_position trước';
    END IF;
    SELECT * INTO v_step FROM wf.approval_step WHERE id = v_task.step_id;
    v_req := wf.entity_requester(v_step.entity_type, v_step.entity_id);

    IF p_actor <> v_task.assignee_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM core.delegation d
            WHERE d.tenant_id = v_task.tenant_id
              AND d.delegator_id = v_task.assignee_id AND d.delegate_id = p_actor
              AND d.position_id = v_task.assigned_position_id
              AND d.valid_period @> p_at
              AND (d.permission_codes IS NULL OR 'wf.approval.act' = ANY (d.permission_codes))
        ) THEN
            RAISE EXCEPTION 'Không có quyền xử lý việc duyệt này';
        END IF;
        v_on_behalf := v_task.assignee_id;
    END IF;

    IF p_actor = v_req.requester_id OR p_actor = ANY (wf.conflict_persons(v_step.entity_type, v_step.entity_id)) THEN
        RAISE EXCEPTION 'Người lập hoặc người đứng ở phía bên kia giao dịch nội bộ không được duyệt';
    END IF;

    v_status := CASE p_action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'RETURNED' END;

    UPDATE wf.task SET status = 'DONE', closed_at = p_at WHERE id = v_task.id;
    UPDATE wf.approval_step
    SET status = v_status, acted_by = p_actor, on_behalf_of = v_on_behalf, acted_at = p_at, note = p_note
    WHERE id = v_step.id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, step_id, event, person_id, on_behalf_of, detail, created_at)
    VALUES (v_step.tenant_id, v_step.entity_type, v_step.entity_id, v_step.id, v_status, p_actor, v_on_behalf,
            CASE WHEN p_note IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('note', p_note) END, p_at);

    IF p_action = 'APPROVE' THEN
        PERFORM wf.activate_next(v_step.entity_type, v_step.entity_id, v_step.round, p_at);
    ELSE
        UPDATE wf.approval_step SET status = 'CANCELLED'
        WHERE entity_type = v_step.entity_type AND entity_id = v_step.entity_id
          AND round = v_step.round AND status = 'WAITING';
        PERFORM wf.set_entity_status(v_step.entity_type, v_step.entity_id, v_status);
    END IF;
END $$;

CREATE FUNCTION wf.reassign_task(p_task uuid, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_task  wf.task;
    v_step  wf.approval_step;
    v_req   record;
    v_res   record;
    v_new   uuid;
BEGIN
    SELECT * INTO v_task FROM wf.task WHERE id = p_task FOR UPDATE;
    IF v_task.status <> 'OPEN' THEN
        RETURN;
    END IF;
    SELECT * INTO v_step FROM wf.approval_step WHERE id = v_task.step_id;
    v_req := wf.entity_requester(v_step.entity_type, v_step.entity_id);

    SELECT * INTO v_res FROM wf.resolve_assignee(
        v_task.assigned_position_id, v_req.requester_id,
        wf.conflict_persons(v_step.entity_type, v_step.entity_id), p_at, true);
    IF v_res.person_id IS NOT DISTINCT FROM v_task.assignee_id AND v_res.position_id = v_task.assigned_position_id THEN
        RETURN;
    END IF;

    UPDATE wf.task SET status = 'TRANSFERRED', closed_at = p_at WHERE id = v_task.id;
    v_new := wf.assign_step(v_step, v_res.person_id, v_res.position_id,
                            coalesce(v_res.escalation_reason, v_task.escalation_reason), 'TRANSFERRED', p_at);
    UPDATE wf.approval_history SET detail = detail || jsonb_build_object('from_task_id', v_task.id, 'from_person_id', v_task.assignee_id)
    WHERE id = (SELECT max(id) FROM wf.approval_history WHERE step_id = v_step.id);
END $$;

CREATE FUNCTION wf.refresh_position(p_position uuid, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_holder     uuid;
    v_last_type  text;
    d            record;
    t            record;
BEGIN
    SELECT h.person_id INTO v_holder FROM core.position_holder(p_position, p_at) h;

    FOR d IN
        SELECT * FROM proc.purchase_request
        WHERE requester_position_id = p_position
          AND status IN ('DRAFT', 'PENDING', 'RETURNED')
          AND requester_id IS DISTINCT FROM v_holder
        FOR UPDATE
    LOOP
        SELECT a.assignment_type INTO v_last_type FROM core.assignment a
        WHERE a.person_id = d.requester_id AND a.position_id = p_position AND upper(a.valid_period) <= p_at
        ORDER BY upper(a.valid_period) DESC LIMIT 1;

        IF v_last_type = 'CONTRACT' THEN
            PERFORM wf.cancel_entity('proc.purchase_request', d.id, 'Hết hạn hợp đồng của người lập', p_at);
        ELSIF v_holder IS NOT NULL THEN
            UPDATE proc.purchase_request SET requester_id = v_holder, updated_at = p_at WHERE id = d.id;
            INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
            VALUES (d.tenant_id, 'proc.purchase_request', d.id, 'OWNER_TRANSFERRED', v_holder,
                    jsonb_build_object('from_person_id', d.requester_id), p_at);
            FOR t IN
                SELECT tk.id FROM wf.task tk JOIN wf.approval_step s ON s.id = tk.step_id
                WHERE s.entity_type = 'proc.purchase_request' AND s.entity_id = d.id AND tk.status = 'OPEN'
            LOOP
                PERFORM wf.reassign_task(t.id, p_at);
            END LOOP;
        END IF;
    END LOOP;

    FOR t IN
        SELECT id FROM wf.task WHERE assigned_position_id = p_position AND status = 'OPEN'
    LOOP
        PERFORM wf.reassign_task(t.id, p_at);
    END LOOP;
END $$;

CREATE FUNCTION wf.assignment_after_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM wf.refresh_position(OLD.position_id, now());
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.position_id <> OLD.position_id) THEN
        PERFORM wf.refresh_position(NEW.position_id, now());
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER assignment_after_change AFTER INSERT OR UPDATE OR DELETE ON core.assignment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wf.assignment_after_change();

CREATE FUNCTION wf.refresh_all(p_at timestamptz DEFAULT now())
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_pos   uuid;
    v_count int := 0;
BEGIN
    FOR v_pos IN
        SELECT assigned_position_id FROM wf.task WHERE status = 'OPEN'
        UNION
        SELECT requester_position_id FROM proc.purchase_request WHERE status IN ('DRAFT', 'PENDING', 'RETURNED')
    LOOP
        PERFORM wf.refresh_position(v_pos, p_at);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END $$;

CREATE FUNCTION proc.submit_purchase_request(p_id uuid, p_actor uuid, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_pr     proc.purchase_request;
    v_round  int;
    v_steps  int;
BEGIN
    SELECT * INTO v_pr FROM proc.purchase_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị mua sắm %', p_id;
    END IF;
    IF p_actor <> v_pr.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được gửi duyệt';
    END IF;
    IF v_pr.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị ở trạng thái % không gửi duyệt được', v_pr.status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position_holder(v_pr.requester_position_id, p_at) h
                   WHERE h.person_id = p_actor) THEN
        RAISE EXCEPTION 'Người lập không còn giữ vị trí dùng làm tư cách lập';
    END IF;

    v_round := v_pr.approval_round + 1;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    SELECT v_pr.tenant_id, 'proc.purchase_request', v_pr.id, v_round, c.step_order, c.rule_id, c.position_id
    FROM wf.resolve_approval_chain(v_pr.tenant_id, 'PURCHASE_REQUEST', v_pr.requester_position_id,
                                   v_pr.total_amount, v_pr.category_code, p_at) c;
    GET DIAGNOSTICS v_steps = ROW_COUNT;
    IF v_steps = 0 THEN
        RAISE EXCEPTION 'Không có quy tắc hạn mức phù hợp cho số tiền %', v_pr.total_amount;
    END IF;

    UPDATE proc.purchase_request SET status = 'PENDING', approval_round = v_round, updated_at = p_at WHERE id = p_id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
    VALUES (v_pr.tenant_id, 'proc.purchase_request', v_pr.id, 'SUBMITTED', p_actor,
            jsonb_build_object('round', v_round, 'amount', v_pr.total_amount), p_at);
    PERFORM wf.activate_next('proc.purchase_request', v_pr.id, v_round, p_at);
END $$;

CREATE VIEW wf.v_inbox AS
SELECT t.tenant_id, t.assignee_id AS person_id, false AS via_delegation, NULL::uuid AS on_behalf_of,
       t.id AS task_id, s.entity_type, s.entity_id, s.step_order, t.assigned_position_id,
       t.escalated, t.escalation_reason, t.created_at
FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
WHERE t.status = 'OPEN'
UNION ALL
SELECT t.tenant_id, d.delegate_id, true, t.assignee_id,
       t.id, s.entity_type, s.entity_id, s.step_order, t.assigned_position_id,
       t.escalated, t.escalation_reason, t.created_at
FROM wf.task t
JOIN wf.approval_step s ON s.id = t.step_id
JOIN core.delegation d ON d.tenant_id = t.tenant_id
                      AND d.delegator_id = t.assignee_id
                      AND d.position_id = t.assigned_position_id
                      AND d.valid_period @> now()
                      AND (d.permission_codes IS NULL OR 'wf.approval.act' = ANY (d.permission_codes))
WHERE t.status = 'OPEN';
