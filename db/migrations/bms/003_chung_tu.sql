-- 003: Chứng từ tối thiểu cho luồng duyệt: đề nghị mua sắm và đơn hàng nội bộ.

CREATE SCHEMA IF NOT EXISTS proc;
CREATE SCHEMA IF NOT EXISTS ic;

-- Đơn hàng nội bộ giữa hai công ty trong cùng tenant.
CREATE TABLE ic.ic_order (
    tenant_id       uuid NOT NULL REFERENCES core.tenant,
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_unit_id  uuid NOT NULL,
    buyer_unit_id   uuid NOT NULL,
    created_by      uuid NOT NULL,
    total_amount    numeric(18, 2) NOT NULL CHECK (total_amount >= 0),
    status          text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'CONFIRMED', 'SETTLED', 'CANCELLED')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, seller_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, buyer_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id),
    CHECK (seller_unit_id <> buyer_unit_id)
);
CREATE INDEX ON ic.ic_order (tenant_id, seller_unit_id);
CREATE INDEX ON ic.ic_order (tenant_id, buyer_unit_id);
CREATE INDEX ON ic.ic_order (tenant_id, created_by);

-- Đề nghị mua sắm. Lập dưới một tư cách lập (vị trí của người lập); chứng từ
-- thuộc đơn vị của vị trí đó.
CREATE TABLE proc.purchase_request (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title                  text NOT NULL,
    requester_id           uuid NOT NULL,
    requester_position_id  uuid NOT NULL,
    org_unit_id            uuid NOT NULL,
    category_code          text,
    total_amount           numeric(18, 2) NOT NULL CHECK (total_amount >= 0),
    status                 text NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approval_round         int NOT NULL DEFAULT 0,
    ic_order_id            uuid,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, requester_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, ic_order_id) REFERENCES ic.ic_order (tenant_id, id)
);
CREATE INDEX ON proc.purchase_request (tenant_id, requester_id);
CREATE INDEX ON proc.purchase_request (tenant_id, requester_position_id);
CREATE INDEX ON proc.purchase_request (tenant_id, org_unit_id);
CREATE INDEX ON proc.purchase_request (tenant_id, ic_order_id);

-- Người lập phải đang giữ vị trí dùng làm tư cách lập; đơn vị lấy từ vị trí.
CREATE FUNCTION proc.purchase_request_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM core.position_holder(NEW.requester_position_id) h
        WHERE h.person_id = NEW.requester_id
    ) THEN
        RAISE EXCEPTION 'Người lập không giữ vị trí dùng làm tư cách lập';
    END IF;
    SELECT org_unit_id INTO NEW.org_unit_id FROM core.position WHERE id = NEW.requester_position_id;
    RETURN NEW;
END $$;

CREATE TRIGGER purchase_request_before_insert BEFORE INSERT ON proc.purchase_request
FOR EACH ROW EXECUTE FUNCTION proc.purchase_request_before_insert();
