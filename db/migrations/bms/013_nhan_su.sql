-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 013: Đề nghị tiếp nhận nhân sự (Hire-to-Retire, ADR #41).
--
-- Phòng nhân sự lập hồ sơ ứng viên kèm đề xuất bổ nhiệm (vị trí, ngày vào, loại hợp đồng, lương) rồi gửi
-- duyệt. Chuỗi duyệt dùng bộ máy duyệt chung (quy trình ONBOARDING trong wf.approval_rule) nhưng tính từ
-- vị trí được bổ nhiệm, không từ người lập: bước "quản lý trực tiếp" là quản lý của vị trí đó. Duyệt xong
-- thì tự tạo người và bổ nhiệm giữ chính; tài khoản đăng nhập do dịch vụ hr-account tạo sau (Keycloak).
--
-- Dữ liệu cá nhân nhạy cảm (CCCD, số tài khoản, địa chỉ) chỉ lưu bản mã của khóa transit `pii` trong
-- OpenBao và bản che (•••6789); bản rõ chỉ đi qua Action, mỗi lần xem ghi hr.private_access (có nhật ký
-- kiểm toán). Hồ sơ không vào chỉ mục tìm kiếm, không vào CDC/Lakehouse (schema hr ngoài publication).

CREATE SCHEMA hr;

INSERT INTO core.permission (code, description) VALUES
    ('hr.onboarding.create', 'Lập đề nghị tiếp nhận nhân sự'),
    ('hr.onboarding.read', 'Xem đề nghị tiếp nhận nhân sự (dữ liệu nhạy cảm đã che)'),
    ('hr.onboarding.private.read', 'Xem đầy đủ CCCD, số tài khoản, địa chỉ của hồ sơ tiếp nhận');

CREATE TABLE hr.onboarding_request (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no                 text NOT NULL,
    requester_id           uuid NOT NULL,
    requester_position_id  uuid NOT NULL,
    org_unit_id            uuid NOT NULL,          -- đơn vị của người lập (phòng nhân sự)
    -- Ứng viên
    full_name              text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 200),
    gender                 text CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    date_of_birth          date,
    work_email             text CHECK (work_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone                  text CHECK (phone ~ '^\+?[0-9 .-]{8,20}$'),
    education              text,
    major                  text,
    -- Đề xuất bổ nhiệm
    target_position_id     uuid NOT NULL,
    target_unit_id         uuid NOT NULL,          -- đơn vị của vị trí (tự điền)
    start_date             date NOT NULL,
    contract_type          text NOT NULL DEFAULT 'PROBATION'
                           CHECK (contract_type IN ('PROBATION', 'FIXED_TERM', 'INDEFINITE')),
    salary                 numeric(18, 2) CHECK (salary >= 0),
    note                   text,
    -- Dữ liệu nhạy cảm: bản mã (vault:v1:...) và bản che; chỉ Action ghi.
    national_id_enc        text,
    national_id_masked     text,
    bank_name              text,
    bank_account_enc       text,
    bank_account_masked    text,
    address_enc            text,
    address_masked         text,
    -- Tài khoản đăng nhập tạo sau khi duyệt
    username               text CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,49}$'),
    account_status         text NOT NULL DEFAULT 'NONE'
                           CHECK (account_status IN ('NONE', 'PENDING', 'CREATED', 'FAILED')),
    account_error          text,
    account_attempts       int NOT NULL DEFAULT 0,
    initial_password_enc   text,
    person_id              uuid,                   -- người được tạo khi duyệt xong
    status                 text NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approval_round         int NOT NULL DEFAULT 0,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, requester_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, target_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, target_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    CHECK (date_of_birth IS NULL OR date_of_birth < start_date)
);
CREATE INDEX ON hr.onboarding_request (tenant_id, requester_id);
CREATE INDEX ON hr.onboarding_request (tenant_id, requester_position_id);
CREATE INDEX ON hr.onboarding_request (tenant_id, org_unit_id);
CREATE INDEX ON hr.onboarding_request (tenant_id, target_position_id);
CREATE INDEX ON hr.onboarding_request (tenant_id, target_unit_id);
CREATE INDEX ON hr.onboarding_request (tenant_id, person_id);
CREATE INDEX onboarding_request_account_pending ON hr.onboarding_request (updated_at) WHERE account_status = 'PENDING';
-- Tài khoản dùng chung toàn realm Keycloak: hai hồ sơ còn hiệu lực không xin cùng tên đăng nhập.
CREATE UNIQUE INDEX onboarding_request_username ON hr.onboarding_request (username)
    WHERE status NOT IN ('REJECTED', 'CANCELLED');

-- Mỗi lần xem bản rõ dữ liệu nhạy cảm (Action reveal_onboarding_private) là một dòng; có nhật ký kiểm toán.
CREATE TABLE hr.private_access (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  uuid NOT NULL,
    person_id   uuid NOT NULL,
    fields      text[] NOT NULL,
    accessed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, request_id) REFERENCES hr.onboarding_request (tenant_id, id),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON hr.private_access (tenant_id, request_id);
CREATE INDEX ON hr.private_access (tenant_id, person_id);

-- ---------------------------------------------------------------------------
-- Ghi hồ sơ: số chứng từ, đơn vị tự điền, chỉ sửa khi còn nháp hoặc bị trả về
-- ---------------------------------------------------------------------------

CREATE FUNCTION hr.onboarding_request_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM core.position_holder(NEW.requester_position_id) h
                       WHERE h.person_id = NEW.requester_id) THEN
            RAISE EXCEPTION 'Người lập không giữ vị trí dùng làm tư cách lập' USING ERRCODE = 'data_exception';
        END IF;
        SELECT org_unit_id INTO NEW.org_unit_id FROM core.position WHERE id = NEW.requester_position_id;
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'TN', NEW.created_at));
    ELSE
        IF (NEW.tenant_id, NEW.requester_id, NEW.requester_position_id, NEW.doc_no, NEW.created_at)
           IS DISTINCT FROM (OLD.tenant_id, OLD.requester_id, OLD.requester_position_id, OLD.doc_no, OLD.created_at) THEN
            RAISE EXCEPTION 'Không đổi người lập, tư cách lập hoặc số chứng từ' USING ERRCODE = 'data_exception';
        END IF;
        NEW.updated_at := now();
    END IF;
    SELECT org_unit_id INTO NEW.target_unit_id FROM core.position
    WHERE tenant_id = NEW.tenant_id AND id = NEW.target_position_id;
    RETURN NEW;
END $$;

CREATE TRIGGER onboarding_request_before_write BEFORE INSERT OR UPDATE ON hr.onboarding_request
FOR EACH ROW EXECUTE FUNCTION hr.onboarding_request_before_write();

-- Ghi qua Hasura: người lập là người gọi và có quyền lập trên đơn vị của vị trí được bổ nhiệm.
-- Ghi từ dịch vụ nội bộ (không có phiên Hasura) không bị kiểm tra ở đây.
CREATE FUNCTION hr.onboarding_request_check_session() RETURNS trigger
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
    IF NOT core.has_permission(NEW.requester_id, 'hr.onboarding.create', NEW.target_unit_id) THEN
        RAISE EXCEPTION 'Không có quyền lập đề nghị tiếp nhận vào đơn vị này' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;

-- Tên bắt đầu bằng "z" để chạy sau onboarding_request_before_write (đã điền target_unit_id).
CREATE TRIGGER z_onboarding_request_check_session
BEFORE INSERT OR UPDATE OF target_position_id ON hr.onboarding_request
FOR EACH ROW EXECUTE FUNCTION hr.onboarding_request_check_session();

-- ---------------------------------------------------------------------------
-- Đăng ký loại chứng từ với bộ máy duyệt, quyền xem, bình luận, thông báo
-- ---------------------------------------------------------------------------

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
    WHEN 'hr.onboarding_request' THEN
        UPDATE hr.onboarding_request SET status = p_status WHERE id = p_id;
        IF p_status = 'APPROVED' THEN
            PERFORM hr.complete_onboarding(p_id);
        END IF;
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

-- Xem hồ sơ: người lập, người có quyền xem trên đơn vị của vị trí được bổ nhiệm (phòng nhân sự, quản lý
-- cây đơn vị đó), người đang/đã nhận việc duyệt (kể cả qua ủy quyền).
CREATE OR REPLACE FUNCTION wf.entity_can_read(p_type text, p_id uuid, p_person uuid, p_at timestamptz DEFAULT now())
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
    WHEN 'hr.onboarding_request' THEN
        SELECT target_unit_id, requester_id INTO v_unit, v_requester FROM hr.onboarding_request WHERE id = p_id;
        IF v_requester = p_person OR core.has_permission(p_person, 'hr.onboarding.read', v_unit, p_at) THEN
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

CREATE FUNCTION hr.onboarding_request_can_read(p_row hr.onboarding_request, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('hr.onboarding_request', p_row.id, core.session_person(hasura_session))
$$;

-- Được xem bản rõ dữ liệu nhạy cảm không (Action reveal_onboarding_private kiểm tra).
CREATE FUNCTION hr.can_read_private(p_id uuid, p_person uuid, p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM hr.onboarding_request r
                   WHERE r.id = p_id
                     AND core.has_permission(p_person, 'hr.onboarding.private.read', r.target_unit_id, p_at))
$$;

-- Computed field cho giao diện: hiện nút "Xem đầy đủ" khi người gọi được xem.
CREATE FUNCTION hr.onboarding_request_can_read_private(p_row hr.onboarding_request, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT hr.can_read_private(p_row.id, core.session_person(hasura_session))
$$;

CREATE OR REPLACE FUNCTION collab.entity_tenant(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT tenant_id FROM proc.purchase_request WHERE id = p_id);
    WHEN 'hr.onboarding_request' THEN
        RETURN (SELECT tenant_id FROM hr.onboarding_request WHERE id = p_id);
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
    ELSE
        RETURN NULL;
    END CASE;
END $$;

-- Có kết quả: báo người lập, kèm người xử lý bước cuối và ghi chú.
CREATE FUNCTION collab.onboarding_request_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_step  wf.approval_step;
    v_verb  text;
BEGIN
    IF NEW.status NOT IN ('APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED') THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_step FROM wf.approval_step
    WHERE entity_type = 'hr.onboarding_request' AND entity_id = NEW.id AND round = NEW.approval_round
      AND acted_by IS NOT NULL
    ORDER BY acted_at DESC NULLS LAST, step_order DESC LIMIT 1;
    IF NEW.status = 'CANCELLED' THEN
        v_step := NULL;
        SELECT person_id INTO v_step.acted_by FROM wf.approval_history
        WHERE entity_type = 'hr.onboarding_request' AND entity_id = NEW.id AND event = 'CANCELLED'
        ORDER BY id DESC LIMIT 1;
    END IF;
    v_verb := CASE NEW.status WHEN 'APPROVED' THEN 'đã được duyệt' WHEN 'REJECTED' THEN 'bị từ chối'
                              WHEN 'RETURNED' THEN 'bị trả về' ELSE 'đã bị hủy' END;
    PERFORM collab.notify(NEW.tenant_id, NEW.requester_id, 'REQUEST_' || NEW.status, 'hr.onboarding_request', NEW.id,
                          'Đề nghị tiếp nhận ' || NEW.doc_no || ' (' || NEW.full_name || ') ' || v_verb,
                          CASE WHEN NEW.status IN ('REJECTED', 'RETURNED') THEN v_step.note END,
                          v_step.acted_by);
    RETURN NULL;
END $$;

CREATE TRIGGER onboarding_request_notify AFTER UPDATE OF status ON hr.onboarding_request
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION collab.onboarding_request_notify();

-- Tệp của hồ sơ nhân sự (CV, bằng cấp) có dữ liệu cá nhân: không đưa vào chỉ mục tìm kiếm.
CREATE OR REPLACE FUNCTION search.attachment_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.entity_type = 'proc.purchase_request' AND (NEW.status = 'CLEAN' OR OLD.status = 'CLEAN') THEN
        PERFORM search.mark(NEW.tenant_id, 'core.attachment', NEW.id);
    END IF;
    RETURN NULL;
END $$;

-- Hồ sơ đã có kết quả thì giữ nguyên tệp làm chứng cứ (như đề nghị mua sắm).
CREATE OR REPLACE FUNCTION core.attachment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF collab.entity_tenant(NEW.entity_type, NEW.entity_id) IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'Không tìm thấy chứng từ' USING ERRCODE = 'data_exception';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id, NEW.entity_type, NEW.entity_id, NEW.storage_key, NEW.uploaded_by)
       IS DISTINCT FROM (OLD.tenant_id, OLD.entity_type, OLD.entity_id, OLD.storage_key, OLD.uploaded_by) THEN
        RAISE EXCEPTION 'Không đổi chứng từ, khóa lưu trữ hoặc người tải lên của tệp đính kèm';
    END IF;
    IF NEW.status <> OLD.status AND OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Tệp đính kèm đã ở trạng thái %', OLD.status;
    END IF;
    IF OLD.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Tệp đính kèm đã bị xóa';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND (
        (NEW.entity_type = 'proc.purchase_request' AND EXISTS (
            SELECT 1 FROM proc.purchase_request WHERE id = NEW.entity_id AND status IN ('APPROVED', 'REJECTED', 'CANCELLED')))
        OR (NEW.entity_type = 'hr.onboarding_request' AND EXISTS (
            SELECT 1 FROM hr.onboarding_request WHERE id = NEW.entity_id AND status IN ('APPROVED', 'REJECTED', 'CANCELLED')))
    ) THEN
        RAISE EXCEPTION 'Chứng từ đã có kết quả nên không xóa được tệp đính kèm';
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Gửi duyệt, hủy, hoàn tất
-- ---------------------------------------------------------------------------

-- Ghế có người ngồi (hoặc đã có người được hẹn ngồi) từ ngày p_from trở đi không.
CREATE FUNCTION hr.position_taken_from(p_position uuid, p_from timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM core.assignment a
                   WHERE a.position_id = p_position AND a.valid_period && tstzrange(p_from, NULL))
$$;

-- Đầu ngày (giờ Việt Nam): bổ nhiệm có hiệu lực theo ngày (ADR #29).
CREATE FUNCTION hr.day_start(p_day date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$ SELECT (p_day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') $$;

CREATE FUNCTION hr.submit_onboarding_request(p_id uuid, p_actor uuid, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r      hr.onboarding_request;
    v_round  int;
    v_steps  int;
BEGIN
    SELECT * INTO v_r FROM hr.onboarding_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị tiếp nhận %', p_id;
    END IF;
    IF p_actor <> v_r.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được gửi duyệt';
    END IF;
    IF v_r.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị ở trạng thái % không gửi duyệt được', v_r.status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position_holder(v_r.requester_position_id, p_at) h
                   WHERE h.person_id = p_actor) THEN
        RAISE EXCEPTION 'Người lập không còn giữ vị trí dùng làm tư cách lập';
    END IF;
    IF NOT core.has_permission(p_actor, 'hr.onboarding.create', v_r.target_unit_id, p_at) THEN
        RAISE EXCEPTION 'Không có quyền lập đề nghị tiếp nhận vào đơn vị này';
    END IF;
    IF v_r.national_id_enc IS NULL THEN
        RAISE EXCEPTION 'Hồ sơ chưa có số CCCD';
    END IF;
    IF v_r.start_date < (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
        RAISE EXCEPTION 'Ngày vào làm % đã qua', to_char(v_r.start_date, 'DD/MM/YYYY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position p
                   WHERE p.id = v_r.target_position_id AND p.valid_period @> hr.day_start(v_r.start_date)) THEN
        RAISE EXCEPTION 'Vị trí được bổ nhiệm không còn hiệu lực vào ngày vào làm';
    END IF;
    IF hr.position_taken_from(v_r.target_position_id, hr.day_start(v_r.start_date)) THEN
        RAISE EXCEPTION 'Vị trí đã có người ngồi từ ngày vào làm trở đi';
    END IF;
    IF EXISTS (SELECT 1 FROM hr.onboarding_request o
               WHERE o.target_position_id = v_r.target_position_id AND o.id <> v_r.id AND o.status = 'PENDING') THEN
        RAISE EXCEPTION 'Đã có đề nghị tiếp nhận khác đang chờ duyệt cho vị trí này';
    END IF;

    v_round := v_r.approval_round + 1;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    SELECT v_r.tenant_id, 'hr.onboarding_request', v_r.id, v_round, c.step_order, c.rule_id, c.position_id
    FROM wf.resolve_approval_chain(v_r.tenant_id, 'ONBOARDING', v_r.target_position_id,
                                   coalesce(v_r.salary, 0), NULL, p_at) c;
    GET DIAGNOSTICS v_steps = ROW_COUNT;
    IF v_steps = 0 THEN
        RAISE EXCEPTION 'Chưa cấu hình quy tắc duyệt tiếp nhận nhân sự (quy trình ONBOARDING)';
    END IF;

    UPDATE hr.onboarding_request SET status = 'PENDING', approval_round = v_round WHERE id = p_id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
    VALUES (v_r.tenant_id, 'hr.onboarding_request', v_r.id, 'SUBMITTED', p_actor,
            jsonb_build_object('round', v_round, 'position_id', v_r.target_position_id), p_at);
    PERFORM wf.activate_next('hr.onboarding_request', v_r.id, v_round, p_at);
END $$;

CREATE FUNCTION hr.cancel_onboarding_request(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r hr.onboarding_request;
BEGIN
    SELECT * INTO v_r FROM hr.onboarding_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị tiếp nhận %', p_id;
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
    PERFORM wf.cancel_entity('hr.onboarding_request', p_id, p_reason, p_at, p_actor);
END $$;

-- Duyệt xong: tạo người (mã nhân viên NV-<năm>-<số>), bổ nhiệm giữ chính từ ngày vào làm, đưa tài khoản
-- vào hàng đợi của dịch vụ hr-account (kênh hr_account).
CREATE FUNCTION hr.complete_onboarding(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r       hr.onboarding_request;
    v_person  uuid;
    v_from    timestamptz;
BEGIN
    SELECT * INTO v_r FROM hr.onboarding_request WHERE id = p_id FOR UPDATE;
    IF v_r.person_id IS NOT NULL THEN
        RETURN;
    END IF;
    v_from := hr.day_start(v_r.start_date);
    IF hr.position_taken_from(v_r.target_position_id, v_from) THEN
        RAISE EXCEPTION 'Vị trí % đã có người ngồi từ ngày %: kết thúc bổ nhiệm hiện tại trước khi duyệt',
            (SELECT name FROM core.position WHERE id = v_r.target_position_id), to_char(v_r.start_date, 'DD/MM/YYYY');
    END IF;

    INSERT INTO core.person (tenant_id, full_name, employee_code)
    VALUES (v_r.tenant_id, btrim(v_r.full_name), core.next_doc_no(v_r.tenant_id, 'NV'))
    RETURNING id INTO v_person;
    INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
    VALUES (v_r.tenant_id, v_person, v_r.target_position_id, 'PRIMARY', tstzrange(v_from, NULL));

    UPDATE hr.onboarding_request
    SET person_id = v_person,
        account_status = CASE WHEN username IS NULL THEN 'NONE' ELSE 'PENDING' END
    WHERE id = p_id;
    IF v_r.username IS NOT NULL THEN
        PERFORM pg_notify('hr_account', p_id::text);
    END IF;
END $$;

-- Thử tạo lại tài khoản sau khi sửa nguyên nhân lỗi (ví dụ đổi tên đăng nhập bị trùng).
CREATE FUNCTION hr.retry_onboarding_account(p_id uuid, p_actor uuid, p_username text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_r hr.onboarding_request;
BEGIN
    SELECT * INTO v_r FROM hr.onboarding_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT core.has_permission(p_actor, 'hr.onboarding.create', v_r.target_unit_id) THEN
        RAISE EXCEPTION 'Không có quyền tạo tài khoản cho hồ sơ này';
    END IF;
    IF v_r.status <> 'APPROVED' OR v_r.account_status NOT IN ('FAILED', 'NONE') THEN
        RAISE EXCEPTION 'Hồ sơ không ở trạng thái chờ tạo lại tài khoản';
    END IF;
    IF coalesce(nullif(btrim(p_username), ''), v_r.username) IS NULL THEN
        RAISE EXCEPTION 'Cần tên đăng nhập';
    END IF;
    UPDATE hr.onboarding_request
    SET username = coalesce(nullif(lower(btrim(p_username)), ''), username),
        account_status = 'PENDING', account_error = NULL, account_attempts = 0
    WHERE id = p_id;
    PERFORM pg_notify('hr_account', p_id::text);
END $$;

CALL audit.enable('hr.onboarding_request');
CALL audit.enable('hr.private_access');
