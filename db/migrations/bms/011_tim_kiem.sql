-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Tìm kiếm toàn văn (ADR #36): CSDL đánh dấu chứng từ và tệp cần đưa vào chỉ mục; dịch vụ
-- search-sync nghe kênh `search_sync`, đọc trạng thái hiện tại rồi ghi hoặc xóa tài liệu trong
-- Meilisearch. Đối chiếu theo trạng thái nên chạy lại bao nhiêu lần cũng cho cùng kết quả.
-- Schema `search` không mở qua Hasura.

CREATE SCHEMA search;

CREATE TABLE search.pending (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    entity_type      text NOT NULL CHECK (entity_type IN ('proc.purchase_request', 'core.attachment')),
    entity_id        uuid NOT NULL,
    dirty            boolean NOT NULL DEFAULT true,
    attempts         int NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    last_error       text,
    indexed_at       timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX pending_dirty ON search.pending (next_attempt_at) WHERE dirty;

CREATE FUNCTION search.mark(p_tenant uuid, p_type text, p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO search.pending (tenant_id, entity_type, entity_id)
    VALUES (p_tenant, p_type, p_id)
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET dirty = true, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp();
    PERFORM pg_notify('search_sync', p_type || ':' || p_id);
END $$;

-- Đánh dấu toàn bộ (chỉ mục mới tạo hoặc dựng lại).
CREATE FUNCTION search.mark_all() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    n int;
BEGIN
    INSERT INTO search.pending (tenant_id, entity_type, entity_id)
    SELECT tenant_id, 'proc.purchase_request', id FROM proc.purchase_request
    UNION ALL
    SELECT tenant_id, 'core.attachment', id FROM core.attachment WHERE status = 'CLEAN' AND deleted_at IS NULL
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET dirty = true, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp();
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_notify('search_sync', 'all');
    RETURN n;
END $$;

CREATE FUNCTION search.purchase_request_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM search.mark(OLD.tenant_id, 'proc.purchase_request', OLD.id);
    ELSE
        PERFORM search.mark(NEW.tenant_id, 'proc.purchase_request', NEW.id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER search_mark AFTER INSERT OR UPDATE OR DELETE ON proc.purchase_request
FOR EACH ROW EXECUTE FUNCTION search.purchase_request_changed();

-- Dòng hàng: tên vật tư nằm trong tài liệu của đề nghị.
CREATE FUNCTION search.purchase_request_item_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM search.mark(OLD.tenant_id, 'proc.purchase_request', OLD.request_id);
    ELSE
        PERFORM search.mark(NEW.tenant_id, 'proc.purchase_request', NEW.request_id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER search_mark AFTER INSERT OR UPDATE OR DELETE ON proc.purchase_request_item
FOR EACH ROW EXECUTE FUNCTION search.purchase_request_item_changed();

-- Tệp: vào chỉ mục khi sạch, ra khỏi chỉ mục khi bị xóa.
CREATE FUNCTION search.attachment_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'CLEAN' OR OLD.status = 'CLEAN' THEN
        PERFORM search.mark(NEW.tenant_id, 'core.attachment', NEW.id);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER search_mark AFTER UPDATE OF status, deleted_at ON core.attachment
FOR EACH ROW EXECUTE FUNCTION search.attachment_changed();

-- Đổi tên nhà cung cấp, người lập, đơn vị: tài liệu của các đề nghị liên quan có tên cũ.
CREATE FUNCTION search.name_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    r record;
BEGIN
    FOR r IN EXECUTE format(
        'SELECT tenant_id, id FROM proc.purchase_request WHERE tenant_id = $1 AND %I = $2', TG_ARGV[0])
        USING NEW.tenant_id, NEW.id
    LOOP
        PERFORM search.mark(r.tenant_id, 'proc.purchase_request', r.id);
    END LOOP;
    RETURN NULL;
END $$;

CREATE TRIGGER search_mark AFTER UPDATE OF name ON mdm.partner
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION search.name_changed('partner_id');
CREATE TRIGGER search_mark AFTER UPDATE OF full_name ON core.person
FOR EACH ROW WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name) EXECUTE FUNCTION search.name_changed('requester_id');
CREATE TRIGGER search_mark AFTER UPDATE OF name ON core.org_unit
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION search.name_changed('org_unit_id');

-- Nội dung một đề nghị để đưa vào chỉ mục (NULL: không còn đề nghị, xóa khỏi chỉ mục).
CREATE FUNCTION search.purchase_request_doc(p_id uuid) RETURNS jsonb
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
        'partner', pa.name,
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

-- Chứng từ và đề nghị đang có lúc nâng cấp từ bản trước.
SELECT search.mark_all();
