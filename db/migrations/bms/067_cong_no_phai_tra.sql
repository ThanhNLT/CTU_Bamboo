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

-- Nhận hàng, hóa đơn nhà cung cấp, thanh toán và đối trừ công nợ nội bộ (ADR #96); sửa quy tắc hạn mức duyệt.
--
-- Đề nghị mua sắm đã duyệt -> phiếu nhận hàng (GR) theo từng dòng, không nhận quá số lượng đề nghị -> hóa đơn nhà cung
-- cấp (INV) đối chiếu ba bên với giá trị đã nhận -> thanh toán (PAY) không vượt số còn nợ. Hóa đơn nhà cung cấp nội bộ
-- (đối tác gắn đơn vị trong cùng tập đoàn) giữa hai công ty được đối trừ (NET): phần nợ chéo nhỏ hơn được ghi thanh toán
-- kiểu NETTING cho các hóa đơn cũ nhất của cả hai bên, chỉ còn phần chênh phải chuyển tiền.

CREATE SCHEMA IF NOT EXISTS fin;

INSERT INTO core.permission (code, description) VALUES
    ('proc.goods_receipt.create', 'Ghi phiếu nhận hàng cho đề nghị mua sắm đã duyệt'),
    ('fin.payable.read', 'Xem hóa đơn nhà cung cấp, thanh toán, đối trừ công nợ'),
    ('fin.payable.manage', 'Ghi hóa đơn nhà cung cấp, thanh toán, đối trừ công nợ nội bộ'),
    ('wf.approval_rule.manage', 'Sửa quy tắc hạn mức duyệt')
ON CONFLICT (code) DO NOTHING;

-- Phiếu nhận hàng ------------------------------------------------------------------------------------------------------

CREATE TABLE proc.goods_receipt (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no       text NOT NULL,
    request_id   uuid NOT NULL,
    org_unit_id  uuid NOT NULL,
    received_by  uuid NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now(),
    amount       numeric(18, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    note         text,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, request_id) REFERENCES proc.purchase_request (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, received_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON proc.goods_receipt (tenant_id, request_id);
CREATE INDEX ON proc.goods_receipt (tenant_id, org_unit_id);
CREATE INDEX ON proc.goods_receipt (tenant_id, received_by);

CREATE TABLE proc.goods_receipt_item (
    tenant_id        uuid NOT NULL,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id       uuid NOT NULL,
    request_item_id  uuid NOT NULL,
    quantity         numeric(18, 3) NOT NULL CHECK (quantity > 0),
    amount           numeric(18, 2) NOT NULL CHECK (amount >= 0),
    UNIQUE (receipt_id, request_item_id),
    FOREIGN KEY (tenant_id, receipt_id) REFERENCES proc.goods_receipt (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, request_item_id) REFERENCES proc.purchase_request_item (tenant_id, id)
);
CREATE INDEX ON proc.goods_receipt_item (tenant_id, receipt_id);
CREATE INDEX ON proc.goods_receipt_item (tenant_id, request_item_id);

CREATE VIEW proc.v_request_receipt AS
SELECT i.tenant_id, i.request_id, i.id AS request_item_id, i.line_no, i.description, i.uom, i.quantity, i.unit_price,
       coalesce(sum(g.quantity), 0) AS received_quantity,
       i.quantity - coalesce(sum(g.quantity), 0) AS remaining_quantity
FROM proc.purchase_request_item i
LEFT JOIN proc.goods_receipt_item g ON g.request_item_id = i.id
GROUP BY i.tenant_id, i.request_id, i.id, i.line_no, i.description, i.uom, i.quantity, i.unit_price;

CREATE FUNCTION proc.received_amount(p_request uuid) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(r.amount), 0) FROM proc.goods_receipt r WHERE r.request_id = p_request
$$;

CREATE FUNCTION proc.post_goods_receipt(p_request uuid, p_actor uuid, p_lines jsonb, p_note text DEFAULT NULL,
                                        p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    pr       proc.purchase_request;
    v_id     uuid := gen_random_uuid();
    v_line   jsonb;
    v_item   proc.v_request_receipt;
    v_qty    numeric;
    v_total  numeric := 0;
BEGIN
    SELECT * INTO pr FROM proc.purchase_request WHERE id = p_request FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị mua sắm';
    END IF;
    IF pr.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Chỉ nhận hàng cho đề nghị đã duyệt (đề nghị %: %)', pr.doc_no, pr.status;
    END IF;
    IF NOT core.has_permission(p_actor, 'proc.goods_receipt.create', pr.org_unit_id, p_at) THEN
        RAISE EXCEPTION 'Cần quyền proc.goods_receipt.create tại đơn vị lập đề nghị';
    END IF;
    IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'Phiếu nhận hàng cần ít nhất một dòng';
    END IF;

    INSERT INTO proc.goods_receipt (tenant_id, id, doc_no, request_id, org_unit_id, received_by, received_at, note)
    VALUES (pr.tenant_id, v_id, core.next_doc_no(pr.tenant_id, 'GR', p_at), pr.id, pr.org_unit_id, p_actor, p_at,
            nullif(btrim(p_note), ''));

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        SELECT * INTO v_item FROM proc.v_request_receipt
        WHERE request_item_id = (v_line ->> 'request_item_id')::uuid AND request_id = pr.id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Dòng hàng không thuộc đề nghị %', pr.doc_no;
        END IF;
        v_qty := (v_line ->> 'quantity')::numeric;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Số lượng nhận của dòng % phải lớn hơn 0', v_item.line_no;
        END IF;
        IF v_qty > v_item.remaining_quantity THEN
            RAISE EXCEPTION 'Dòng % chỉ còn % % chưa nhận', v_item.line_no, v_item.remaining_quantity, v_item.uom
               ;
        END IF;
        INSERT INTO proc.goods_receipt_item (tenant_id, receipt_id, request_item_id, quantity, amount)
        VALUES (pr.tenant_id, v_id, v_item.request_item_id, v_qty, round(v_qty * v_item.unit_price, 2));
        v_total := v_total + round(v_qty * v_item.unit_price, 2);
    END LOOP;

    UPDATE proc.goods_receipt SET amount = v_total WHERE id = v_id;
    UPDATE proc.purchase_order SET status = 'RECEIVED', updated_at = p_at
    WHERE request_id = pr.id AND status = 'ISSUED'
      AND NOT EXISTS (SELECT FROM proc.v_request_receipt v WHERE v.request_id = pr.id AND v.remaining_quantity > 0);
    RETURN v_id;
END $$;

-- Hóa đơn nhà cung cấp -------------------------------------------------------------------------------------------------

CREATE TABLE fin.invoice (
    tenant_id            uuid NOT NULL REFERENCES core.tenant,
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no               text NOT NULL,
    request_id           uuid NOT NULL,
    partner_id           uuid NOT NULL,
    org_unit_id          uuid NOT NULL,
    company_id           uuid NOT NULL,
    seller_company_id    uuid,
    supplier_invoice_no  text NOT NULL CHECK (btrim(supplier_invoice_no) <> ''),
    invoice_date         date NOT NULL,
    due_date             date,
    amount               numeric(18, 2) NOT NULL CHECK (amount > 0),
    paid_amount          numeric(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    match_status         text NOT NULL CHECK (match_status IN ('MATCHED', 'OVER_RECEIPT', 'NO_RECEIPT')),
    status               text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'PAID', 'VOID')),
    created_by           uuid NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    UNIQUE (tenant_id, partner_id, supplier_invoice_no),
    CHECK (paid_amount <= amount),
    CHECK (due_date IS NULL OR due_date >= invoice_date),
    FOREIGN KEY (tenant_id, request_id) REFERENCES proc.purchase_request (tenant_id, id),
    FOREIGN KEY (tenant_id, partner_id) REFERENCES mdm.partner (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, seller_company_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON fin.invoice (tenant_id, request_id);
CREATE INDEX ON fin.invoice (tenant_id, partner_id);
CREATE INDEX ON fin.invoice (tenant_id, org_unit_id);
CREATE INDEX ON fin.invoice (tenant_id, company_id, seller_company_id) WHERE status IN ('OPEN', 'PARTIAL');
CREATE INDEX ON fin.invoice (tenant_id, created_by);

-- Đối chiếu ba bên: tổng hóa đơn của đề nghị không vượt giá trị đã nhận (dung sai 0,5% cho làm tròn, phí nhỏ).
CREATE FUNCTION fin.match_status(p_request uuid, p_extra numeric, p_exclude uuid DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
    WITH r AS (SELECT proc.received_amount(p_request) AS received),
         i AS (SELECT coalesce(sum(amount), 0) AS invoiced FROM fin.invoice
               WHERE request_id = p_request AND status <> 'VOID' AND id IS DISTINCT FROM p_exclude)
    SELECT CASE WHEN r.received = 0 THEN 'NO_RECEIPT'
                WHEN i.invoiced + p_extra > round(r.received * 1.005, 2) THEN 'OVER_RECEIPT'
                ELSE 'MATCHED' END
    FROM r, i
$$;

CREATE FUNCTION fin.record_invoice(p_request uuid, p_actor uuid, p_supplier_no text, p_invoice_date date,
                                   p_amount numeric, p_due_date date DEFAULT NULL, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    pr        proc.purchase_request;
    v_partner mdm.partner;
    v_id      uuid := gen_random_uuid();
BEGIN
    SELECT * INTO pr FROM proc.purchase_request WHERE id = p_request FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị mua sắm';
    END IF;
    IF pr.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Chỉ ghi hóa đơn cho đề nghị đã duyệt (đề nghị %: %)', pr.doc_no, pr.status;
    END IF;
    IF pr.partner_id IS NULL THEN
        RAISE EXCEPTION 'Đề nghị % chưa có nhà cung cấp', pr.doc_no;
    END IF;
    IF NOT core.has_permission(p_actor, 'fin.payable.manage', pr.org_unit_id, p_at) THEN
        RAISE EXCEPTION 'Cần quyền fin.payable.manage tại đơn vị lập đề nghị';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Số tiền hóa đơn phải lớn hơn 0';
    END IF;
    SELECT * INTO v_partner FROM mdm.partner WHERE id = pr.partner_id;

    INSERT INTO fin.invoice (tenant_id, id, doc_no, request_id, partner_id, org_unit_id, company_id, seller_company_id,
                             supplier_invoice_no, invoice_date, due_date, amount, match_status, created_by, created_at)
    VALUES (pr.tenant_id, v_id, core.next_doc_no(pr.tenant_id, 'INV', p_at), pr.id, pr.partner_id, pr.org_unit_id,
            coalesce(core.company_of(pr.org_unit_id), pr.org_unit_id),
            CASE WHEN v_partner.internal_unit_id IS NOT NULL
                 THEN coalesce(core.company_of(v_partner.internal_unit_id), v_partner.internal_unit_id) END,
            btrim(p_supplier_no), p_invoice_date, p_due_date, round(p_amount, 2),
            fin.match_status(pr.id, round(p_amount, 2)), p_actor, p_at);
    RETURN v_id;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Hóa đơn % của nhà cung cấp này đã được ghi', btrim(p_supplier_no) USING ERRCODE = '23505';
END $$;

CREATE FUNCTION fin.void_invoice(p_invoice uuid, p_actor uuid, p_at timestamptz DEFAULT now()) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    inv fin.invoice;
BEGIN
    SELECT * INTO inv FROM fin.invoice WHERE id = p_invoice FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy hóa đơn';
    END IF;
    IF NOT core.has_permission(p_actor, 'fin.payable.manage', inv.org_unit_id, p_at) THEN
        RAISE EXCEPTION 'Cần quyền fin.payable.manage tại đơn vị lập đề nghị';
    END IF;
    IF inv.paid_amount > 0 OR inv.status = 'VOID' THEN
        RAISE EXCEPTION 'Chỉ hủy được hóa đơn chưa thanh toán';
    END IF;
    UPDATE fin.invoice SET status = 'VOID' WHERE id = p_invoice;
    -- Hóa đơn khác của cùng đề nghị có thể hết vượt giá trị đã nhận.
    UPDATE fin.invoice i SET match_status = fin.match_status(i.request_id, 0)
    WHERE i.request_id = inv.request_id AND i.status IN ('OPEN', 'PARTIAL') AND i.paid_amount = 0;
END $$;

-- Thanh toán -----------------------------------------------------------------------------------------------------------

CREATE TABLE fin.netting (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no      text NOT NULL,
    company_a   uuid NOT NULL,
    company_b   uuid NOT NULL,
    amount      numeric(18, 2) NOT NULL CHECK (amount > 0),
    note        text,
    created_by  uuid NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    CHECK (company_a <> company_b),
    FOREIGN KEY (tenant_id, company_a) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, company_b) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON fin.netting (tenant_id, company_a);
CREATE INDEX ON fin.netting (tenant_id, company_b);
CREATE INDEX ON fin.netting (tenant_id, created_by);

CREATE TABLE fin.payment (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no      text NOT NULL,
    invoice_id  uuid NOT NULL,
    amount      numeric(18, 2) NOT NULL CHECK (amount > 0),
    method      text NOT NULL CHECK (method IN ('TRANSFER', 'CASH', 'NETTING')),
    paid_at     timestamptz NOT NULL DEFAULT now(),
    reference   text,
    netting_id  uuid,
    created_by  uuid NOT NULL,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    CHECK ((method = 'NETTING') = (netting_id IS NOT NULL)),
    FOREIGN KEY (tenant_id, invoice_id) REFERENCES fin.invoice (tenant_id, id),
    FOREIGN KEY (tenant_id, netting_id) REFERENCES fin.netting (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON fin.payment (tenant_id, invoice_id);
CREATE INDEX ON fin.payment (tenant_id, netting_id);
CREATE INDEX ON fin.payment (tenant_id, created_by);

CREATE FUNCTION fin.apply_payment(p_invoice fin.invoice, p_actor uuid, p_amount numeric, p_method text,
                                  p_reference text, p_netting uuid, p_at timestamptz) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid := gen_random_uuid();
BEGIN
    INSERT INTO fin.payment (tenant_id, id, doc_no, invoice_id, amount, method, paid_at, reference, netting_id, created_by)
    VALUES (p_invoice.tenant_id, v_id, core.next_doc_no(p_invoice.tenant_id, 'PAY', p_at), p_invoice.id, p_amount,
            p_method, p_at, nullif(btrim(p_reference), ''), p_netting, p_actor);
    UPDATE fin.invoice
    SET paid_amount = paid_amount + p_amount,
        status = CASE WHEN paid_amount + p_amount >= amount THEN 'PAID' ELSE 'PARTIAL' END
    WHERE id = p_invoice.id;
    RETURN v_id;
END $$;

CREATE FUNCTION fin.record_payment(p_invoice uuid, p_actor uuid, p_amount numeric, p_method text,
                                   p_reference text DEFAULT NULL, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    inv fin.invoice;
BEGIN
    SELECT * INTO inv FROM fin.invoice WHERE id = p_invoice FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy hóa đơn';
    END IF;
    IF NOT core.has_permission(p_actor, 'fin.payable.manage', inv.org_unit_id, p_at) THEN
        RAISE EXCEPTION 'Cần quyền fin.payable.manage tại đơn vị lập đề nghị';
    END IF;
    IF p_method NOT IN ('TRANSFER', 'CASH') THEN
        RAISE EXCEPTION 'Hình thức thanh toán không hợp lệ: %', p_method;
    END IF;
    IF inv.status NOT IN ('OPEN', 'PARTIAL') THEN
        RAISE EXCEPTION 'Hóa đơn % không còn nợ', inv.doc_no;
    END IF;
    IF inv.match_status <> 'MATCHED' THEN
        RAISE EXCEPTION 'Hóa đơn % chưa khớp hàng đã nhận (%): nhận đủ hàng hoặc hủy hóa đơn trước khi trả',
            inv.doc_no, inv.match_status;
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > inv.amount - inv.paid_amount THEN
        RAISE EXCEPTION 'Số tiền trả phải lớn hơn 0 và không quá % còn nợ', inv.amount - inv.paid_amount
           ;
    END IF;
    RETURN fin.apply_payment(inv, p_actor, round(p_amount, 2), p_method, p_reference, NULL, p_at);
END $$;

-- Hóa đơn nhận hàng muộn: nhận thêm hàng làm hóa đơn chưa trả của đề nghị khớp trở lại.
CREATE FUNCTION fin.goods_receipt_rematch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE fin.invoice i SET match_status = fin.match_status(i.request_id, i.amount, i.id)
    WHERE i.request_id = NEW.request_id AND i.status IN ('OPEN', 'PARTIAL') AND i.paid_amount = 0;
    RETURN NULL;
END $$;
CREATE TRIGGER goods_receipt_rematch AFTER UPDATE OF amount ON proc.goods_receipt
    FOR EACH ROW EXECUTE FUNCTION fin.goods_receipt_rematch();

-- Đối trừ công nợ nội bộ -----------------------------------------------------------------------------------------------

-- Công nợ còn mở giữa hai công ty: a_owes_b là hóa đơn của A (bên mua) mua từ đơn vị nội bộ thuộc B, và ngược lại.
CREATE FUNCTION fin.netting_position(p_tenant uuid, p_a uuid, p_b uuid)
RETURNS TABLE (a_owes_b numeric, b_owes_a numeric, nettable numeric)
LANGUAGE sql STABLE AS $$
    WITH x AS (
        SELECT coalesce(sum(amount - paid_amount) FILTER (WHERE company_id = p_a AND seller_company_id = p_b), 0) AS ab,
               coalesce(sum(amount - paid_amount) FILTER (WHERE company_id = p_b AND seller_company_id = p_a), 0) AS ba
        FROM fin.invoice
        WHERE tenant_id = p_tenant AND status IN ('OPEN', 'PARTIAL') AND match_status = 'MATCHED'
    )
    SELECT ab, ba, least(ab, ba) FROM x
$$;

CREATE FUNCTION fin.run_netting(p_tenant uuid, p_a uuid, p_b uuid, p_actor uuid, p_note text DEFAULT NULL,
                                p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_amount numeric;
    v_id     uuid := gen_random_uuid();
    v_side   record;
    v_left   numeric;
    inv      fin.invoice;
    v_take   numeric;
BEGIN
    IF p_a = p_b THEN
        RAISE EXCEPTION 'Chọn hai công ty khác nhau';
    END IF;
    IF NOT EXISTS (SELECT FROM core.org_unit WHERE id = p_a AND tenant_id = p_tenant AND is_legal_entity)
       OR NOT EXISTS (SELECT FROM core.org_unit WHERE id = p_b AND tenant_id = p_tenant AND is_legal_entity) THEN
        RAISE EXCEPTION 'Đối trừ công nợ giữa hai pháp nhân trong cùng tập đoàn';
    END IF;
    IF NOT core.has_permission(p_actor, 'fin.payable.manage', p_a, p_at)
       OR NOT core.has_permission(p_actor, 'fin.payable.manage', p_b, p_at) THEN
        RAISE EXCEPTION 'Cần quyền fin.payable.manage ở cả hai công ty';
    END IF;
    -- Khóa hóa đơn mở của hai bên trước khi tính để hai lần đối trừ cùng lúc không trả trùng.
    PERFORM 1 FROM fin.invoice
    WHERE tenant_id = p_tenant AND status IN ('OPEN', 'PARTIAL')
      AND ((company_id = p_a AND seller_company_id = p_b) OR (company_id = p_b AND seller_company_id = p_a))
    FOR UPDATE;
    SELECT nettable INTO v_amount FROM fin.netting_position(p_tenant, p_a, p_b);
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Không có công nợ hai chiều để đối trừ';
    END IF;

    INSERT INTO fin.netting (tenant_id, id, doc_no, company_a, company_b, amount, note, created_by, created_at)
    VALUES (p_tenant, v_id, core.next_doc_no(p_tenant, 'NET', p_at), p_a, p_b, v_amount, nullif(btrim(p_note), ''),
            p_actor, p_at);

    FOR v_side IN SELECT * FROM (VALUES (p_a, p_b), (p_b, p_a)) s(buyer, seller) LOOP
        v_left := v_amount;
        FOR inv IN
            SELECT * FROM fin.invoice
            WHERE tenant_id = p_tenant AND company_id = v_side.buyer AND seller_company_id = v_side.seller
              AND status IN ('OPEN', 'PARTIAL') AND match_status = 'MATCHED'
            ORDER BY coalesce(due_date, invoice_date), invoice_date, doc_no
        LOOP
            EXIT WHEN v_left <= 0;
            v_take := least(v_left, inv.amount - inv.paid_amount);
            PERFORM fin.apply_payment(inv, p_actor, v_take, 'NETTING', NULL, v_id, p_at);
            v_left := v_left - v_take;
        END LOOP;
    END LOOP;
    RETURN v_id;
END $$;

-- Quyền đọc (Hasura) ---------------------------------------------------------------------------------------------------

CREATE FUNCTION fin.can_read_unit(p_unit uuid, p_request uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT core.has_permission(p_person, 'fin.payable.read', p_unit)
        OR core.has_permission(p_person, 'fin.payable.manage', p_unit)
        OR wf.entity_can_read('proc.purchase_request', p_request, p_person)
$$;

CREATE FUNCTION proc.goods_receipt_can_read(p_row proc.goods_receipt, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT fin.can_read_unit(p_row.org_unit_id, p_row.request_id, core.session_person(hasura_session))
$$;

CREATE FUNCTION fin.invoice_can_read(p_row fin.invoice, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT fin.can_read_unit(p_row.org_unit_id, p_row.request_id, core.session_person(hasura_session))
$$;

CREATE FUNCTION fin.netting_can_read(p_row fin.netting, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT core.has_permission(core.session_person(hasura_session), 'fin.payable.read', p_row.company_a)
        OR core.has_permission(core.session_person(hasura_session), 'fin.payable.read', p_row.company_b)
        OR core.has_permission(core.session_person(hasura_session), 'fin.payable.manage', p_row.company_a)
        OR core.has_permission(core.session_person(hasura_session), 'fin.payable.manage', p_row.company_b)
$$;

-- Quy tắc hạn mức duyệt ------------------------------------------------------------------------------------------------

-- Thay toàn bộ quy tắc đang hiệu lực của một quy trình (theo phạm vi đơn vị, NULL = mặc định của tenant): quy tắc cũ
-- kết thúc hiệu lực ngay, quy tắc mới bắt đầu từ lúc đó, lịch sử giữ lại để đối chiếu chuỗi duyệt của chứng từ cũ.
-- p_rules: [{min_amount, max_amount|null, step_order, approver_unit_type: mã UNIT_TYPE|null}].
CREATE FUNCTION wf.replace_approval_rules(p_tenant uuid, p_actor uuid, p_process text, p_scope_unit uuid,
                                          p_rules jsonb, p_at timestamptz DEFAULT now())
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_root  uuid;
    r       jsonb;
    v_type  uuid;
    v_count int := 0;
BEGIN
    SELECT id INTO v_root FROM core.org_unit
    WHERE tenant_id = p_tenant AND parent_id IS NULL AND valid_period @> p_at ORDER BY path LIMIT 1;
    IF v_root IS NULL OR NOT core.has_permission(p_actor, 'wf.approval_rule.manage', coalesce(p_scope_unit, v_root), p_at)
    THEN
        RAISE EXCEPTION 'Cần quyền wf.approval_rule.manage';
    END IF;
    IF p_scope_unit IS NOT NULL
       AND NOT EXISTS (SELECT FROM core.org_unit WHERE id = p_scope_unit AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'Không tìm thấy đơn vị áp dụng';
    END IF;
    IF jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN
        RAISE EXCEPTION 'Cần ít nhất một quy tắc';
    END IF;
    IF NOT EXISTS (SELECT FROM jsonb_array_elements(p_rules) x WHERE coalesce((x ->> 'min_amount')::numeric, 0) = 0) THEN
        RAISE EXCEPTION 'Phải có quy tắc bắt đầu từ 0 đồng để mọi chứng từ đều có người duyệt';
    END IF;

    UPDATE wf.approval_rule
    SET valid_period = tstzrange(lower(valid_period), p_at)
    WHERE tenant_id = p_tenant AND process_code = p_process AND scope_unit_id IS NOT DISTINCT FROM p_scope_unit
      AND category_code IS NULL AND valid_period @> p_at;

    FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
        v_type := NULL;
        IF nullif(r ->> 'approver_unit_type', '') IS NOT NULL THEN
            SELECT id INTO v_type FROM core.catalog_item
            WHERE tenant_id = p_tenant AND catalog = 'UNIT_TYPE' AND code = r ->> 'approver_unit_type';
            IF v_type IS NULL THEN
                RAISE EXCEPTION 'Không có loại đơn vị %', r ->> 'approver_unit_type';
            END IF;
        END IF;
        INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, max_amount, step_order,
                                      approver_unit_type_id, scope_unit_id, valid_period)
        VALUES (p_tenant, p_process, coalesce((r ->> 'min_amount')::numeric, 0), (r ->> 'max_amount')::numeric,
                coalesce((r ->> 'step_order')::int, 1), v_type, p_scope_unit, tstzrange(p_at, NULL));
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END $$;

-- Kiểm toán, quyền cho vai trò dựng sẵn ------------------------------------------------------------------------------

CALL audit.enable('proc.goods_receipt');
CALL audit.enable('fin.invoice');
CALL audit.enable('fin.payment');
CALL audit.enable('fin.netting');

CREATE OR REPLACE FUNCTION core.provision_tenant(p_tenant uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('NHAN_VIEN', ARRAY['proc.purchase_request.create', 'proc.purchase_request.read', 'kb.document.create']),
        ('QUAN_LY', ARRAY['proc.purchase_request.create', 'proc.purchase_request.read', 'wf.approval.act',
                          'hr.onboarding.read', 'hr.onboarding.create', 'hr.transfer.read', 'hr.transfer.create',
                          'hr.decision.read', 'ic.order.read', 'ic.order.confirm', 'kb.document.create',
                          'pm.project.read', 'pm.project.manage', 'cal.unit.manage', 'ops.group.read',
                          'proc.goods_receipt.create']),
        ('KIEM_SOAT', ARRAY['proc.purchase_request.read', 'audit.read', 'ops.group.read', 'data.lakehouse.read',
                            'hr.decision.read', 'hr.onboarding.read', 'ic.order.read', 'pm.project.read',
                            'fin.payable.read', 'fin.payable.manage']),
        ('QUAN_TRI_TO_CHUC', (SELECT array_agg(code ORDER BY code) FROM core.permission))
    ) v(code, perms) LOOP
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT p_tenant, ro.id, p.code
        FROM core.role ro JOIN core.permission p ON p.code = ANY (r.perms)
        WHERE ro.tenant_id = p_tenant AND ro.code = r.code
        ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order)
    SELECT p_tenant, v.code, 0, 1
    FROM (VALUES ('PURCHASE_REQUEST'), ('ONBOARDING'), ('KB_DOCUMENT')) v(code)
    WHERE NOT EXISTS (SELECT FROM wf.approval_rule ar
                      WHERE ar.tenant_id = p_tenant AND ar.process_code = v.code AND ar.valid_period @> now());
END $$;

-- Vai trò dựng sẵn của mọi tenant đã có nhận quyền mới (cùng phân chia như provision_tenant).
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT ro.tenant_id, ro.id, v.perm
FROM core.role ro
JOIN (VALUES ('QUAN_LY', 'proc.goods_receipt.create'), ('KIEM_SOAT', 'fin.payable.read'),
             ('KIEM_SOAT', 'fin.payable.manage'), ('QUAN_TRI_TO_CHUC', 'wf.approval_rule.manage'),
             ('QUAN_TRI_TO_CHUC', 'fin.payable.read'), ('QUAN_TRI_TO_CHUC', 'proc.goods_receipt.create'),
             ('QUAN_TRI_TO_CHUC', 'fin.payable.manage')) v(code, perm) ON v.code = ro.code
ON CONFLICT DO NOTHING;
