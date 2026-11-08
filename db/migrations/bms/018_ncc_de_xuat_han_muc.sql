ALTER TABLE proc.purchase_request
    ADD COLUMN proposed_partner_name text
        CHECK (proposed_partner_name IS NULL OR length(btrim(proposed_partner_name)) BETWEEN 2 AND 200),
    ADD COLUMN proposed_partner_tax_code text
        CHECK (proposed_partner_tax_code IS NULL OR proposed_partner_tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'),
    ADD CONSTRAINT purchase_request_one_partner CHECK (partner_id IS NULL OR proposed_partner_name IS NULL),
    ADD CONSTRAINT purchase_request_tax_needs_name
        CHECK (proposed_partner_tax_code IS NULL OR proposed_partner_name IS NOT NULL);

CREATE INDEX purchase_request_proposed_partner ON proc.purchase_request (tenant_id)
    WHERE proposed_partner_name IS NOT NULL;

CREATE FUNCTION mdm.adopt_proposed_partner(p_request uuid, p_person uuid, p_code text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    r        proc.purchase_request;
    v_root   uuid;
    v_id     uuid;
BEGIN
    SELECT * INTO r FROM proc.purchase_request WHERE id = p_request;
    IF r.id IS NULL OR r.proposed_partner_name IS NULL THEN
        RAISE EXCEPTION 'Đề nghị không có nhà cung cấp đề xuất' USING ERRCODE = 'data_exception';
    END IF;
    SELECT id INTO v_root FROM core.org_unit
    WHERE tenant_id = r.tenant_id AND parent_id IS NULL AND valid_period @> now()
    ORDER BY created_at LIMIT 1;
    IF NOT core.has_permission(p_person, 'mdm.manage', v_root) THEN
        RAISE EXCEPTION 'Cần quyền mdm.manage để thêm nhà cung cấp vào danh mục' USING ERRCODE = 'data_exception';
    END IF;

    IF r.proposed_partner_tax_code IS NOT NULL THEN
        SELECT id INTO v_id FROM mdm.partner WHERE tenant_id = r.tenant_id AND tax_code = r.proposed_partner_tax_code
        ORDER BY created_at LIMIT 1;
    END IF;
    IF v_id IS NULL THEN
        IF coalesce(btrim(p_code), '') = '' THEN
            RAISE EXCEPTION 'Nhập mã nhà cung cấp' USING ERRCODE = 'data_exception';
        END IF;
        INSERT INTO mdm.partner (tenant_id, code, name, tax_code)
        VALUES (r.tenant_id, btrim(p_code), btrim(r.proposed_partner_name), r.proposed_partner_tax_code)
        RETURNING id INTO v_id;
    END IF;

    UPDATE proc.purchase_request x
    SET partner_id = v_id, proposed_partner_name = NULL, proposed_partner_tax_code = NULL
    WHERE x.tenant_id = r.tenant_id AND x.proposed_partner_name IS NOT NULL
      AND (x.id = r.id
           OR (r.proposed_partner_tax_code IS NOT NULL AND x.proposed_partner_tax_code = r.proposed_partner_tax_code)
           OR (r.proposed_partner_tax_code IS NULL AND x.proposed_partner_tax_code IS NULL
               AND lower(btrim(x.proposed_partner_name)) = lower(btrim(r.proposed_partner_name))));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION search.purchase_request_doc(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'tenant_id', r.tenant_id,
        'entity_type', 'proc.purchase_request',
        'entity_id', r.id,
        'doc_no', r.doc_no,
        'title', r.title,
        'description', r.description,
        'status', r.status,
        'requester', p.full_name,
        'org_unit', u.name,
        'partner', coalesce(pa.name, r.proposed_partner_name),
        'items', coalesce((SELECT jsonb_agg(i.description ORDER BY i.line_no)
                           FROM proc.purchase_request_item i WHERE i.request_id = r.id), '[]'::jsonb),
        'total_amount', r.total_amount,
        'created_at', extract(epoch FROM r.created_at)::bigint)
    FROM proc.purchase_request r
    JOIN core.person p ON p.id = r.requester_id
    JOIN core.org_unit u ON u.id = r.org_unit_id
    LEFT JOIN mdm.partner pa ON pa.id = r.partner_id
    WHERE r.id = p_id
$$;

ALTER TABLE core.tenant
    ADD COLUMN storage_quota_bytes bigint NOT NULL DEFAULT 10737418240 CHECK (storage_quota_bytes > 0);

CREATE FUNCTION core.storage_used(p_tenant uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(size_bytes), 0)::bigint FROM core.attachment
    WHERE tenant_id = p_tenant AND deleted_at IS NULL
      AND (status = 'CLEAN' OR (status = 'PENDING' AND created_at > now() - interval '1 hour'))
$$;
