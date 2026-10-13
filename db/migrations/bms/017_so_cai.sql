-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 017: Sổ cái đối soát toàn vẹn tài liệu (ADR #46).
--
-- "Bản niêm phong" của một tệp đính kèm là dòng nhật ký kiểm toán ghi lúc tệp được nhận (trạng thái CLEAN, kèm
-- SHA-256 tính trên đúng nội dung đã quét): dòng đó nằm trong chuỗi hash của tenant (ADR #18, #33) nên không sửa
-- được mà không lộ. Đối soát = đọc lại tệp trong kho, tính lại SHA-256 và so với bản niêm phong.
-- Lịch sử đối soát và nhật ký phòng đọc chỉ ghi thêm, qua hàm của dịch vụ actions; schema `audit` nằm ngoài CDC.

-- ---------------------------------------------------------------------------
-- Lịch sử đối soát và nhật ký phòng đọc
-- ---------------------------------------------------------------------------

CREATE TABLE audit.ledger_check (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attachment_id    uuid,
    via              text NOT NULL CHECK (via IN ('code', 'file')),
    query            text NOT NULL,
    result           text NOT NULL CHECK (result IN ('match', 'mismatch', 'not_found')),
    expected_sha256  text,
    actual_sha256    text,
    checked_by       uuid NOT NULL,
    checked_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit.ledger_check (tenant_id, checked_at DESC);
CREATE INDEX ON audit.ledger_check (attachment_id, checked_at DESC);

CREATE TABLE audit.archive_access (
    tenant_id      uuid NOT NULL REFERENCES core.tenant,
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attachment_id  uuid NOT NULL,
    person_id      uuid NOT NULL,
    opened_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit.archive_access (tenant_id, opened_at DESC);

-- Chỉ ghi thêm (như audit.log).
CREATE FUNCTION audit.append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Bảng % chỉ cho ghi thêm', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END $$;

CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.ledger_check
FOR EACH ROW EXECUTE FUNCTION audit.append_only();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON audit.archive_access
FOR EACH ROW EXECUTE FUNCTION audit.append_only();

-- ---------------------------------------------------------------------------
-- Hàm ghi (ứng dụng chỉ có quyền đọc schema audit, ADR #35)
-- ---------------------------------------------------------------------------

CREATE FUNCTION audit.add_ledger_check(p_tenant uuid, p_attachment uuid, p_via text, p_query text, p_result text,
                                       p_expected text, p_actual text, p_person uuid)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    INSERT INTO audit.ledger_check (tenant_id, attachment_id, via, query, result, expected_sha256, actual_sha256,
                                    checked_by)
    VALUES (p_tenant, p_attachment, p_via, left(p_query, 300), p_result, p_expected, p_actual, p_person)
    RETURNING id
$$;

CREATE FUNCTION audit.add_archive_access(p_tenant uuid, p_attachment uuid, p_person uuid)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    INSERT INTO audit.archive_access (tenant_id, attachment_id, person_id)
    VALUES (p_tenant, p_attachment, p_person)
    RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION audit.add_ledger_check(uuid, uuid, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.add_archive_access(uuid, uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Bản niêm phong của tệp và kiểm tra một mắt xích của chuỗi hash
-- ---------------------------------------------------------------------------

-- Dòng nhật ký ghi lúc tệp được nhận (lần đầu chuyển sang CLEAN). NULL nếu tệp chưa từng sạch.
CREATE FUNCTION audit.attachment_seal(p_attachment uuid) RETURNS audit.log
LANGUAGE sql STABLE AS $$
    SELECT l.* FROM audit.log l
    JOIN core.attachment a ON a.id = p_attachment AND a.tenant_id = l.tenant_id
    WHERE l.table_name = 'core.attachment' AND l.row_id = p_attachment::text
      AND l.new_data ->> 'status' = 'CLEAN' AND (l.old_data ->> 'status') IS DISTINCT FROM 'CLEAN'
    ORDER BY l.seq
    LIMIT 1
$$;

-- Một dòng nhật ký còn nguyên và còn nằm trong chuỗi: hash tính lại khớp, dòng kế tiếp trỏ về đúng hash này
-- (hoặc đây là đầu chuỗi). Kiểm tra cả chuỗi: audit.verify_chain.
CREATE FUNCTION audit.entry_intact(p_log bigint) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT audit.compute_hash(l) = l.hash
       AND coalesce((SELECT n.prev_hash = l.hash FROM audit.log n
                     WHERE n.tenant_id = l.tenant_id AND n.seq = l.seq + 1),
                    (SELECT h.seq = l.seq AND h.hash = l.hash FROM audit.chain_head h WHERE h.tenant_id = l.tenant_id),
                    false)
    FROM audit.log l WHERE l.id = p_log
$$;
