-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

INSERT INTO core.permission (code, description) VALUES
    ('kb.document.create', 'Đề xuất tài liệu vào thư viện tri thức'),
    ('kb.document.manage', 'Quản lý thư viện tri thức: xem mọi đề xuất, ngừng hiệu lực, nạp lại chỉ mục');

CREATE TABLE collab.kb_document (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no                 text NOT NULL,
    title                  text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 300),
    category               text NOT NULL CHECK (category IN ('regulation', 'sop', 'guide', 'faq')),
    scope                  text NOT NULL DEFAULT 'company' CHECK (scope IN ('group', 'company')),
    summary                text CHECK (summary IS NULL OR length(summary) <= 4000),
    toc                    text[] NOT NULL DEFAULT '{}',
    effective_date         date,
    version                int NOT NULL DEFAULT 1 CHECK (version > 0),
    supersedes_id          uuid,
    requester_id           uuid NOT NULL,
    requester_position_id  uuid NOT NULL,
    org_unit_id            uuid NOT NULL,
    status                 text NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED',
                                             'RETIRED')),
    approval_round         int NOT NULL DEFAULT 0,
    published_at           timestamptz,
    retired_at             timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, supersedes_id) REFERENCES collab.kb_document (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id)
);
CREATE INDEX ON collab.kb_document (tenant_id, status);
CREATE INDEX ON collab.kb_document (tenant_id, requester_id);
CREATE INDEX ON collab.kb_document (tenant_id, supersedes_id);

CREATE FUNCTION collab.kb_document_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM core.position_holder(NEW.requester_position_id) h
                       WHERE h.person_id = NEW.requester_id) THEN
            RAISE EXCEPTION 'Người lập không giữ vị trí dùng làm tư cách lập' USING ERRCODE = 'data_exception';
        END IF;
        SELECT org_unit_id INTO NEW.org_unit_id FROM core.position WHERE id = NEW.requester_position_id;
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'TL', NEW.created_at));
    ELSE
        IF (NEW.tenant_id, NEW.requester_id, NEW.requester_position_id, NEW.doc_no, NEW.created_at)
           IS DISTINCT FROM (OLD.tenant_id, OLD.requester_id, OLD.requester_position_id, OLD.doc_no, OLD.created_at) THEN
            RAISE EXCEPTION 'Không đổi người lập, tư cách lập hoặc số chứng từ' USING ERRCODE = 'data_exception';
        END IF;
        NEW.updated_at := now();
    END IF;
    IF NEW.supersedes_id IS NOT NULL THEN
        SELECT version + 1 INTO NEW.version FROM collab.kb_document WHERE id = NEW.supersedes_id;
    ELSE
        NEW.version := 1;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER kb_document_before_write BEFORE INSERT OR UPDATE ON collab.kb_document
FOR EACH ROW EXECUTE FUNCTION collab.kb_document_before_write();

CREATE FUNCTION collab.kb_document_check_session() RETURNS trigger
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
    IF NOT core.has_permission(NEW.requester_id, 'kb.document.create', NEW.org_unit_id) THEN
        RAISE EXCEPTION 'Không có quyền đề xuất tài liệu ở đơn vị này' USING ERRCODE = 'data_exception';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề xuất đã gửi duyệt nên không sửa được' USING ERRCODE = 'data_exception';
    END IF;
    IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM collab.kb_document WHERE id = NEW.supersedes_id AND status = 'APPROVED') THEN
        RAISE EXCEPTION 'Chỉ thay thế được tài liệu đang hiệu lực' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER z_kb_document_check_session
BEFORE INSERT OR UPDATE OF title, category, scope, summary, toc, effective_date, supersedes_id, requester_position_id
ON collab.kb_document
FOR EACH ROW EXECUTE FUNCTION collab.kb_document_check_session();

CREATE FUNCTION collab.kb_can_read_published(p_doc collab.kb_document, p_person uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM core.person p WHERE p.id = p_person AND p.tenant_id = p_doc.tenant_id)
       AND (p_doc.scope = 'group' OR EXISTS (
            SELECT 1 FROM core.assignment a
            JOIN core.position pos ON pos.id = a.position_id
            JOIN core.org_unit u ON u.id = pos.org_unit_id
            JOIN core.org_unit c ON c.id = core.company_of(p_doc.org_unit_id)
            WHERE a.person_id = p_person AND a.valid_period @> p_at AND u.path <@ c.path))
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
    WHEN 'collab.kb_document' THEN
        SELECT r.tenant_id, r.requester_id, r.requester_position_id
        INTO tenant_id, requester_id, requester_position_id
        FROM collab.kb_document r WHERE r.id = p_id;
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

CREATE FUNCTION collab.kb_publish(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_old uuid;
BEGIN
    UPDATE collab.kb_document SET published_at = now() WHERE id = p_id RETURNING supersedes_id INTO v_old;
    IF v_old IS NOT NULL THEN
        UPDATE collab.kb_document SET status = 'RETIRED', retired_at = now() WHERE id = v_old AND status = 'APPROVED';
    END IF;
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

CREATE FUNCTION collab.kb_document_can_read(p_row collab.kb_document, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('collab.kb_document', p_row.id, core.session_person(hasura_session))
$$;

CREATE OR REPLACE FUNCTION collab.entity_tenant(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    CASE p_type
    WHEN 'proc.purchase_request' THEN
        RETURN (SELECT tenant_id FROM proc.purchase_request WHERE id = p_id);
    WHEN 'hr.onboarding_request' THEN
        RETURN (SELECT tenant_id FROM hr.onboarding_request WHERE id = p_id);
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
    WHEN 'ic.ic_order' THEN
        RETURN (SELECT created_by FROM ic.ic_order WHERE id = p_id);
    WHEN 'collab.kb_document' THEN
        RETURN (SELECT requester_id FROM collab.kb_document WHERE id = p_id);
    ELSE
        RETURN NULL;
    END CASE;
END $$;

CREATE FUNCTION collab.kb_document_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_step  wf.approval_step;
    v_verb  text;
BEGIN
    IF NEW.status NOT IN ('APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED') THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_step FROM wf.approval_step
    WHERE entity_type = 'collab.kb_document' AND entity_id = NEW.id AND round = NEW.approval_round
      AND acted_by IS NOT NULL
    ORDER BY acted_at DESC NULLS LAST, step_order DESC LIMIT 1;
    v_verb := CASE NEW.status WHEN 'APPROVED' THEN 'đã được duyệt và xuất bản vào thư viện'
                              WHEN 'REJECTED' THEN 'bị từ chối' WHEN 'RETURNED' THEN 'bị trả về' ELSE 'đã bị hủy' END;
    PERFORM collab.notify(NEW.tenant_id, NEW.requester_id, 'REQUEST_' || NEW.status, 'collab.kb_document', NEW.id,
                          'Đề xuất tài liệu ' || NEW.doc_no || ' ' || v_verb,
                          CASE WHEN NEW.status IN ('REJECTED', 'RETURNED') THEN v_step.note END,
                          CASE WHEN NEW.status = 'CANCELLED' THEN NULL ELSE v_step.acted_by END);
    RETURN NULL;
END $$;

CREATE TRIGGER kb_document_notify AFTER UPDATE OF status ON collab.kb_document
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION collab.kb_document_notify();

CREATE OR REPLACE FUNCTION core.attachment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF collab.entity_tenant(NEW.entity_type, NEW.entity_id) IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'Không tìm thấy chứng từ' USING ERRCODE = 'data_exception';
        END IF;
        IF NEW.entity_type = 'collab.kb_document' AND NOT EXISTS (
            SELECT 1 FROM collab.kb_document WHERE id = NEW.entity_id AND requester_id = NEW.uploaded_by
                                                  AND status IN ('DRAFT', 'RETURNED')) THEN
            RAISE EXCEPTION 'Chỉ người lập thêm tệp khi đề xuất còn nháp hoặc bị trả về'
                USING ERRCODE = 'data_exception';
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
        OR (NEW.entity_type = 'collab.kb_document' AND EXISTS (
            SELECT 1 FROM collab.kb_document WHERE id = NEW.entity_id AND status NOT IN ('DRAFT', 'RETURNED', 'PENDING')))
    ) THEN
        RAISE EXCEPTION 'Chứng từ đã có kết quả nên không xóa được tệp đính kèm';
    END IF;
    RETURN NEW;
END $$;

ALTER TABLE search.pending DROP CONSTRAINT pending_entity_type_check;
ALTER TABLE search.pending ADD CONSTRAINT pending_entity_type_check
    CHECK (entity_type IN ('proc.purchase_request', 'core.attachment', 'collab.kb_document'));

CREATE FUNCTION search.attachment_indexable(p_entity_type text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_entity_type IN ('proc.purchase_request', 'collab.kb_document') $$;

CREATE OR REPLACE FUNCTION search.attachment_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF search.attachment_indexable(NEW.entity_type) AND (NEW.status = 'CLEAN' OR OLD.status = 'CLEAN') THEN
        PERFORM search.mark(NEW.tenant_id, 'core.attachment', NEW.id);
    END IF;
    RETURN NULL;
END $$;

CREATE FUNCTION search.kb_document_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    a record;
BEGIN
    PERFORM search.mark(coalesce(NEW.tenant_id, OLD.tenant_id), 'collab.kb_document', coalesce(NEW.id, OLD.id));
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        FOR a IN SELECT id FROM core.attachment WHERE entity_type = 'collab.kb_document' AND entity_id = NEW.id LOOP
            PERFORM search.mark(NEW.tenant_id, 'core.attachment', a.id);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER search_mark AFTER INSERT OR UPDATE OR DELETE ON collab.kb_document
FOR EACH ROW EXECUTE FUNCTION search.kb_document_changed();

CREATE FUNCTION search.kb_document_doc(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'tenant_id', d.tenant_id,
        'entity_type', 'collab.kb_document',
        'entity_id', d.id,
        'doc_no', d.doc_no,
        'title', d.title,
        'description', concat_ws(E'\n', d.summary, array_to_string(d.toc, E'\n')),
        'status', d.status,
        'requester', p.full_name,
        'org_unit', u.name,
        'created_at', extract(epoch FROM d.created_at)::bigint)
    FROM collab.kb_document d
    JOIN core.person p ON p.id = d.requester_id
    JOIN core.org_unit u ON u.id = d.org_unit_id
    WHERE d.id = p_id AND d.status = 'APPROVED'
$$;

CREATE FUNCTION search.attachment_visible(p_entity_type text, p_entity_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT CASE p_entity_type
        WHEN 'proc.purchase_request' THEN true
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
    WHERE status = 'CLEAN' AND deleted_at IS NULL AND search.attachment_indexable(entity_type)
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET dirty = true, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp();
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_notify('search_sync', 'all');
    RETURN n;
END $$;

CREATE FUNCTION collab.submit_kb_document(p_id uuid, p_actor uuid, p_at timestamptz DEFAULT now()) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_d      collab.kb_document;
    v_round  int;
    v_steps  int;
BEGIN
    SELECT * INTO v_d FROM collab.kb_document WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề xuất tài liệu %', p_id;
    END IF;
    IF p_actor <> v_d.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được gửi duyệt';
    END IF;
    IF v_d.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề xuất ở trạng thái % không gửi duyệt được', v_d.status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.position_holder(v_d.requester_position_id, p_at) h WHERE h.person_id = p_actor)
    THEN
        RAISE EXCEPTION 'Người lập không còn giữ vị trí dùng làm tư cách lập';
    END IF;
    IF NOT core.has_permission(p_actor, 'kb.document.create', v_d.org_unit_id, p_at) THEN
        RAISE EXCEPTION 'Không có quyền đề xuất tài liệu ở đơn vị này';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.attachment
                   WHERE entity_type = 'collab.kb_document' AND entity_id = p_id AND status = 'CLEAN'
                     AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Đính kèm tệp tài liệu (đã kiểm dịch) trước khi gửi duyệt';
    END IF;

    v_round := v_d.approval_round + 1;
    INSERT INTO wf.approval_step (tenant_id, entity_type, entity_id, round, step_order, rule_id, position_id)
    SELECT v_d.tenant_id, 'collab.kb_document', v_d.id, v_round, c.step_order, c.rule_id, c.position_id
    FROM wf.resolve_approval_chain(v_d.tenant_id, 'KB_DOCUMENT', v_d.requester_position_id, 0, NULL, p_at) c;
    GET DIAGNOSTICS v_steps = ROW_COUNT;
    IF v_steps = 0 THEN
        RAISE EXCEPTION 'Chưa cấu hình quy tắc duyệt tài liệu (quy trình KB_DOCUMENT)';
    END IF;

    UPDATE collab.kb_document SET status = 'PENDING', approval_round = v_round WHERE id = p_id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
    VALUES (v_d.tenant_id, 'collab.kb_document', v_d.id, 'SUBMITTED', p_actor, jsonb_build_object('round', v_round), p_at);
    PERFORM wf.activate_next('collab.kb_document', v_d.id, v_round, p_at);
END $$;

CREATE FUNCTION collab.cancel_kb_document(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_d collab.kb_document;
BEGIN
    SELECT * INTO v_d FROM collab.kb_document WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề xuất tài liệu %', p_id;
    END IF;
    IF p_actor <> v_d.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được hủy đề xuất';
    END IF;
    IF v_d.status NOT IN ('DRAFT', 'PENDING', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề xuất ở trạng thái % không hủy được', v_d.status;
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Hủy đề xuất phải ghi lý do';
    END IF;
    PERFORM wf.cancel_entity('collab.kb_document', p_id, p_reason, p_at, p_actor);
END $$;

CREATE FUNCTION collab.retire_kb_document(p_id uuid, p_actor uuid, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_d collab.kb_document;
BEGIN
    SELECT * INTO v_d FROM collab.kb_document WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_d.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Chỉ ngừng được tài liệu đang hiệu lực';
    END IF;
    IF NOT core.has_permission(p_actor, 'kb.document.manage', v_d.org_unit_id) THEN
        RAISE EXCEPTION 'Cần quyền kb.document.manage để ngừng hiệu lực tài liệu';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Ngừng hiệu lực phải ghi lý do';
    END IF;
    UPDATE collab.kb_document SET status = 'RETIRED', retired_at = now() WHERE id = p_id;
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail)
    VALUES (v_d.tenant_id, 'collab.kb_document', p_id, 'CANCELLED', p_actor,
            jsonb_build_object('reason', p_reason, 'retired', true));
END $$;

CALL audit.enable('collab.kb_document');
