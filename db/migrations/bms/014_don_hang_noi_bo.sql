-- Bamboo - DX-OS Open-Core
-- @version 0.5.0
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

CREATE SCHEMA mfg;

INSERT INTO core.permission (code, description) VALUES
    ('ic.order.read', 'Xem đơn hàng nội bộ bán ra từ đơn vị'),
    ('ic.order.confirm', 'Xác nhận hoặc từ chối đơn hàng nội bộ bán ra từ đơn vị');

CREATE TABLE mfg.lot (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_no       text NOT NULL,
    item_id      uuid NOT NULL,
    org_unit_id  uuid NOT NULL,
    quantity     numeric(18, 3) NOT NULL CHECK (quantity > 0),
    uom          text NOT NULL,
    produced_on  date NOT NULL,
    status       text NOT NULL DEFAULT 'RELEASED' CHECK (status IN ('RELEASED', 'ON_HOLD', 'SCRAPPED')),
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, lot_no),
    FOREIGN KEY (tenant_id, item_id) REFERENCES mdm.item (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id)
);
CREATE INDEX ON mfg.lot (tenant_id, item_id);
CREATE INDEX ON mfg.lot (tenant_id, org_unit_id);

CREATE TRIGGER lot_touch BEFORE UPDATE ON mfg.lot
FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();

ALTER TABLE ic.ic_order
    DROP CONSTRAINT ic_order_status_check,
    ADD CHECK (status IN ('DRAFT', 'PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'SETTLED')),
    ADD COLUMN doc_no         text,
    ADD COLUMN decided_by     uuid,
    ADD COLUMN decided_at     timestamptz,
    ADD COLUMN decision_note  text,
    ADD COLUMN updated_at     timestamptz NOT NULL DEFAULT now(),
    ADD FOREIGN KEY (tenant_id, decided_by) REFERENCES core.person (tenant_id, id);
CREATE INDEX ON ic.ic_order (tenant_id, decided_by);

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id, tenant_id, created_at FROM ic.ic_order ORDER BY created_at, id LOOP
        UPDATE ic.ic_order SET doc_no = core.next_doc_no(r.tenant_id, 'IC', r.created_at) WHERE id = r.id;
    END LOOP;
END $$;

ALTER TABLE ic.ic_order
    ALTER COLUMN doc_no SET NOT NULL,
    ADD UNIQUE (tenant_id, doc_no);

CREATE FUNCTION ic.ic_order_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'IC', NEW.created_at));
    ELSE
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER ic_order_before_write BEFORE INSERT OR UPDATE ON ic.ic_order
FOR EACH ROW EXECUTE FUNCTION ic.ic_order_before_write();

CREATE TABLE ic.ic_order_item (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     uuid NOT NULL,
    line_no      int NOT NULL CHECK (line_no > 0),
    item_id      uuid,
    description  text NOT NULL,
    uom          text NOT NULL,
    quantity     numeric(18, 3) NOT NULL CHECK (quantity > 0),
    unit_price   numeric(18, 2) NOT NULL CHECK (unit_price >= 0),
    amount       numeric(18, 2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    lot_id       uuid,
    UNIQUE (tenant_id, id),
    UNIQUE (order_id, line_no),
    FOREIGN KEY (tenant_id, order_id) REFERENCES ic.ic_order (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, item_id) REFERENCES mdm.item (tenant_id, id),
    FOREIGN KEY (tenant_id, lot_id) REFERENCES mfg.lot (tenant_id, id)
);
CREATE INDEX ON ic.ic_order_item (tenant_id, order_id);
CREATE INDEX ON ic.ic_order_item (tenant_id, item_id);
CREATE INDEX ON ic.ic_order_item (tenant_id, lot_id);

CREATE TABLE proc.purchase_order (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no        text NOT NULL,
    request_id    uuid NOT NULL,
    ic_order_id   uuid,
    partner_id    uuid NOT NULL,
    org_unit_id   uuid NOT NULL,
    buyer_id      uuid NOT NULL,
    total_amount  numeric(18, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status        text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    UNIQUE (tenant_id, ic_order_id),
    FOREIGN KEY (tenant_id, request_id) REFERENCES proc.purchase_request (tenant_id, id),
    FOREIGN KEY (tenant_id, ic_order_id) REFERENCES ic.ic_order (tenant_id, id),
    FOREIGN KEY (tenant_id, partner_id) REFERENCES mdm.partner (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, buyer_id) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON proc.purchase_order (tenant_id, request_id);
CREATE INDEX ON proc.purchase_order (tenant_id, partner_id);
CREATE INDEX ON proc.purchase_order (tenant_id, org_unit_id);
CREATE INDEX ON proc.purchase_order (tenant_id, buyer_id);

CREATE FUNCTION proc.purchase_order_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'PO', NEW.created_at));
    ELSE
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER purchase_order_before_write BEFORE INSERT OR UPDATE ON proc.purchase_order
FOR EACH ROW EXECUTE FUNCTION proc.purchase_order_before_write();

CREATE TABLE proc.purchase_order_item (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     uuid NOT NULL,
    line_no      int NOT NULL CHECK (line_no > 0),
    item_id      uuid,
    description  text NOT NULL,
    uom          text NOT NULL,
    quantity     numeric(18, 3) NOT NULL CHECK (quantity > 0),
    unit_price   numeric(18, 2) NOT NULL CHECK (unit_price >= 0),
    amount       numeric(18, 2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    lot_id       uuid,
    UNIQUE (tenant_id, id),
    UNIQUE (order_id, line_no),
    FOREIGN KEY (tenant_id, order_id) REFERENCES proc.purchase_order (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, item_id) REFERENCES mdm.item (tenant_id, id),
    FOREIGN KEY (tenant_id, lot_id) REFERENCES mfg.lot (tenant_id, id)
);
CREATE INDEX ON proc.purchase_order_item (tenant_id, order_id);
CREATE INDEX ON proc.purchase_order_item (tenant_id, item_id);
CREATE INDEX ON proc.purchase_order_item (tenant_id, lot_id);

CREATE FUNCTION proc.purchase_request_internal_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_seller uuid;
BEGIN
    SELECT internal_unit_id INTO v_seller FROM mdm.partner WHERE id = NEW.partner_id;
    IF v_seller IS NULL OR NEW.ic_order_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF core.company_of(NEW.org_unit_id) = v_seller THEN
        RAISE EXCEPTION 'Không đặt hàng nội bộ từ chính công ty của đơn vị lập đề nghị';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM proc.purchase_request_item WHERE request_id = NEW.id) THEN
        RAISE EXCEPTION 'Đề nghị mua từ nhà cung cấp nội bộ cần có dòng hàng';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER purchase_request_internal_check BEFORE UPDATE OF status ON proc.purchase_request
FOR EACH ROW WHEN (NEW.status = 'PENDING' AND OLD.status IS DISTINCT FROM 'PENDING')
EXECUTE FUNCTION proc.purchase_request_internal_check();

CREATE FUNCTION ic.create_from_request(p_request uuid, p_at timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_r       proc.purchase_request;
    v_seller  uuid;
    v_id      uuid;
BEGIN
    SELECT * INTO v_r FROM proc.purchase_request WHERE id = p_request FOR UPDATE;
    SELECT internal_unit_id INTO v_seller FROM mdm.partner WHERE id = v_r.partner_id;
    IF v_seller IS NULL OR v_r.ic_order_id IS NOT NULL THEN
        RETURN v_r.ic_order_id;
    END IF;
    INSERT INTO ic.ic_order (tenant_id, seller_unit_id, buyer_unit_id, created_by, total_amount, status, created_at)
    VALUES (v_r.tenant_id, v_seller, core.company_of(v_r.org_unit_id), v_r.requester_id, v_r.total_amount,
            'PENDING', p_at)
    RETURNING id INTO v_id;
    INSERT INTO ic.ic_order_item (tenant_id, order_id, line_no, item_id, description, uom, quantity, unit_price)
    SELECT tenant_id, v_id, line_no, item_id, description, uom, quantity, unit_price
    FROM proc.purchase_request_item WHERE request_id = p_request;
    UPDATE proc.purchase_request SET ic_order_id = v_id WHERE id = p_request;
    RETURN v_id;
END $$;

CREATE FUNCTION proc.issue_purchase_order(p_ic_order uuid, p_at timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_r   proc.purchase_request;
    v_o   ic.ic_order;
    v_id  uuid;
BEGIN
    SELECT * INTO v_o FROM ic.ic_order WHERE id = p_ic_order;
    SELECT * INTO v_r FROM proc.purchase_request WHERE ic_order_id = p_ic_order;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    INSERT INTO proc.purchase_order (tenant_id, request_id, ic_order_id, partner_id, org_unit_id, buyer_id,
                                     total_amount, created_at)
    VALUES (v_r.tenant_id, v_r.id, p_ic_order, v_r.partner_id, v_r.org_unit_id, v_r.requester_id,
            v_o.total_amount, p_at)
    RETURNING id INTO v_id;
    INSERT INTO proc.purchase_order_item (tenant_id, order_id, line_no, item_id, description, uom, quantity,
                                          unit_price, lot_id)
    SELECT tenant_id, v_id, line_no, item_id, description, uom, quantity, unit_price, lot_id
    FROM ic.ic_order_item WHERE order_id = p_ic_order;
    RETURN v_id;
END $$;

CREATE FUNCTION ic.lock_pending(p_id uuid) RETURNS ic.ic_order
LANGUAGE plpgsql AS $$
DECLARE
    v_o ic.ic_order;
BEGIN
    SELECT * INTO v_o FROM ic.ic_order WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đơn hàng nội bộ %', p_id;
    END IF;
    IF v_o.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Đơn hàng nội bộ ở trạng thái % không xử lý được', v_o.status;
    END IF;
    RETURN v_o;
END $$;

CREATE FUNCTION ic.confirm_order(p_id uuid, p_actor uuid, p_lots jsonb DEFAULT '{}', p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_o     ic.ic_order;
    l       ic.ic_order_item;
    v_lot   mfg.lot;
    v_lid   uuid;
    v_over  record;
BEGIN
    v_o := ic.lock_pending(p_id);
    IF NOT core.has_permission(p_actor, 'ic.order.confirm', v_o.seller_unit_id, p_at) THEN
        RAISE EXCEPTION 'Không có quyền xác nhận đơn hàng nội bộ của công ty bán';
    END IF;
    IF p_actor = v_o.created_by THEN
        RAISE EXCEPTION 'Người đặt hàng không tự xác nhận đơn của mình';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(p_lots, '{}')) k
               WHERE NOT EXISTS (SELECT 1 FROM ic.ic_order_item i WHERE i.order_id = p_id AND i.id::text = k)) THEN
        RAISE EXCEPTION 'Có dòng hàng không thuộc đơn này';
    END IF;

    FOR l IN SELECT * FROM ic.ic_order_item WHERE order_id = p_id ORDER BY line_no LOOP
        v_lid := nullif(p_lots ->> l.id::text, '')::uuid;
        IF v_lid IS NULL THEN
            IF EXISTS (SELECT 1 FROM mfg.lot t WHERE t.tenant_id = v_o.tenant_id AND t.item_id = l.item_id
                                                AND core.company_of(t.org_unit_id) = v_o.seller_unit_id) THEN
                RAISE EXCEPTION 'Dòng %: chọn lô xuất cho %', l.line_no, l.description;
            END IF;
            CONTINUE;
        END IF;
        SELECT * INTO v_lot FROM mfg.lot WHERE id = v_lid AND tenant_id = v_o.tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Dòng %: không tìm thấy lô', l.line_no;
        END IF;
        IF core.company_of(v_lot.org_unit_id) IS DISTINCT FROM v_o.seller_unit_id THEN
            RAISE EXCEPTION 'Dòng %: lô % không thuộc công ty bán', l.line_no, v_lot.lot_no;
        END IF;
        IF v_lot.item_id IS DISTINCT FROM l.item_id THEN
            RAISE EXCEPTION 'Dòng %: lô % không phải của mặt hàng %', l.line_no, v_lot.lot_no, l.description;
        END IF;
        IF v_lot.status <> 'RELEASED' THEN
            RAISE EXCEPTION 'Dòng %: lô % đang bị giữ, không xuất được', l.line_no, v_lot.lot_no;
        END IF;
        UPDATE ic.ic_order_item SET lot_id = v_lid WHERE id = l.id;
    END LOOP;

    SELECT t.lot_no, t.quantity, sum(i.quantity) AS used INTO v_over
    FROM ic.ic_order_item i
    JOIN ic.ic_order o ON o.id = i.order_id
    JOIN mfg.lot t ON t.id = i.lot_id
    WHERE i.lot_id IN (SELECT lot_id FROM ic.ic_order_item WHERE order_id = p_id AND lot_id IS NOT NULL)
      AND (o.id = p_id OR o.status IN ('CONFIRMED', 'SETTLED'))
    GROUP BY t.id, t.lot_no, t.quantity
    HAVING sum(i.quantity) > t.quantity
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Lô % không đủ số lượng: cần %, lô có %', v_over.lot_no, v_over.used, v_over.quantity;
    END IF;

    UPDATE ic.ic_order SET status = 'CONFIRMED', decided_by = p_actor, decided_at = p_at WHERE id = p_id;
    RETURN proc.issue_purchase_order(p_id, p_at);
END $$;

CREATE FUNCTION ic.reject_order(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_o ic.ic_order;
BEGIN
    v_o := ic.lock_pending(p_id);
    IF NOT core.has_permission(p_actor, 'ic.order.confirm', v_o.seller_unit_id, p_at) THEN
        RAISE EXCEPTION 'Không có quyền từ chối đơn hàng nội bộ của công ty bán';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Từ chối đơn hàng nội bộ phải ghi lý do';
    END IF;
    UPDATE ic.ic_order SET status = 'REJECTED', decided_by = p_actor, decided_at = p_at,
                           decision_note = btrim(p_reason)
    WHERE id = p_id;
END $$;

CREATE FUNCTION ic.cancel_order(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_o ic.ic_order;
BEGIN
    v_o := ic.lock_pending(p_id);
    IF p_actor <> v_o.created_by THEN
        RAISE EXCEPTION 'Chỉ người đặt hàng được hủy đơn hàng nội bộ';
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Hủy đơn hàng nội bộ phải ghi lý do';
    END IF;
    UPDATE ic.ic_order SET status = 'CANCELLED', decided_by = p_actor, decided_at = p_at,
                           decision_note = btrim(p_reason)
    WHERE id = p_id;
END $$;

CREATE FUNCTION ic.can_read(p_id uuid, p_person uuid, p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM ic.ic_order o
        WHERE o.id = p_id AND p_person IS NOT NULL
          AND (o.created_by = p_person
               OR core.has_permission(p_person, 'ic.order.read', o.seller_unit_id, p_at)
               OR core.has_permission(p_person, 'ic.order.confirm', o.seller_unit_id, p_at)
               OR EXISTS (SELECT 1 FROM proc.purchase_request r
                          WHERE r.ic_order_id = o.id
                            AND wf.entity_can_read('proc.purchase_request', r.id, p_person, p_at)))
    )
$$;

CREATE FUNCTION ic.ic_order_can_read(p_row ic.ic_order, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT ic.can_read(p_row.id, core.session_person(hasura_session))
$$;

CREATE FUNCTION ic.ic_order_can_confirm(p_row ic.ic_order, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT p_row.status = 'PENDING'
       AND p_row.created_by IS DISTINCT FROM core.session_person(hasura_session)
       AND core.has_permission(core.session_person(hasura_session), 'ic.order.confirm', p_row.seller_unit_id)
$$;

CREATE FUNCTION proc.purchase_order_can_read(p_row proc.purchase_order, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT wf.entity_can_read('proc.purchase_request', p_row.request_id, core.session_person(hasura_session))
$$;

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
    WHEN 'ic.ic_order' THEN
        RETURN ic.can_read(p_id, p_person, p_at);
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
    ELSE
        RAISE EXCEPTION 'Loại chứng từ chưa hỗ trợ duyệt: %', p_type;
    END CASE;
END $$;

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
    ELSE
        RETURN NULL;
    END CASE;
END $$;

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED'));

CREATE FUNCTION ic.confirmers(p_seller uuid, p_at timestamptz DEFAULT now()) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
    SELECT DISTINCT g.person_id
    FROM core.v_permission_grant g
    JOIN core.org_unit u ON u.id = p_seller AND u.tenant_id = g.tenant_id
    WHERE g.permission_code = 'ic.order.confirm' AND g.valid_period @> p_at
      AND core.has_permission(g.person_id, 'ic.order.confirm', p_seller, p_at)
$$;

CREATE FUNCTION collab.ic_order_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_label  text := collab.entity_label('ic.ic_order', NEW.id);
    v_who    uuid;
BEGIN
    IF NEW.status = 'PENDING' THEN
        FOR v_who IN SELECT ic.confirmers(NEW.seller_unit_id) LOOP
            PERFORM collab.notify(NEW.tenant_id, v_who, 'IC_ORDER_NEW', 'ic.ic_order', NEW.id,
                                  'Đơn hàng nội bộ cần xác nhận: ' || v_label, NULL, NEW.created_by);
        END LOOP;
    ELSIF NEW.status IN ('CONFIRMED', 'REJECTED') THEN
        PERFORM collab.notify(NEW.tenant_id, NEW.created_by, 'IC_ORDER_' || NEW.status, 'ic.ic_order', NEW.id,
                              'Đơn hàng nội bộ ' || NEW.doc_no
                                  || CASE NEW.status WHEN 'CONFIRMED' THEN ' đã được bên bán xác nhận'
                                                     ELSE ' bị bên bán từ chối' END,
                              NEW.decision_note, NEW.decided_by);
    ELSIF NEW.status = 'CANCELLED' AND TG_OP = 'UPDATE' AND OLD.status = 'PENDING' THEN
        FOR v_who IN SELECT ic.confirmers(NEW.seller_unit_id) LOOP
            PERFORM collab.notify(NEW.tenant_id, v_who, 'IC_ORDER_CANCELLED', 'ic.ic_order', NEW.id,
                                  'Bên mua đã hủy đơn hàng nội bộ ' || NEW.doc_no, NEW.decision_note, NEW.decided_by);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER ic_order_notify_insert AFTER INSERT ON ic.ic_order
FOR EACH ROW EXECUTE FUNCTION collab.ic_order_notify();
CREATE TRIGGER ic_order_notify_update AFTER UPDATE OF status ON ic.ic_order
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION collab.ic_order_notify();

CALL audit.enable('ic.ic_order_item');
CALL audit.enable('proc.purchase_order');
CALL audit.enable('proc.purchase_order_item');
CALL audit.enable('mfg.lot');

ALTER PUBLICATION bms_cdc ADD TABLES IN SCHEMA mfg;
