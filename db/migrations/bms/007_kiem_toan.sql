-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 007: Nhật ký kiểm toán nối chuỗi hash, chỉ ghi thêm (ADR #18; thiết kế CSDL mục 4.7).
--
-- Mỗi tenant một chuỗi: dòng thứ n có hash = sha256(hash dòng n-1 || nội dung dòng n).
-- audit.chain_head giữ đầu chuỗi và khóa theo giao dịch, nên các giao dịch ghi
-- cùng tenant xếp hàng ở bước ghi nhật ký (đổi lại chuỗi không bao giờ rẽ nhánh).
-- Đối soát bằng audit.verify_chain(tenant); cột sealed_at dành cho bước đẩy sang immudb.

CREATE SCHEMA IF NOT EXISTS audit;

INSERT INTO core.permission (code, description) VALUES
    ('audit.read', 'Xem và đối soát nhật ký kiểm toán của tenant');

CREATE TABLE audit.chain_head (
    tenant_id  uuid PRIMARY KEY REFERENCES core.tenant,
    seq        bigint NOT NULL,
    hash       bytea NOT NULL
);

-- actor_id không có khóa ngoại: nhật ký phải còn nguyên khi dữ liệu gốc bị xóa.
CREATE TABLE audit.log (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seq           bigint NOT NULL,
    table_name    text NOT NULL,
    row_id        text NOT NULL,
    op            text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_id      uuid,
    actor_role    text NOT NULL,
    old_data      jsonb,
    new_data      jsonb,
    changed_cols  text[],
    created_at    timestamptz NOT NULL,
    prev_hash     bytea,
    hash          bytea NOT NULL,
    sealed_at     timestamptz,
    UNIQUE (tenant_id, seq)
);
CREATE INDEX ON audit.log (tenant_id, table_name, row_id);
CREATE INDEX ON audit.log (tenant_id, actor_id);
CREATE INDEX ON audit.log (tenant_id, created_at DESC);

-- Nội dung được băm: mọi cột trừ hash và sealed_at, dạng jsonb (thứ tự khóa cố định).
CREATE FUNCTION audit.compute_hash(l audit.log) RETURNS bytea
LANGUAGE sql IMMUTABLE AS $$
    SELECT sha256(coalesce(l.prev_hash, '\x'::bytea) || convert_to(jsonb_build_array(
        l.tenant_id, l.seq, l.table_name, l.row_id, l.op, l.actor_id, l.actor_role,
        l.old_data, l.new_data, l.changed_cols,
        (extract(epoch FROM l.created_at) * 1000000)::bigint
    )::text, 'UTF8'))
$$;

-- Trigger gắn vào bảng nghiệp vụ. Tham số: các cột khóa chính (mặc định 'id').
-- Người thực hiện lấy từ phiên Hasura (hasura.user, dịch vụ actions cũng đặt biến
-- này); không có phiên thì ghi tên role PostgreSQL.
CREATE FUNCTION audit.log_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_old      jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    v_new      jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    v_row      jsonb := coalesce(v_new, v_old);
    v_session  json := core.mutation_session();
    v_changed  text[];
    v_head     audit.chain_head;
    v_log      audit.log;
    v_pk       text[] := CASE WHEN TG_NARGS = 0 THEN ARRAY['id'] ELSE TG_ARGV END;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(k ORDER BY k) INTO v_changed
        FROM jsonb_object_keys(v_new) k
        WHERE v_new -> k IS DISTINCT FROM v_old -> k;
        IF v_changed IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    v_log.tenant_id := (v_row ->> 'tenant_id')::uuid;
    v_log.table_name := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    v_log.row_id := (SELECT string_agg(v_row ->> c, ':') FROM unnest(v_pk) c);
    v_log.op := TG_OP;
    v_log.actor_id := core.session_person(v_session);
    v_log.actor_role := coalesce(v_session ->> 'x-hasura-role', session_user::text);
    v_log.old_data := v_old;
    v_log.new_data := v_new;
    v_log.changed_cols := v_changed;
    v_log.created_at := clock_timestamp();

    INSERT INTO audit.chain_head (tenant_id, seq, hash) VALUES (v_log.tenant_id, 0, '\x')
    ON CONFLICT (tenant_id) DO NOTHING;
    SELECT * INTO v_head FROM audit.chain_head WHERE tenant_id = v_log.tenant_id FOR UPDATE;
    v_log.seq := v_head.seq + 1;
    v_log.prev_hash := CASE WHEN v_head.seq = 0 THEN NULL ELSE v_head.hash END;
    v_log.hash := audit.compute_hash(v_log);

    INSERT INTO audit.log (tenant_id, seq, table_name, row_id, op, actor_id, actor_role, old_data, new_data,
                           changed_cols, created_at, prev_hash, hash)
    VALUES (v_log.tenant_id, v_log.seq, v_log.table_name, v_log.row_id, v_log.op, v_log.actor_id, v_log.actor_role,
            v_log.old_data, v_log.new_data, v_log.changed_cols, v_log.created_at, v_log.prev_hash, v_log.hash);
    UPDATE audit.chain_head SET seq = v_log.seq, hash = v_log.hash WHERE tenant_id = v_log.tenant_id;
    RETURN NULL;
END $$;

-- Bật nhật ký cho một bảng có cột tenant_id.
CREATE PROCEDURE audit.enable(p_table regclass, VARIADIC p_pk text[] DEFAULT ARRAY['id'])
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('CREATE TRIGGER audit_log AFTER INSERT OR UPDATE OR DELETE ON %s
                    FOR EACH ROW EXECUTE FUNCTION audit.log_change(%s)',
                   p_table, (SELECT string_agg(quote_literal(c), ', ') FROM unnest(p_pk) c));
END $$;

-- Chỉ ghi thêm: không sửa, không xóa; riêng sealed_at được đặt một lần.
CREATE FUNCTION audit.log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.sealed_at IS NULL AND NEW.sealed_at IS NOT NULL
       AND (to_jsonb(OLD) - 'sealed_at') = (to_jsonb(NEW) - 'sealed_at') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Nhật ký kiểm toán chỉ cho ghi thêm (ADR #18)';
END $$;

CREATE TRIGGER log_append_only BEFORE UPDATE OR DELETE ON audit.log
FOR EACH ROW EXECUTE FUNCTION audit.log_append_only();
CREATE TRIGGER log_no_truncate BEFORE TRUNCATE ON audit.log
FOR EACH STATEMENT EXECUTE FUNCTION audit.log_append_only();

-- Đối soát chuỗi của một tenant. Trả về các dòng có vấn đề (rỗng: chuỗi nguyên vẹn):
--   MISSING        thiếu dòng trước dòng này (seq không liên tục)
--   PREV_MISMATCH  prev_hash không khớp hash dòng trước
--   HASH_MISMATCH  nội dung dòng đã bị sửa
--   HEAD_MISMATCH  dòng cuối không khớp đầu chuỗi (mất dòng ở cuối)
CREATE FUNCTION audit.verify_chain(p_tenant uuid)
RETURNS TABLE (seq bigint, log_id bigint, problem text)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
    l         audit.log;
    v_prev    bytea;
    v_expect  bigint := 1;
    v_head    audit.chain_head;
BEGIN
    FOR l IN SELECT * FROM audit.log WHERE tenant_id = p_tenant ORDER BY audit.log.seq LOOP
        IF l.seq <> v_expect THEN
            seq := l.seq; log_id := l.id; problem := 'MISSING'; RETURN NEXT;
        END IF;
        IF l.prev_hash IS DISTINCT FROM v_prev THEN
            seq := l.seq; log_id := l.id; problem := 'PREV_MISMATCH'; RETURN NEXT;
        END IF;
        IF audit.compute_hash(l) <> l.hash THEN
            seq := l.seq; log_id := l.id; problem := 'HASH_MISMATCH'; RETURN NEXT;
        END IF;
        v_prev := l.hash;
        v_expect := l.seq + 1;
    END LOOP;

    SELECT * INTO v_head FROM audit.chain_head h WHERE h.tenant_id = p_tenant;
    IF coalesce(v_head.seq, 0) <> v_expect - 1 OR (v_head.seq > 0 AND v_head.hash IS DISTINCT FROM v_prev) THEN
        seq := v_head.seq; log_id := NULL; problem := 'HEAD_MISMATCH'; RETURN NEXT;
    END IF;
END $$;

-- Người được xem nhật ký của tenant (quyền audit.read, không xét phạm vi đơn vị).
-- Hasura dùng làm điều kiện xem audit.log qua quan hệ theo tenant_id.
CREATE VIEW audit.v_reader AS
SELECT DISTINCT tenant_id, person_id
FROM core.v_permission_grant
WHERE permission_code = 'audit.read' AND valid_period @> now();

-- ---------------------------------------------------------------------------
-- Bảng được ghi nhật ký
-- ---------------------------------------------------------------------------

CALL audit.enable('core.org_unit');
CALL audit.enable('core.position');
CALL audit.enable('core.person');
CALL audit.enable('core.assignment');
CALL audit.enable('core.role');
CALL audit.enable('core.role_permission', 'role_id', 'permission_code');
CALL audit.enable('core.role_grant');
CALL audit.enable('core.team');
CALL audit.enable('core.team_member', 'team_id', 'person_id');
CALL audit.enable('core.delegation');
CALL audit.enable('wf.approval_rule');
CALL audit.enable('proc.purchase_request');
CALL audit.enable('proc.purchase_request_item');
CALL audit.enable('ic.ic_order');
CALL audit.enable('mdm.partner');
CALL audit.enable('mdm.item');
