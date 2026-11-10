SELECT test.fixture();

CREATE FUNCTION pg_temp.dirty(p_type text, p_key text) RETURNS boolean
LANGUAGE sql AS $$
    SELECT coalesce((SELECT dirty FROM search.pending WHERE entity_type = p_type AND entity_id = test.id(p_key)), false)
$$;
CREATE FUNCTION pg_temp.clear() RETURNS void
LANGUAGE sql AS $$ UPDATE search.pending SET dirty = false, attempts = 3 $$;

SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 0, false);
SELECT test.ok(pg_temp.dirty('proc.purchase_request', 'pr'), 'Tạo đề nghị thì đánh dấu');

SELECT pg_temp.clear();
INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
VALUES (test.id('pr'), 'Tụ điện gốm 100nF', 'cái', 1000, 300);
SELECT test.ok(pg_temp.dirty('proc.purchase_request', 'pr'), 'Thêm dòng hàng thì đánh dấu đề nghị');
SELECT test.ok((SELECT attempts = 0 FROM search.pending WHERE entity_id = test.id('pr')),
               'Đánh dấu lại thì đếm lại số lần thử');

SELECT test.ok((SELECT search.purchase_request_doc(test.id('pr')) @> jsonb_build_object(
                    'title', 'pr', 'status', 'DRAFT', 'items', jsonb_build_array('Tụ điện gốm 100nF'),
                    'tenant_id', test.id('TDX')))
                AND (SELECT search.purchase_request_doc(test.id('pr')) ->> 'requester') IS NOT NULL,
               'Tài liệu đề nghị có tiêu đề, trạng thái, dòng hàng, người lập');

SELECT pg_temp.clear();
UPDATE core.person SET full_name = full_name || ' (mới)' WHERE id = test.id('c');
SELECT test.ok(pg_temp.dirty('proc.purchase_request', 'pr'), 'Đổi tên người lập thì đánh dấu đề nghị');

INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), 'bao-gia.pdf', 'application/pdf', 10, 'k-search', test.id('c'))
RETURNING test.put('f', id);
SELECT test.ok(NOT pg_temp.dirty('core.attachment', 'f'), 'Tệp chờ kiểm tra chưa vào chỉ mục');
UPDATE core.attachment SET status = 'CLEAN', sha256 = 'abc', scan_engines = ARRAY['test'], scanned_at = now() WHERE id = test.id('f');
SELECT test.ok(pg_temp.dirty('core.attachment', 'f'), 'Tệp sạch thì đánh dấu');
SELECT pg_temp.clear();
UPDATE core.attachment SET deleted_at = now() WHERE id = test.id('f');
SELECT test.ok(pg_temp.dirty('core.attachment', 'f'), 'Xóa tệp thì đánh dấu để gỡ khỏi chỉ mục');

SELECT pg_temp.clear();
DELETE FROM proc.purchase_request WHERE id = test.id('pr');
SELECT test.ok(pg_temp.dirty('proc.purchase_request', 'pr'), 'Xóa đề nghị nháp thì đánh dấu');
SELECT test.ok(search.purchase_request_doc(test.id('pr')) IS NULL, 'Đề nghị đã xóa không còn tài liệu');

SELECT test.pr('pr2', 'c', 'P_NV_MH_DT', 1000000);
SELECT pg_temp.clear();
SELECT test.ok(search.mark_all() > 0, 'mark_all trả về số tài liệu đã đánh dấu');
SELECT test.ok(NOT EXISTS (
                   SELECT 1 FROM proc.purchase_request r
                   WHERE NOT EXISTS (SELECT 1 FROM search.pending p WHERE p.entity_id = r.id AND p.dirty)),
               'mark_all đánh dấu mọi đề nghị');

SELECT set_config('test.tenant', test.id('TDX')::text, true);
SET LOCAL ROLE bamboo_actions;
SELECT search.mark(current_setting('test.tenant')::uuid, 'proc.purchase_request', gen_random_uuid());
RESET ROLE;
