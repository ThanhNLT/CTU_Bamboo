-- 006: Dữ liệu chủ (nhà cung cấp, vật tư), số chứng từ, dòng hàng của đề nghị
-- mua sắm, người lập hủy đề nghị (thiết kế CSDL mục 4.3).

CREATE SCHEMA IF NOT EXISTS mdm;

INSERT INTO core.permission (code, description) VALUES
    ('mdm.manage', 'Quản trị dữ liệu chủ (nhà cung cấp, vật tư)');

-- Cập nhật updated_at mỗi khi sửa dòng.
CREATE FUNCTION core.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Dữ liệu chủ
-- ---------------------------------------------------------------------------

-- Nhà cung cấp. internal_unit_id: công ty (pháp nhân) cùng tenant, dùng cho giao dịch nội bộ.
CREATE TABLE mdm.partner (
    tenant_id         uuid NOT NULL REFERENCES core.tenant,
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code              text NOT NULL,
    name              text NOT NULL,
    tax_code          text,
    address           text,
    email             text,
    phone             text,
    internal_unit_id  uuid,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, internal_unit_id),
    FOREIGN KEY (tenant_id, internal_unit_id) REFERENCES core.org_unit (tenant_id, id)
);

CREATE FUNCTION mdm.partner_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.internal_unit_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM core.org_unit WHERE id = NEW.internal_unit_id AND is_legal_entity
    ) THEN
        RAISE EXCEPTION 'Đối tác nội bộ phải trỏ tới một công ty (pháp nhân)' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER partner_check BEFORE INSERT OR UPDATE OF internal_unit_id ON mdm.partner
FOR EACH ROW EXECUTE FUNCTION mdm.partner_check();
CREATE TRIGGER partner_touch BEFORE UPDATE ON mdm.partner
FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();

-- Vật tư, hàng hóa, dịch vụ. category_code khớp wf.approval_rule.category_code và
-- danh mục ITEM_CATEGORY trong core.catalog_item.
CREATE TABLE mdm.item (
    tenant_id      uuid NOT NULL REFERENCES core.tenant,
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code           text NOT NULL,
    name           text NOT NULL,
    uom            text NOT NULL,
    category_code  text,
    ref_price      numeric(18, 2) CHECK (ref_price >= 0),
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code)
);
CREATE INDEX ON mdm.item (tenant_id, category_code);

CREATE TRIGGER item_touch BEFORE UPDATE ON mdm.item
FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Số chứng từ: <tiền tố>-<năm>-<6 chữ số>, theo tenant, loại, năm (giờ Việt Nam).
-- Bộ đếm là một dòng khóa theo giao dịch nên không nhảy số khi rollback.
-- ---------------------------------------------------------------------------

CREATE TABLE core.doc_sequence (
    tenant_id  uuid NOT NULL REFERENCES core.tenant,
    prefix     text NOT NULL,
    year       int NOT NULL,
    last_no    int NOT NULL,
    PRIMARY KEY (tenant_id, prefix, year)
);

CREATE FUNCTION core.next_doc_no(p_tenant uuid, p_prefix text, p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    v_year int := extract(year FROM p_at AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_no   int;
BEGIN
    INSERT INTO core.doc_sequence AS s (tenant_id, prefix, year, last_no)
    VALUES (p_tenant, p_prefix, v_year, 1)
    ON CONFLICT (tenant_id, prefix, year) DO UPDATE SET last_no = s.last_no + 1
    RETURNING last_no INTO v_no;
    RETURN format('%s-%s-%s', p_prefix, v_year, lpad(v_no::text, 6, '0'));
END $$;

-- ---------------------------------------------------------------------------
-- Đề nghị mua sắm: số chứng từ, mô tả, ngày cần, nhà cung cấp đề xuất
-- ---------------------------------------------------------------------------

ALTER TABLE proc.purchase_request
    ADD COLUMN doc_no      text,
    ADD COLUMN description text,
    ADD COLUMN needed_by   date,
    ADD COLUMN partner_id  uuid,
    ADD FOREIGN KEY (tenant_id, partner_id) REFERENCES mdm.partner (tenant_id, id);
CREATE INDEX ON proc.purchase_request (tenant_id, partner_id);

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id, tenant_id, created_at FROM proc.purchase_request ORDER BY created_at, id LOOP
        UPDATE proc.purchase_request SET doc_no = core.next_doc_no(r.tenant_id, 'PR', r.created_at) WHERE id = r.id;
    END LOOP;
END $$;

-- Lập bằng dòng hàng thì không cần nhập tổng tiền.
ALTER TABLE proc.purchase_request
    ALTER COLUMN doc_no SET NOT NULL,
    ALTER COLUMN total_amount SET DEFAULT 0,
    ADD UNIQUE (tenant_id, doc_no);

CREATE FUNCTION proc.purchase_request_doc_no() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.doc_no := coalesce(NEW.doc_no, core.next_doc_no(NEW.tenant_id, 'PR', NEW.created_at));
    RETURN NEW;
END $$;

CREATE TRIGGER purchase_request_doc_no BEFORE INSERT ON proc.purchase_request
FOR EACH ROW EXECUTE FUNCTION proc.purchase_request_doc_no();

-- Đề nghị có dòng hàng thì tổng tiền luôn bằng tổng các dòng (sửa tay bị ghi đè).
CREATE FUNCTION proc.purchase_request_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_total numeric;
BEGIN
    SELECT sum(amount) INTO v_total FROM proc.purchase_request_item WHERE request_id = NEW.id;
    IF v_total IS NOT NULL THEN
        NEW.total_amount := v_total;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Dòng hàng: chỉ sửa được khi đề nghị còn nháp hoặc bị trả về
-- ---------------------------------------------------------------------------

CREATE TABLE proc.purchase_request_item (
    tenant_id    uuid NOT NULL REFERENCES core.tenant,
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   uuid NOT NULL,
    line_no      int NOT NULL CHECK (line_no > 0),
    item_id      uuid,
    description  text NOT NULL,
    uom          text NOT NULL,
    quantity     numeric(18, 3) NOT NULL CHECK (quantity > 0),
    unit_price   numeric(18, 2) NOT NULL CHECK (unit_price >= 0),
    amount       numeric(18, 2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    note         text,
    UNIQUE (tenant_id, id),
    UNIQUE (request_id, line_no),
    FOREIGN KEY (tenant_id, request_id) REFERENCES proc.purchase_request (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, item_id) REFERENCES mdm.item (tenant_id, id)
);
CREATE INDEX ON proc.purchase_request_item (tenant_id, request_id);
CREATE INDEX ON proc.purchase_request_item (tenant_id, item_id);

-- Điền tenant, số dòng, mô tả và đơn vị tính (lấy từ vật tư); chặn sửa sau khi gửi duyệt.
CREATE FUNCTION proc.purchase_request_item_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_item   mdm.item;
BEGIN
    SELECT status INTO v_status FROM proc.purchase_request
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.request_id ELSE NEW.request_id END;
    -- Không thấy đề nghị: đang bị xóa cùng câu lệnh (ON DELETE CASCADE).
    IF v_status IS NOT NULL AND v_status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị đang ở trạng thái % nên không sửa được dòng hàng', v_status
            USING ERRCODE = 'data_exception';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.request_id <> OLD.request_id THEN
        RAISE EXCEPTION 'Không chuyển dòng hàng sang đề nghị khác' USING ERRCODE = 'data_exception';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT tenant_id INTO NEW.tenant_id FROM proc.purchase_request WHERE id = NEW.request_id;
        IF NEW.line_no IS NULL THEN
            SELECT coalesce(max(line_no), 0) + 1 INTO NEW.line_no
            FROM proc.purchase_request_item WHERE request_id = NEW.request_id;
        END IF;
    END IF;
    IF NEW.item_id IS NOT NULL THEN
        SELECT * INTO v_item FROM mdm.item WHERE id = NEW.item_id;
        NEW.description := coalesce(NEW.description, v_item.name);
        NEW.uom := coalesce(NEW.uom, v_item.uom);
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER purchase_request_item_before_write BEFORE INSERT OR UPDATE OR DELETE ON proc.purchase_request_item
FOR EACH ROW EXECUTE FUNCTION proc.purchase_request_item_before_write();

-- Tính lại tổng tiền đầu phiếu (trigger BEFORE UPDATE của đề nghị cộng các dòng).
-- Trigger có bảng chuyển tiếp chỉ gắn được một sự kiện nên tách ba trigger.
CREATE FUNCTION proc.purchase_request_item_recalc() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE proc.purchase_request SET total_amount = 0 WHERE id IN (SELECT request_id FROM new_rows);
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE proc.purchase_request SET total_amount = 0 WHERE id IN (SELECT request_id FROM old_rows);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER purchase_request_item_recalc_insert AFTER INSERT ON proc.purchase_request_item
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION proc.purchase_request_item_recalc();
CREATE TRIGGER purchase_request_item_recalc_update AFTER UPDATE ON proc.purchase_request_item
REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION proc.purchase_request_item_recalc();
CREATE TRIGGER purchase_request_item_recalc_delete AFTER DELETE ON proc.purchase_request_item
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION proc.purchase_request_item_recalc();

-- Đề nghị không còn dòng hàng nào thì giữ tổng tiền 0 (sum trả về NULL).
CREATE TRIGGER purchase_request_before_update BEFORE UPDATE ON proc.purchase_request
FOR EACH ROW EXECUTE FUNCTION proc.purchase_request_before_update();

-- ---------------------------------------------------------------------------
-- Hủy chứng từ: ghi người hủy; lịch sử ghi trước khi đổi trạng thái để trigger
-- (thông báo) đọc được người hủy.
-- ---------------------------------------------------------------------------

DROP FUNCTION wf.cancel_entity(text, uuid, text, timestamptz);

CREATE FUNCTION wf.cancel_entity(p_type text, p_id uuid, p_reason text, p_at timestamptz DEFAULT now(),
                                 p_actor uuid DEFAULT NULL)
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
    INSERT INTO wf.approval_history (tenant_id, entity_type, entity_id, event, person_id, detail, created_at)
    VALUES (v_req.tenant_id, p_type, p_id, 'CANCELLED', p_actor, jsonb_build_object('reason', p_reason), p_at);
    PERFORM wf.set_entity_status(p_type, p_id, 'CANCELLED');
END $$;

-- Người lập hủy đề nghị chưa duyệt xong (nháp, chờ duyệt, bị trả về).
CREATE FUNCTION proc.cancel_purchase_request(p_id uuid, p_actor uuid, p_reason text, p_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_pr proc.purchase_request;
BEGIN
    SELECT * INTO v_pr FROM proc.purchase_request WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy đề nghị mua sắm %', p_id;
    END IF;
    IF p_actor <> v_pr.requester_id THEN
        RAISE EXCEPTION 'Chỉ người lập được hủy đề nghị';
    END IF;
    IF v_pr.status NOT IN ('DRAFT', 'PENDING', 'RETURNED') THEN
        RAISE EXCEPTION 'Đề nghị ở trạng thái % không hủy được', v_pr.status;
    END IF;
    IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Hủy đề nghị phải ghi lý do';
    END IF;
    PERFORM wf.cancel_entity('proc.purchase_request', p_id, p_reason, p_at, p_actor);
END $$;
