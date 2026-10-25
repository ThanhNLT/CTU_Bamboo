-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);

CREATE FUNCTION pg_temp.attach(p_tenant text, p_key text) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
    VALUES (test.id(p_tenant), 'proc.purchase_request', test.id('pr'), 'bao-gia.pdf', 'application/pdf', 1024, p_key, test.id('c'))
    RETURNING id
$$;

SELECT test.put('f1', pg_temp.attach('TDX', 'k1'));
SELECT test.throws($$SELECT pg_temp.attach('BVX', 'k2')$$, '%Không tìm thấy chứng từ%', 'Tệp phải cùng tenant với chứng từ');
SELECT test.throws($$UPDATE core.attachment SET status = 'CLEAN' WHERE id = test.id('f1')$$,
                   '%violates check%', 'Sạch thì phải có sha256');

UPDATE core.attachment SET status = 'CLEAN', sha256 = 'abc', scan_engines = ARRAY['test'], scanned_at = now() WHERE id = test.id('f1');
SELECT test.throws($$UPDATE core.attachment SET status = 'INFECTED' WHERE id = test.id('f1')$$,
                   '%đã ở trạng thái CLEAN%', 'Không đổi trạng thái sau khi quét');
SELECT test.throws($$UPDATE core.attachment SET entity_id = gen_random_uuid() WHERE id = test.id('f1')$$,
                   '%Không đổi chứng từ%', 'Không chuyển tệp sang chứng từ khác');

SELECT test.ok((SELECT core.attachment_can_read(a, json_build_object('x-hasura-user-id', test.id('tp_mh_dt')))
                FROM core.attachment a WHERE id = test.id('f1')), 'Người duyệt xem được tệp');
SELECT test.ok(NOT (SELECT core.attachment_can_read(a, json_build_object('x-hasura-user-id', test.id('a')))
                    FROM core.attachment a WHERE id = test.id('f1')), 'Người không xem được chứng từ thì không xem được tệp');

UPDATE core.attachment SET deleted_at = now() WHERE id = test.id('f1');
SELECT test.throws($$UPDATE core.attachment SET file_name = 'x.pdf' WHERE id = test.id('f1')$$,
                   '%đã bị xóa%', 'Không sửa tệp đã xóa');
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'core.attachment' AND row_id = test.id('f1')::text),
               'Ghi nhật ký kiểm toán');

SELECT test.put('f3', pg_temp.attach('TDX', 'k3'));
SELECT test.approve('pr', 'tp_mh_dt');
SELECT test.throws($$UPDATE core.attachment SET deleted_at = now() WHERE id = test.id('f3')$$,
                   '%đã có kết quả%', 'Giữ tệp của đề nghị đã duyệt');
