-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);

CREATE FUNCTION pg_temp.attach(p_key text, p_type text) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
    VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), 'tep', p_type, 1024, p_key, test.id('c'))
    RETURNING id
$$;

SELECT test.put('scan', pg_temp.attach('k-scan', 'image/jpeg'));
SELECT test.put('docx', pg_temp.attach('k-docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
SELECT test.ok(NOT EXISTS (SELECT 1 FROM core.attachment_ocr WHERE attachment_id = test.id('scan')),
               'Chưa quét virus thì chưa xếp hàng OCR');

UPDATE core.attachment SET status = 'CLEAN', sha256 = 'a', scanned_at = now() WHERE id IN (test.id('scan'), test.id('docx'));
SELECT test.eq((SELECT status FROM core.attachment_ocr WHERE attachment_id = test.id('scan')), 'PENDING',
               'Ảnh sạch được xếp hàng OCR');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM core.attachment_ocr WHERE attachment_id = test.id('docx')),
               'DOCX không OCR');
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'core.attachment_ocr'
                       AND row_id = test.id('scan')::text AND op = 'INSERT'), 'Ghi kiểm toán khi xếp hàng');

UPDATE search.pending SET dirty = false WHERE entity_id = test.id('scan');
UPDATE core.attachment_ocr SET status = 'RUNNING', pages = '{0}', pages_total = 1 WHERE attachment_id = test.id('scan');
SELECT test.ok(NOT (SELECT dirty FROM search.pending WHERE entity_id = test.id('scan')), 'Đang OCR chưa đánh chỉ mục lại');
UPDATE core.attachment_ocr SET status = 'DONE', pages_done = 1, page_texts = '{"Báo giá máy bơm"}'
WHERE attachment_id = test.id('scan');
SELECT test.ok((SELECT dirty FROM search.pending WHERE entity_id = test.id('scan')), 'OCR xong thì đánh chỉ mục lại tệp');
SELECT test.eq((SELECT count(*)::int FROM audit.log WHERE table_name = 'core.attachment_ocr'
                AND row_id = test.id('scan')::text), 1, 'Các bước của worker không ghi kiểm toán');

UPDATE core.attachment_ocr SET status = 'PENDING' WHERE attachment_id = test.id('scan');
SELECT test.eq((SELECT count(*)::int FROM audit.log WHERE table_name = 'core.attachment_ocr'
                AND row_id = test.id('scan')::text AND op = 'UPDATE'), 1, 'Thử lại được ghi kiểm toán');

SELECT test.throws($$UPDATE core.attachment_ocr SET pages_total = 1, pages_done = 2 WHERE attachment_id = test.id('scan')$$,
                   '%violates check%', 'Số trang đã OCR không vượt tổng số trang');
