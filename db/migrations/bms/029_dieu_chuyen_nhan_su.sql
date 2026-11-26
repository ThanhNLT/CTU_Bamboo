-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

ALTER TABLE core.org_unit ADD COLUMN is_hr boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN core.org_unit.is_hr IS 'Phòng nhân sự của công ty: trưởng phòng là người duyệt điều chuyển';

INSERT INTO core.permission (code, description) VALUES
    ('hr.transfer.create', 'Lập đề nghị điều chuyển nhân sự cho người khác trong đơn vị quản lý'),
    ('hr.transfer.read', 'Xem đề nghị điều chuyển nhân sự');

CREATE TABLE hr.transfer_request (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no                 text NOT NULL,
    person_id              uuid NOT NULL,
    source_position_id     uuid NOT NULL,
    requester_id           uuid NOT NULL,
    requester_position_id  uuid NOT NULL,
    requester_kind         text NOT NULL CHECK (requester_kind IN ('SELF', 'MANAGER', 'EXECUTIVE')),
    target_unit_id         uuid NOT NULL,
    target_position_id     uuid,
    effective_date         date NOT NULL,
    reason                 text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
    status                 text NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approval_round         int NOT NULL DEFAULT 0,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, source_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, target_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, target_position_id) REFERENCES core.position (tenant_id, id),
    CHECK ((requester_kind = 'SELF') = (requester_id = person_id))
);
CREATE INDEX ON hr.transfer_request (tenant_id, person_id);
CREATE INDEX ON hr.transfer_request (tenant_id, requester_id);
CREATE INDEX ON hr.transfer_request (tenant_id, source_position_id);
CREATE INDEX ON hr.transfer_request (tenant_id, target_unit_id);
CREATE UNIQUE INDEX transfer_request_one_open_per_person ON hr.transfer_request (tenant_id, person_id)
    WHERE status IN ('DRAFT', 'PENDING', 'RETURNED');

CREATE FUNCTION hr.transfer_request_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'DC', NEW.created_at));
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id, NEW.doc_no, NEW.person_id, NEW.source_position_id, NEW.requester_id,
        NEW.requester_position_id, NEW.requester_kind, NEW.target_unit_id, NEW.effective_date, NEW.reason, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.doc_no, OLD.person_id, OLD.source_position_id, OLD.requester_id,
        OLD.requester_position_id, OLD.requester_kind, OLD.target_unit_id, OLD.effective_date, OLD.reason, OLD.created_at) THEN
        RAISE EXCEPTION 'Không sửa nội dung đề nghị điều chuyển đã lập' USING ERRCODE = 'data_exception';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER transfer_request_before_write BEFORE INSERT OR UPDATE ON hr.transfer_request
FOR EACH ROW EXECUTE FUNCTION hr.transfer_request_before_write();

CREATE FUNCTION hr.transfer_request_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_step  wf.approval_step;
    v_verb  text;
BEGIN
    IF NEW.status NOT IN ('APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED') THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_step FROM wf.approval_step
    WHERE entity_type = 'hr.transfer_request' AND entity_id = NEW.id AND round = NEW.approval_round
      AND acted_by IS NOT NULL
    ORDER BY acted_at DESC NULLS LAST, step_order DESC LIMIT 1;
    IF NEW.status = 'CANCELLED' THEN
        v_step := NULL;
        SELECT person_id INTO v_step.acted_by FROM wf.approval_history
        WHERE entity_type = 'hr.transfer_request' AND entity_id = NEW.id AND event = 'CANCELLED'
        ORDER BY id DESC LIMIT 1;
    END IF;
    v_verb := CASE NEW.status WHEN 'APPROVED' THEN 'đã được duyệt' WHEN 'REJECTED' THEN 'bị từ chối'
                              WHEN 'RETURNED' THEN 'bị trả về' ELSE 'đã bị hủy' END;
    PERFORM collab.notify(NEW.tenant_id, NEW.requester_id, 'REQUEST_' || NEW.status, 'hr.transfer_request', NEW.id,
                          'Đề nghị điều chuyển ' || NEW.doc_no || ' ' || v_verb,
                          CASE WHEN NEW.status IN ('REJECTED', 'RETURNED') THEN v_step.note END,
                          v_step.acted_by);
    RETURN NULL;
END $$;

CREATE TRIGGER transfer_request_notify AFTER UPDATE OF status ON hr.transfer_request
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION hr.transfer_request_notify();

CREATE FUNCTION core.assignment_transfer_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.assignment_type = 'PRIMARY'
       AND coalesce(current_setting('bms.transfer_applying', true), '') <> 'on'
       AND EXISTS (
        SELECT 1 FROM core.assignment o
        WHERE o.tenant_id = NEW.tenant_id AND o.person_id = NEW.person_id AND o.id <> NEW.id
          AND o.assignment_type = 'PRIMARY')
    THEN
        RAISE EXCEPTION 'Người đã có bổ nhiệm giữ chính: chuyển vị trí phải qua đề nghị điều chuyển được duyệt'
            USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER assignment_transfer_guard AFTER INSERT ON core.assignment
FOR EACH ROW EXECUTE FUNCTION core.assignment_transfer_guard();

CREATE FUNCTION hr.transfer_hr_head(p_source_unit uuid, p_target_unit uuid, p_at timestamptz) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_tenant   uuid;
    v_company  uuid;
    v_hr       uuid;
    v_position uuid;
BEGIN
    SELECT tenant_id INTO v_tenant FROM core.org_unit WHERE id = p_source_unit;
    SELECT c.id INTO v_company
    FROM core.org_unit s, core.org_unit t, core.org_unit c
    WHERE s.id = p_source_unit AND t.id = p_target_unit
      AND c.tenant_id = v_tenant AND c.is_legal_entity
      AND c.path @> s.path AND c.path @> t.path
    ORDER BY nlevel(c.path) DESC
    LIMIT 1;
    IF v_company IS NULL THEN
        SELECT id INTO v_company FROM core.org_unit
        WHERE tenant_id = v_tenant AND parent_id IS NULL AND valid_period @> p_at
        ORDER BY created_at LIMIT 1;
    END IF;

    SELECT u.id INTO v_hr
    FROM core.org_unit u JOIN core.org_unit c ON c.id = v_company
    WHERE u.tenant_id = v_tenant AND u.is_hr AND u.path <@ c.path AND u.valid_period @> p_at
    ORDER BY nlevel(u.path)
    LIMIT 1;
    IF v_hr IS NULL THEN
        RAISE EXCEPTION 'Chưa có đơn vị phòng nhân sự trong công ty duyệt điều chuyển';
    END IF;

    SELECT p.id INTO v_position FROM core.position p
    WHERE p.org_unit_id = v_hr AND p.is_head AND p.valid_period @> p_at;
    IF v_position IS NULL THEN
        RAISE EXCEPTION 'Phòng nhân sự chưa có vị trí trưởng phòng';
    END IF;
    RETURN v_position;
END $$;

CREATE FUNCTION hr.create_transfer_request(p_actor uuid, p_person uuid, p_source_position uuid, p_target_unit uuid,
                                           p_effective date, p_reason text, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant    uuid;
    v_src_unit  uuid;
    v_kind      text;
    v_req_pos   uuid;
    v_id        uuid;
BEGIN
    SELECT p.tenant_id, p.org_unit_id INTO v_tenant, v_src_unit FROM core.position p WHERE p.id = p_source_position;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy vị trí nguồn';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.assignment a
                   WHERE a.person_id = p_person AND a.position_id = p_source_position
                     AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at) THEN
        RAISE EXCEPTION 'Người được điều chuyển không giữ vị trí nguồn (chỉ điều chuyển bổ nhiệm giữ chính hoặc kiêm nhiệm)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.org_unit u
                   WHERE u.id = p_target_unit AND u.tenant_id = v_tenant AND u.valid_period @> p_at) THEN
        RAISE EXCEPTION 'Đơn vị tiếp nhận không hợp lệ';
    END IF;
    IF p_target_unit = v_src_unit THEN
        RAISE EXCEPTION 'Đơn vị tiếp nhận trùng đơn vị hiện tại';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Đề nghị điều chuyển phải ghi lý do';
    END IF;

    IF p_actor = p_person THEN
        v_kind := 'SELF';
        v_req_pos := p_source_position;
    ELSE
        SELECT a.position_id INTO v_req_pos FROM core.assignment a
        WHERE a.person_id = p_actor AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at
          AND a.position_id = core.manager_position(p_source_position, p_at)
        LIMIT 1;
        IF v_req_pos IS NOT NULL THEN
            v_kind := 'MANAGER';
        ELSIF core.has_permission(p_actor, 'hr.transfer.create', v_src_unit, p_at) THEN
            v_kind := 'EXECUTIVE';
            SELECT a.position_id INTO v_req_pos FROM core.assignment a
            WHERE a.person_id = p_actor AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at
            ORDER BY (a.assignment_type = 'PRIMARY') DESC
            LIMIT 1;
            IF v_req_pos IS NULL THEN
                RAISE EXCEPTION 'Người lập phải giữ một vị trí để lập đề nghị';
            END IF;
        ELSE
            RAISE EXCEPTION 'Không có quyền lập đề nghị điều chuyển nhân sự này';
        END IF;
    END IF;

    INSERT INTO hr.transfer_request (tenant_id, person_id, source_position_id, requester_id, requester_position_id,
                                     requester_kind, target_unit_id, effective_date, reason)
    VALUES (v_tenant, p_person, p_source_position, p_actor, v_req_pos, v_kind, p_target_unit, p_effective, btrim(p_reason))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE FUNCTION hr.submit_transfer_request(p_id uuid, p_actor uuid, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r         hr.transfer_request;
    v_src_unit  uuid;
    v_round     int;
    v_receiving uuid;
    v_hr_head   uuid;
BEGIN
    SELECT * INTO v_r FROM hr.transfer_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị điều chuyển %', p_id;
    END IF;
    IF p_actor <> v_r.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được gửi duyệt';
    END IF;
    IF v_r.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị ở trạng thái % không gửi duyệt được', v_r.status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position_holder(v_r.requester_position_id, p_at) h
                   WHERE h.person_id = p_actor) THEN
        RAISE EXCEPTION 'Người lập không còn giữ vị trí dùng để lập đề nghị';
    END IF;
    IF v_r.effective_date < (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 14 THEN
        RAISE EXCEPTION 'Ngày chuyển phải được lên kế hoạch trước ít nhất 14 ngày (từ %)',
            to_char(v_r.effective_date, 'DD/MM/YYYY') USING ERRCODE = 'data_exception';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.assignment a
                   WHERE a.person_id = v_r.person_id AND a.position_id = v_r.source_position_id
                     AND a.assignment_type IN ('PRIMARY', 'CONCURRENT')
                     AND a.valid_period @> hr.day_start(v_r.effective_date)) THEN
        RAISE EXCEPTION 'Người được điều chuyển không còn giữ vị trí nguồn vào ngày chuyển';
    END IF;

    SELECT org_unit_id INTO v_src_unit FROM core.position WHERE id = v_r.source_position_id;
    SELECT p.id INTO v_receiving FROM core.position p
    WHERE p.org_unit_id = v_r.target_unit_id AND p.is_head AND p.valid_period @> p_at;
    IF v_receiving IS NULL THEN
        RAISE EXCEPTION 'Đơn vị tiếp nhận chưa có vị trí trưởng đơn vị';
    END IF;
    v_hr_head := hr.transfer_hr_head(v_src_unit, v_r.target_unit_id, p_at);

    v_round := v_r.approval_round + 1;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    VALUES (v_r.tenant_id, 'hr.transfer_request', v_r.id, v_round, 1, NULL, v_receiving),
           (v_r.tenant_id, 'hr.transfer_request', v_r.id, v_round, 2, NULL, v_hr_head);

    UPDATE hr.transfer_request SET status = 'PENDING', approval_round = v_round WHERE id = p_id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
    VALUES (v_r.tenant_id, 'hr.transfer_request', v_r.id, 'SUBMITTED', p_actor,
            jsonb_build_object('round', v_round, 'target_unit_id', v_r.target_unit_id), p_at);
    PERFORM wf.activate_next('hr.transfer_request', v_r.id, v_round, p_at);
END $$;

CREATE FUNCTION hr.choose_transfer_position(p_id uuid, p_actor uuid, p_position uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r    hr.transfer_request;
    v_pos  core.position;
BEGIN
    SELECT * INTO v_r FROM hr.transfer_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị điều chuyển %', p_id;
    END IF;
    IF v_r.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Đề nghị không còn chờ duyệt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                   WHERE s.entity_type = 'hr.transfer_request' AND s.entity_id = p_id
                     AND s.round = v_r.approval_round AND s.step_order = 1 AND s.status = 'ACTIVE'
                     AND t.status = 'OPEN' AND t.assignee_id = p_actor) THEN
        RAISE EXCEPTION 'Chỉ trưởng đơn vị tiếp nhận đang được giao việc mới chọn được vị trí';
    END IF;

    SELECT * INTO v_pos FROM core.position WHERE id = p_position AND tenant_id = v_r.tenant_id;
    IF NOT FOUND OR v_pos.org_unit_id <> v_r.target_unit_id THEN
        RAISE EXCEPTION 'Vị trí không thuộc đơn vị tiếp nhận';
    END IF;
    IF v_pos.is_head THEN
        RAISE EXCEPTION 'Không chọn vị trí trưởng cho người được điều chuyển';
    END IF;
    IF NOT v_pos.valid_period @> hr.day_start(v_r.effective_date) THEN
        RAISE EXCEPTION 'Vị trí không còn hiệu lực vào ngày chuyển';
    END IF;
    IF hr.position_taken_from(p_position, hr.day_start(v_r.effective_date)) THEN
        RAISE EXCEPTION 'Vị trí đã có người ngồi từ ngày chuyển: chọn vị trí khác';
    END IF;

    UPDATE hr.transfer_request SET target_position_id = p_position WHERE id = p_id;
END $$;

CREATE FUNCTION hr.complete_transfer(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r     hr.transfer_request;
    v_from  timestamptz;
    v_src   core.assignment;
BEGIN
    SELECT * INTO v_r FROM hr.transfer_request WHERE id = p_id FOR UPDATE;
    IF v_r.target_position_id IS NULL THEN
        RAISE EXCEPTION 'Chưa chọn vị trí tiếp nhận cho người được điều chuyển';
    END IF;
    v_from := hr.day_start(v_r.effective_date);
    IF hr.position_taken_from(v_r.target_position_id, v_from) THEN
        RAISE EXCEPTION 'Vị trí tiếp nhận đã có người ngồi từ ngày chuyển: chọn vị trí khác';
    END IF;

    SELECT * INTO v_src FROM core.assignment
    WHERE tenant_id = v_r.tenant_id AND person_id = v_r.person_id AND position_id = v_r.source_position_id
      AND assignment_type IN ('PRIMARY', 'CONCURRENT') AND valid_period @> v_from;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bổ nhiệm nguồn không còn hiệu lực vào ngày chuyển';
    END IF;
    IF lower(v_src.valid_period) >= v_from THEN
        RAISE EXCEPTION 'Ngày chuyển phải sau ngày bắt đầu bổ nhiệm hiện tại';
    END IF;

    UPDATE core.assignment SET valid_period = tstzrange(lower(valid_period), v_from) WHERE id = v_src.id;
    PERFORM set_config('bms.transfer_applying', 'on', true);
    INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
    VALUES (v_r.tenant_id, v_r.person_id, v_r.target_position_id, v_src.assignment_type, tstzrange(v_from, NULL));
    PERFORM set_config('bms.transfer_applying', 'off', true);
END $$;

CREATE FUNCTION hr.cancel_transfer_request(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r hr.transfer_request;
BEGIN
    SELECT * INTO v_r FROM hr.transfer_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị điều chuyển %', p_id;
    END IF;
    IF p_actor <> v_r.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được hủy đề nghị';
    END IF;
    IF v_r.status NOT IN ('DRAFT', 'PENDING', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị ở trạng thái % không hủy được', v_r.status;
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Hủy đề nghị phải ghi lý do';
    END IF;
    PERFORM wf.cancel_entity('hr.transfer_request', p_id, p_reason, p_at, p_actor);
END $$;

CREATE FUNCTION hr.transfer_request_can_read(p_row hr.transfer_request, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('hr.transfer_request', p_row.id, core.session_person(hasura_session))
$$;

CREATE OR REPLACE FUNCTION wf.entity_requester(p_type text, p_id uuid,
                                               OUT tenant_id uuid, OUT requester_id uuid,
                                               OUT requester_position_id uuid)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM proc.purchase_request r WHERE r.id = p_id;
    WHEN 'hr.onboarding_request' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM hr.onboarding_request r WHERE r.id = p_id;
    WHEN 'hr.transfer_request' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM hr.transfer_request r WHERE r.id = p_id;
    WHEN 'hr.transfer_out' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM hr.transfer_out r WHERE r.id = p_id;
    WHEN 'hr.transfer_in' THEN
        SELECT i.tenant_id, o.requester_id, o.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM hr.transfer_in i JOIN hr.transfer_out o ON o.id = i.out_id WHERE i.id = p_id;
    WHEN 'hr.transfer_group' THEN
        SELECT g.tenant_id, o.requester_id, o.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM hr.transfer_group g JOIN hr.transfer_out o ON o.id = g.out_id WHERE g.id = p_id;
    WHEN 'collab.kb_document' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM collab.kb_document r WHERE r.id = p_id;
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

CREATE OR REPLACE FUNCTION wf.set_entity_status(p_type text, p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        UPDATE proc.purchase_request SET status = p_status, updated_at = now() WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM ic.create_from_request(p_id);
        END IF;
    WHEN 'hr.onboarding_request' THEN
        UPDATE hr.onboarding_request SET status = p_status WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM hr.complete_onboarding(p_id);
        END IF;
    WHEN 'hr.transfer_request' THEN
        UPDATE hr.transfer_request SET status = p_status WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM hr.complete_transfer(p_id);
        END IF;
    WHEN 'hr.transfer_out' THEN
        IF p_status = 'APPROVED' THEN
            UPDATE hr.transfer_out SET status = 'PENDING', stage = 'TARGET' WHERE id = p_id;
            PERFORM hr.start_transfer_in(p_id, now());
        ELSE
            UPDATE hr.transfer_out
            SET status = p_status, stage = CASE WHEN p_status IN ('REJECTED', 'CANCELLED') THEN 'DONE' ELSE stage END
            WHERE id = p_id;
        END IF;
    WHEN 'hr.transfer_in' THEN
        UPDATE hr.transfer_in SET status = p_status WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM hr.start_transfer_group(p_id, now());
        ELSIF p_status <> 'PENDING' THEN
            PERFORM hr.cross_transfer_stopped((SELECT out_id FROM hr.transfer_in WHERE id = p_id), p_status);
        END IF;
    WHEN 'hr.transfer_group' THEN
        UPDATE hr.transfer_group SET status = p_status WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM hr.complete_cross_transfer(p_id);
        ELSIF p_status <> 'PENDING' THEN
            PERFORM hr.cross_transfer_stopped((SELECT out_id FROM hr.transfer_group WHERE id = p_id), p_status);
        END IF;
    WHEN 'collab.kb_document' THEN
        UPDATE collab.kb_document SET status = p_status WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM collab.kb_publish(p_id);
        END IF;
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

CREATE OR REPLACE FUNCTION wf.entity_can_read(p_type text, p_id uuid, p_person uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_unit       uuid;
    v_requester  uuid;
    v_subject    uuid;
    v_src_unit   uuid;
    v_doc        collab.kb_document;
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
    WHEN 'hr.onboarding_request' THEN
        SELECT target_unit_id, requester_id INTO v_unit, v_requester FROM hr.onboarding_request WHERE id = p_id;
        IF v_requester = p_person OR core.has_permission(p_person, 'hr.onboarding.read', v_unit, p_at) THEN
            RETURN true;
        END IF;
    WHEN 'hr.transfer_request' THEN
        SELECT r.target_unit_id, r.requester_id, r.person_id, p.org_unit_id
        INTO v_unit, v_requester, v_subject, v_src_unit
        FROM hr.transfer_request r JOIN core.position p ON p.id = r.source_position_id
        WHERE r.id = p_id;
        IF v_requester = p_person OR v_subject = p_person
           OR core.has_permission(p_person, 'hr.transfer.read', v_unit, p_at)
           OR core.has_permission(p_person, 'hr.transfer.read', v_src_unit, p_at) THEN
            RETURN true;
        END IF;
    WHEN 'hr.transfer_out' THEN
        SELECT r.requester_id, r.person_id, p.org_unit_id INTO v_requester, v_subject, v_src_unit
        FROM hr.transfer_out r JOIN core.position p ON p.id = r.source_position_id
        WHERE r.id = p_id;
        IF v_requester = p_person OR v_subject = p_person
           OR core.has_permission(p_person, 'hr.transfer.read', v_src_unit, p_at) THEN
            RETURN true;
        END IF;
    WHEN 'hr.transfer_in' THEN
        SELECT target_unit_id INTO v_unit FROM hr.transfer_in WHERE id = p_id;
        IF core.has_permission(p_person, 'hr.transfer.read', v_unit, p_at) THEN
            RETURN true;
        END IF;
    WHEN 'hr.transfer_group' THEN
        SELECT u.id INTO v_unit FROM core.org_unit u
        WHERE u.tenant_id = (SELECT tenant_id FROM hr.transfer_group WHERE id = p_id)
          AND u.parent_id IS NULL AND u.valid_period @> p_at
        ORDER BY u.created_at LIMIT 1;
        IF core.has_permission(p_person, 'hr.transfer.read', v_unit, p_at) THEN
            RETURN true;
        END IF;
    WHEN 'ic.ic_order' THEN
        RETURN ic.can_read(p_id, p_person, p_at);
    WHEN 'collab.kb_document' THEN
        SELECT * INTO v_doc FROM collab.kb_document WHERE id = p_id;
        IF v_doc.id IS NULL THEN
            RETURN false;
        END IF;
        IF v_doc.status IN ('APPROVED', 'RETIRED') AND collab.kb_can_read_published(v_doc, p_person, p_at) THEN
            RETURN true;
        END IF;
        IF v_doc.requester_id = p_person OR core.has_permission(p_person, 'kb.document.manage', v_doc.org_unit_id, p_at)
        THEN
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

CREATE OR REPLACE FUNCTION wf.conflict_persons(p_type text, p_id uuid) RETURNS uuid[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_ic uuid;
    v_result uuid[];
BEGIN
    IF p_type = 'hr.transfer_request' THEN
        RETURN ARRAY(SELECT person_id FROM hr.transfer_request WHERE id = p_id);
    ELSIF p_type = 'hr.transfer_out' THEN
        RETURN ARRAY(SELECT person_id FROM hr.transfer_out WHERE id = p_id);
    END IF;
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

CREATE OR REPLACE FUNCTION wf.entity_unit(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN CASE p_type
        WHEN 'proc.purchase_request' THEN (SELECT org_unit_id FROM proc.purchase_request WHERE id = p_id)
        WHEN 'hr.onboarding_request' THEN (SELECT target_unit_id FROM hr.onboarding_request WHERE id = p_id)
        WHEN 'hr.transfer_request' THEN (SELECT target_unit_id FROM hr.transfer_request WHERE id = p_id)
        WHEN 'hr.transfer_out' THEN (SELECT p.org_unit_id FROM hr.transfer_out r JOIN core.position p ON p.id = r.source_position_id WHERE r.id = p_id)
        WHEN 'hr.transfer_in' THEN (SELECT target_unit_id FROM hr.transfer_in WHERE id = p_id)
        WHEN 'collab.kb_document' THEN (SELECT org_unit_id FROM collab.kb_document WHERE id = p_id)
        WHEN 'ic.ic_order' THEN (SELECT seller_unit_id FROM ic.ic_order WHERE id = p_id)
    END;
END $$;

CREATE OR REPLACE FUNCTION collab.entity_tenant(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT tenant_id FROM proc.purchase_request WHERE id = p_id);
    WHEN 'hr.onboarding_request' THEN
        RETURN (SELECT tenant_id FROM hr.onboarding_request WHERE id = p_id);
    WHEN 'hr.transfer_request' THEN
        RETURN (SELECT tenant_id FROM hr.transfer_request WHERE id = p_id);
    WHEN 'hr.transfer_out' THEN
        RETURN (SELECT tenant_id FROM hr.transfer_out WHERE id = p_id);
    WHEN 'hr.transfer_in' THEN
        RETURN (SELECT tenant_id FROM hr.transfer_in WHERE id = p_id);
    WHEN 'hr.transfer_group' THEN
        RETURN (SELECT tenant_id FROM hr.transfer_group WHERE id = p_id);
    WHEN 'ic.ic_order' THEN
        RETURN (SELECT tenant_id FROM ic.ic_order WHERE id = p_id);
    WHEN 'collab.kb_document' THEN
        RETURN (SELECT tenant_id FROM collab.kb_document WHERE id = p_id);
    ELSE
        RETURN NULL;
    END CASE;
END $$;

CREATE OR REPLACE FUNCTION collab.entity_label(p_type text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT doc_no || ' – ' || title FROM proc.purchase_request WHERE id = p_id);
    WHEN 'hr.onboarding_request' THEN
        RETURN (SELECT doc_no || ' – Tiếp nhận ' || full_name FROM hr.onboarding_request WHERE id = p_id);
    WHEN 'hr.transfer_request' THEN
        RETURN (SELECT doc_no || ' – Điều chuyển nhân sự' FROM hr.transfer_request WHERE id = p_id);
    WHEN 'hr.transfer_out' THEN
        RETURN (SELECT doc_no || ' – Điều chuyển liên tập đoàn: ' || person_name FROM hr.transfer_out WHERE id = p_id);
    WHEN 'hr.transfer_in' THEN
        RETURN (SELECT doc_no || ' – Tiếp nhận điều chuyển: ' || person_name FROM hr.transfer_in WHERE id = p_id);
    WHEN 'hr.transfer_group' THEN
        RETURN (SELECT doc_no || ' – Quyết định điều chuyển: ' || person_name FROM hr.transfer_group WHERE id = p_id);
    WHEN 'ic.ic_order' THEN
        RETURN (SELECT o.doc_no || ' – ' || b.name || ' đặt ' || s.name
                FROM ic.ic_order o JOIN core.org_unit s ON s.id = o.seller_unit_id
                JOIN core.org_unit b ON b.id = o.buyer_unit_id
                WHERE o.id = p_id);
    WHEN 'collab.kb_document' THEN
        RETURN (SELECT doc_no || ' – ' || title FROM collab.kb_document WHERE id = p_id);
    ELSE
        RETURN p_type || ' ' || p_id;
    END CASE;
END $$;

CREATE OR REPLACE FUNCTION collab.entity_owner(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT requester_id FROM proc.purchase_request WHERE id = p_id);
    WHEN 'hr.onboarding_request' THEN
        RETURN (SELECT requester_id FROM hr.onboarding_request WHERE id = p_id);
    WHEN 'hr.transfer_request' THEN
        RETURN (SELECT requester_id FROM hr.transfer_request WHERE id = p_id);
    WHEN 'hr.transfer_out' THEN
        RETURN (SELECT requester_id FROM hr.transfer_out WHERE id = p_id);
    WHEN 'ic.ic_order' THEN
        RETURN (SELECT created_by FROM ic.ic_order WHERE id = p_id);
    WHEN 'collab.kb_document' THEN
        RETURN (SELECT requester_id FROM collab.kb_document WHERE id = p_id);
    ELSE
        RETURN NULL;
    END CASE;
END $$;

CREATE TABLE hr.transfer_out (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no                 text NOT NULL,
    person_id              uuid NOT NULL,
    person_name            text NOT NULL,
    source_position_id     uuid NOT NULL,
    requester_id           uuid NOT NULL,
    requester_position_id  uuid NOT NULL,
    requester_kind         text NOT NULL CHECK (requester_kind IN ('SELF', 'MANAGER', 'EXECUTIVE')),
    target_tenant_id       uuid NOT NULL REFERENCES core.tenant,
    target_unit_id         uuid NOT NULL,
    target_unit_name       text NOT NULL,
    effective_date         date NOT NULL,
    reason                 text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
    status                 text NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    stage                  text NOT NULL DEFAULT 'SOURCE' CHECK (stage IN ('SOURCE', 'TARGET', 'GROUP', 'DONE')),
    approval_round         int NOT NULL DEFAULT 0,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, source_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_position_id) REFERENCES core.position (tenant_id, id),
    CHECK ((requester_kind = 'SELF') = (requester_id = person_id)),
    CHECK (target_tenant_id <> tenant_id)
);
CREATE INDEX ON hr.transfer_out (tenant_id, person_id);
CREATE INDEX ON hr.transfer_out (tenant_id, source_position_id);
CREATE UNIQUE INDEX transfer_out_one_open_per_person ON hr.transfer_out (tenant_id, person_id)
    WHERE status IN ('DRAFT', 'PENDING', 'RETURNED');

CREATE TABLE hr.transfer_in (
    tenant_id           uuid NOT NULL REFERENCES core.tenant,
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no              text NOT NULL,
    out_id              uuid NOT NULL UNIQUE,
    out_tenant_id       uuid NOT NULL REFERENCES core.tenant,
    person_name         text NOT NULL,
    target_unit_id      uuid NOT NULL,
    target_position_id  uuid,
    effective_date      date NOT NULL,
    status              text NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approval_round      int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, target_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, target_position_id) REFERENCES core.position (tenant_id, id),
    CHECK (out_tenant_id <> tenant_id)
);

CREATE TABLE hr.transfer_group (
    tenant_id       uuid NOT NULL REFERENCES core.tenant,
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no          text NOT NULL,
    out_id          uuid NOT NULL UNIQUE,
    in_id           uuid NOT NULL UNIQUE,
    out_tenant_id   uuid NOT NULL REFERENCES core.tenant,
    in_tenant_id    uuid NOT NULL REFERENCES core.tenant,
    person_name     text NOT NULL,
    effective_date  date NOT NULL,
    status          text NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approval_round  int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no)
);

CREATE FUNCTION hr.transfer_leg_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id,
            CASE TG_TABLE_NAME WHEN 'transfer_out' THEN 'DL' WHEN 'transfer_in' THEN 'DLN' ELSE 'DLT' END,
            NEW.created_at));
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE FUNCTION hr.transfer_out_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'DL', NEW.created_at));
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND (NEW.doc_no, NEW.person_id, NEW.source_position_id, NEW.requester_id, NEW.target_tenant_id,
            NEW.target_unit_id, NEW.effective_date, NEW.reason) IS DISTINCT FROM
           (OLD.doc_no, OLD.person_id, OLD.source_position_id, OLD.requester_id, OLD.target_tenant_id,
            OLD.target_unit_id, OLD.effective_date, OLD.reason) THEN
        RAISE EXCEPTION 'Không sửa nội dung đề nghị điều chuyển liên tập đoàn đã lập' USING ERRCODE = 'data_exception';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER transfer_out_before_write BEFORE INSERT OR UPDATE ON hr.transfer_out
FOR EACH ROW EXECUTE FUNCTION hr.transfer_out_before_write();
CREATE TRIGGER transfer_in_before_write BEFORE INSERT OR UPDATE ON hr.transfer_in
FOR EACH ROW EXECUTE FUNCTION hr.transfer_leg_before_write();
CREATE TRIGGER transfer_group_before_write BEFORE INSERT OR UPDATE ON hr.transfer_group
FOR EACH ROW EXECUTE FUNCTION hr.transfer_leg_before_write();

CREATE FUNCTION hr.transfer_out_can_read(p_row hr.transfer_out, hasura_session json)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('hr.transfer_out', p_row.id, core.session_person(hasura_session))
$$;
CREATE FUNCTION hr.transfer_in_can_read(p_row hr.transfer_in, hasura_session json)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('hr.transfer_in', p_row.id, core.session_person(hasura_session))
$$;
CREATE FUNCTION hr.transfer_group_can_read(p_row hr.transfer_group, hasura_session json)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('hr.transfer_group', p_row.id, core.session_person(hasura_session))
$$;

CREATE FUNCTION hr.transfer_blocker(p_person uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_idp text;
BEGIN
    SELECT idp_subject INTO v_idp FROM core.person WHERE id = p_person;
    IF EXISTS (SELECT 1 FROM hr.transfer_request r JOIN core.person p ON p.id = r.person_id
               WHERE r.status IN ('DRAFT', 'PENDING', 'RETURNED')
                 AND (p.id = p_person OR (v_idp IS NOT NULL AND p.idp_subject = v_idp))) THEN
        RETURN 'Người này đang có đề nghị điều chuyển chưa xong';
    END IF;
    IF EXISTS (SELECT 1 FROM hr.transfer_out r JOIN core.person p ON p.id = r.person_id
               WHERE r.status IN ('DRAFT', 'PENDING', 'RETURNED')
                 AND (p.id = p_person OR (v_idp IS NOT NULL AND p.idp_subject = v_idp))) THEN
        RETURN 'Người này đang có đề nghị điều chuyển liên tập đoàn chưa xong';
    END IF;
    IF EXISTS (SELECT 1 FROM wf.task t WHERE t.assignee_id = p_person AND t.status = 'OPEN') THEN
        RETURN 'Người này còn việc duyệt đang mở, cần xử lý xong trước khi điều chuyển';
    END IF;
    IF EXISTS (SELECT 1 FROM proc.purchase_request r WHERE r.requester_id = p_person AND r.status = 'PENDING') THEN
        RETURN 'Người này còn đề nghị mua sắm đang chờ duyệt';
    END IF;
    RETURN NULL;
END $$;

CREATE FUNCTION hr.transfer_requester(p_actor uuid, p_person uuid, p_source_position uuid, p_at timestamptz,
                                      OUT o_kind text, OUT o_position uuid)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_src_unit uuid;
BEGIN
    SELECT org_unit_id INTO v_src_unit FROM core.position WHERE id = p_source_position;
    IF p_actor = p_person THEN
        o_kind := 'SELF';
        o_position := p_source_position;
        RETURN;
    END IF;
    SELECT a.position_id INTO o_position FROM core.assignment a
    WHERE a.person_id = p_actor AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at
      AND a.position_id = core.manager_position(p_source_position, p_at)
    LIMIT 1;
    IF o_position IS NOT NULL THEN
        o_kind := 'MANAGER';
        RETURN;
    END IF;
    IF core.has_permission(p_actor, 'hr.transfer.create', v_src_unit, p_at) THEN
        o_kind := 'EXECUTIVE';
        SELECT a.position_id INTO o_position FROM core.assignment a
        WHERE a.person_id = p_actor AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at
        ORDER BY (a.assignment_type = 'PRIMARY') DESC
        LIMIT 1;
        IF o_position IS NULL THEN
            RAISE EXCEPTION 'Người lập phải giữ một vị trí để lập đề nghị';
        END IF;
        RETURN;
    END IF;
    RAISE EXCEPTION 'Không có quyền lập đề nghị điều chuyển nhân sự này';
END $$;

CREATE FUNCTION hr.create_transfer_out(p_actor uuid, p_person uuid, p_source_position uuid, p_target_tenant uuid,
                                       p_target_unit uuid, p_effective date, p_reason text,
                                       p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant     uuid;
    v_unit_name  text;
    v_name       text;
    v_kind       text;
    v_position   uuid;
    v_block      text;
    v_id         uuid;
BEGIN
    SELECT tenant_id INTO v_tenant FROM core.position WHERE id = p_source_position;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy vị trí nguồn';
    END IF;
    IF p_target_tenant = v_tenant THEN
        RAISE EXCEPTION 'Điều chuyển trong cùng tenant dùng đề nghị điều chuyển nội bộ';
    END IF;
    IF core.tenant_root(p_target_tenant) IS DISTINCT FROM core.tenant_root(v_tenant) THEN
        RAISE EXCEPTION 'Tenant đích không cùng tập đoàn với tenant nguồn';
    END IF;
    SELECT name INTO v_unit_name FROM core.org_unit
    WHERE id = p_target_unit AND tenant_id = p_target_tenant AND valid_period @> p_at;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Đơn vị tiếp nhận không thuộc tenant đích hoặc đã ngừng';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.assignment a
                   WHERE a.person_id = p_person AND a.position_id = p_source_position
                     AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at) THEN
        RAISE EXCEPTION 'Người được điều chuyển không giữ vị trí nguồn (chỉ điều chuyển bổ nhiệm giữ chính hoặc kiêm nhiệm)';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Đề nghị điều chuyển phải ghi lý do';
    END IF;
    v_block := hr.transfer_blocker(p_person);
    IF v_block IS NOT NULL THEN
        RAISE EXCEPTION '%', v_block;
    END IF;

    SELECT * INTO v_kind, v_position FROM hr.transfer_requester(p_actor, p_person, p_source_position, p_at);
    SELECT full_name INTO v_name FROM core.person WHERE id = p_person;

    INSERT INTO hr.transfer_out (tenant_id, person_id, person_name, source_position_id, requester_id,
                                 requester_position_id, requester_kind, target_tenant_id, target_unit_id,
                                 target_unit_name, effective_date, reason)
    VALUES (v_tenant, p_person, v_name, p_source_position, p_actor, v_position, v_kind,
            p_target_tenant, p_target_unit, v_unit_name, p_effective, btrim(p_reason))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE FUNCTION hr.submit_transfer_out(p_id uuid, p_actor uuid, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r         hr.transfer_out;
    v_src_unit  uuid;
    v_mgr       uuid;
    v_hr        uuid;
    v_round     int;
BEGIN
    SELECT * INTO v_r FROM hr.transfer_out WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị điều chuyển liên tập đoàn %', p_id;
    END IF;
    IF p_actor <> v_r.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được gửi duyệt';
    END IF;
    IF v_r.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị ở trạng thái % không gửi duyệt được', v_r.status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position_holder(v_r.requester_position_id, p_at) h
                   WHERE h.person_id = p_actor) THEN
        RAISE EXCEPTION 'Người lập không còn giữ vị trí dùng để lập đề nghị';
    END IF;
    IF v_r.effective_date < (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 14 THEN
        RAISE EXCEPTION 'Ngày chuyển phải được lên kế hoạch trước ít nhất 14 ngày (từ %)',
            to_char(v_r.effective_date, 'DD/MM/YYYY') USING ERRCODE = 'data_exception';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.assignment a
                   WHERE a.person_id = v_r.person_id AND a.position_id = v_r.source_position_id
                     AND a.assignment_type IN ('PRIMARY', 'CONCURRENT')
                     AND a.valid_period @> hr.day_start(v_r.effective_date)) THEN
        RAISE EXCEPTION 'Người được điều chuyển không còn giữ vị trí nguồn vào ngày chuyển';
    END IF;

    SELECT org_unit_id INTO v_src_unit FROM core.position WHERE id = v_r.source_position_id;
    v_mgr := core.manager_position(v_r.source_position_id, p_at);
    IF v_mgr IS NULL THEN
        RAISE EXCEPTION 'Vị trí nguồn chưa có quản lý trực tiếp để duyệt';
    END IF;
    v_hr := hr.transfer_hr_head(v_src_unit, v_src_unit, p_at);

    v_round := v_r.approval_round + 1;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    VALUES (v_r.tenant_id, 'hr.transfer_out', v_r.id, v_round, 1, NULL, v_mgr),
           (v_r.tenant_id, 'hr.transfer_out', v_r.id, v_round, 2, NULL, v_hr);

    UPDATE hr.transfer_out SET status = 'PENDING', stage = 'SOURCE', approval_round = v_round WHERE id = p_id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
    VALUES (v_r.tenant_id, 'hr.transfer_out', v_r.id, 'SUBMITTED', p_actor,
            jsonb_build_object('round', v_round, 'target_tenant_id', v_r.target_tenant_id), p_at);
    PERFORM wf.activate_next('hr.transfer_out', v_r.id, v_round, p_at);
END $$;

CREATE FUNCTION hr.cancel_transfer_out(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r hr.transfer_out;
BEGIN
    SELECT * INTO v_r FROM hr.transfer_out WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị điều chuyển liên tập đoàn %', p_id;
    END IF;
    IF p_actor <> v_r.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được hủy đề nghị';
    END IF;
    IF v_r.status NOT IN ('DRAFT', 'PENDING', 'RETURNED') OR v_r.stage <> 'SOURCE' THEN
        RAISE EXCEPTION 'Đề nghị đã chuyển sang tenant đích hoặc đã có kết quả nên không hủy được';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Hủy đề nghị phải ghi lý do';
    END IF;
    PERFORM wf.cancel_entity('hr.transfer_out', p_id, p_reason, p_at, p_actor);
END $$;

CREATE FUNCTION hr.start_transfer_in(p_out uuid, p_at timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_o      hr.transfer_out;
    v_head   uuid;
    v_hr     uuid;
    v_in     uuid;
BEGIN
    SELECT * INTO v_o FROM hr.transfer_out WHERE id = p_out;
    SELECT p.id INTO v_head FROM core.position p
    WHERE p.org_unit_id = v_o.target_unit_id AND p.is_head AND p.valid_period @> p_at;
    IF v_head IS NULL THEN
        RAISE EXCEPTION 'Đơn vị tiếp nhận ở tenant đích chưa có vị trí trưởng đơn vị';
    END IF;
    v_hr := hr.transfer_hr_head(v_o.target_unit_id, v_o.target_unit_id, p_at);

    INSERT INTO hr.transfer_in (tenant_id, out_id, out_tenant_id, person_name, target_unit_id, effective_date,
                                approval_round)
    VALUES (v_o.target_tenant_id, v_o.id, v_o.tenant_id, v_o.person_name, v_o.target_unit_id, v_o.effective_date, 1)
    RETURNING id INTO v_in;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    VALUES (v_o.target_tenant_id, 'hr.transfer_in', v_in, 1, 1, NULL, v_head),
           (v_o.target_tenant_id, 'hr.transfer_in', v_in, 1, 2, NULL, v_hr);
    PERFORM wf.activate_next('hr.transfer_in', v_in, 1, p_at);
    RETURN v_in;
END $$;

CREATE FUNCTION hr.choose_transfer_in_position(p_id uuid, p_actor uuid, p_position uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_i    hr.transfer_in;
    v_pos  core.position;
BEGIN
    SELECT * INTO v_i FROM hr.transfer_in WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy tiếp nhận điều chuyển %', p_id;
    END IF;
    IF v_i.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Tiếp nhận không còn chờ duyệt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                   WHERE s.entity_type = 'hr.transfer_in' AND s.entity_id = p_id
                     AND s.round = v_i.approval_round AND s.step_order = 1 AND s.status = 'ACTIVE'
                     AND t.status = 'OPEN' AND t.assignee_id = p_actor) THEN
        RAISE EXCEPTION 'Chỉ trưởng đơn vị tiếp nhận đang được giao việc mới chọn được vị trí';
    END IF;
    SELECT * INTO v_pos FROM core.position WHERE id = p_position AND tenant_id = v_i.tenant_id;
    IF NOT FOUND OR v_pos.org_unit_id <> v_i.target_unit_id THEN
        RAISE EXCEPTION 'Vị trí không thuộc đơn vị tiếp nhận';
    END IF;
    IF v_pos.is_head THEN
        RAISE EXCEPTION 'Không chọn vị trí trưởng cho người được điều chuyển';
    END IF;
    IF NOT v_pos.valid_period @> hr.day_start(v_i.effective_date) THEN
        RAISE EXCEPTION 'Vị trí không còn hiệu lực vào ngày chuyển';
    END IF;
    IF hr.position_taken_from(p_position, hr.day_start(v_i.effective_date)) THEN
        RAISE EXCEPTION 'Vị trí đã có người ngồi từ ngày chuyển: chọn vị trí khác';
    END IF;
    UPDATE hr.transfer_in SET target_position_id = p_position WHERE id = p_id;
END $$;

CREATE FUNCTION hr.start_transfer_group(p_in uuid, p_at timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_i          hr.transfer_in;
    v_o          hr.transfer_out;
    v_root       uuid;
    v_root_unit  uuid;
    v_hr         uuid;
    v_g          uuid;
BEGIN
    SELECT * INTO v_i FROM hr.transfer_in WHERE id = p_in;
    SELECT * INTO v_o FROM hr.transfer_out WHERE id = v_i.out_id;
    v_root := core.tenant_root(v_o.tenant_id);
    SELECT u.id INTO v_root_unit FROM core.org_unit u
    WHERE u.tenant_id = v_root AND u.parent_id IS NULL AND u.valid_period @> p_at
    ORDER BY u.created_at LIMIT 1;
    IF v_root_unit IS NULL THEN
        RAISE EXCEPTION 'Tập đoàn mẹ chưa có đơn vị gốc';
    END IF;
    v_hr := hr.transfer_hr_head(v_root_unit, v_root_unit, p_at);

    INSERT INTO hr.transfer_group (tenant_id, out_id, in_id, out_tenant_id, in_tenant_id, person_name,
                                   effective_date, approval_round)
    VALUES (v_root, v_o.id, v_i.id, v_o.tenant_id, v_i.tenant_id, v_o.person_name, v_o.effective_date, 1)
    RETURNING id INTO v_g;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    VALUES (v_root, 'hr.transfer_group', v_g, 1, 1, NULL, v_hr);
    UPDATE hr.transfer_out SET stage = 'GROUP' WHERE id = v_o.id;
    PERFORM wf.activate_next('hr.transfer_group', v_g, 1, p_at);
    RETURN v_g;
END $$;

CREATE FUNCTION hr.complete_cross_transfer(p_group uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_g     hr.transfer_group;
    v_o     hr.transfer_out;
    v_i     hr.transfer_in;
    v_from  timestamptz;
    v_src   core.assignment;
    v_idp   text;
    v_pers  uuid;
BEGIN
    SELECT * INTO v_g FROM hr.transfer_group WHERE id = p_group;
    SELECT * INTO v_o FROM hr.transfer_out WHERE id = v_g.out_id FOR UPDATE;
    SELECT * INTO v_i FROM hr.transfer_in WHERE id = v_g.in_id FOR UPDATE;
    IF v_i.target_position_id IS NULL THEN
        RAISE EXCEPTION 'Chưa chọn vị trí tiếp nhận ở tenant đích';
    END IF;
    v_from := hr.day_start(v_o.effective_date);
    IF hr.position_taken_from(v_i.target_position_id, v_from) THEN
        RAISE EXCEPTION 'Vị trí tiếp nhận đã có người ngồi từ ngày chuyển: chọn vị trí khác';
    END IF;

    SELECT * INTO v_src FROM core.assignment
    WHERE tenant_id = v_o.tenant_id AND person_id = v_o.person_id AND position_id = v_o.source_position_id
      AND assignment_type IN ('PRIMARY', 'CONCURRENT') AND valid_period @> v_from;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bổ nhiệm nguồn không còn hiệu lực vào ngày chuyển';
    END IF;
    IF lower(v_src.valid_period) >= v_from THEN
        RAISE EXCEPTION 'Ngày chuyển phải sau ngày bắt đầu bổ nhiệm hiện tại';
    END IF;
    UPDATE core.assignment SET valid_period = tstzrange(lower(valid_period), v_from) WHERE id = v_src.id;

    SELECT idp_subject INTO v_idp FROM core.person WHERE id = v_o.person_id;
    SELECT id INTO v_pers FROM core.person
    WHERE tenant_id = v_i.tenant_id AND v_idp IS NOT NULL AND idp_subject = v_idp;
    IF v_pers IS NULL THEN
        INSERT INTO core.person (tenant_id, idp_subject, full_name, employee_code)
        VALUES (v_i.tenant_id, v_idp, v_o.person_name, core.next_doc_no(v_i.tenant_id, 'NV'))
        RETURNING id INTO v_pers;
    END IF;

    PERFORM set_config('bms.transfer_applying', 'on', true);
    INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
    VALUES (v_i.tenant_id, v_pers, v_i.target_position_id, v_src.assignment_type, tstzrange(v_from, NULL));
    PERFORM set_config('bms.transfer_applying', 'off', true);

    UPDATE hr.transfer_out SET status = 'APPROVED', stage = 'DONE' WHERE id = v_o.id;
END $$;

CREATE FUNCTION hr.cross_transfer_stopped(p_out uuid, p_status text) RETURNS void
LANGUAGE sql AS $$
    UPDATE hr.transfer_out
    SET status = CASE WHEN p_status = 'CANCELLED' THEN 'CANCELLED' ELSE 'REJECTED' END, stage = 'DONE'
    WHERE id = p_out
$$;

CALL audit.enable('hr.transfer_out');
CALL audit.enable('hr.transfer_in');
CALL audit.enable('hr.transfer_group');

CALL audit.enable('hr.transfer_request');
