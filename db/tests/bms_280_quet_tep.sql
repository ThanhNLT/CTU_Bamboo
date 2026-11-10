-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);

CREATE FUNCTION pg_temp.attach(p_key text) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, uploaded_by)
    VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), 'bao-gia.pdf', 'application/pdf', 1024, p_key, test.id('c'))
    RETURNING id
$$;

SELECT test.put('f1', pg_temp.attach('q1'));
SELECT test.eq((SELECT scan_engines FROM core.attachment WHERE id = test.id('f1')), '{}'::text[], 'tệp mới chưa có công cụ nào quét');

SELECT test.throws($$UPDATE core.attachment SET status = 'CLEAN', sha256 = 'abc' WHERE id = test.id('f1')$$,
                   '%attachment_clean_scanned%', 'Sạch thì phải có công cụ đã quét');
UPDATE core.attachment SET status = 'CLEAN', sha256 = 'abc', scan_engines = ARRAY['Bamboo Scan 1.0'],
       scan_report = '{"verdict": "CLEAN"}', scanned_at = now() WHERE id = test.id('f1');
SELECT test.eq((SELECT status FROM core.attachment WHERE id = test.id('f1')), 'CLEAN', 'quét xong thì sạch');

SELECT test.throws($$UPDATE core.attachment SET sha256 = 'khac' WHERE id = test.id('f1')$$, '%Không đổi mã băm%', 'giữ nguyên mã băm');
SELECT test.throws($$UPDATE core.attachment SET status = 'INFECTED' WHERE id = test.id('f1')$$, '%đã ở trạng thái CLEAN%',
                   'đổi trạng thái thường vẫn bị chặn');
SELECT set_config('bms.rescan', 'on', true);
UPDATE core.attachment SET status = 'INFECTED', scan_result = 'Eicar-Test-Signature FOUND' WHERE id = test.id('f1');
SELECT test.eq((SELECT status FROM core.attachment WHERE id = test.id('f1')), 'INFECTED', 'quét lại phát hiện thì chuyển INFECTED');
SELECT set_config('bms.rescan', 'off', true);

SELECT test.put('f2', pg_temp.attach('q2'));
UPDATE core.attachment SET status = 'CLEAN', sha256 = 'abc', scan_engines = ARRAY['unscanned'] WHERE id = test.id('f2');
SELECT set_config('bms.rescan', 'on', true);
SELECT test.throws($$UPDATE core.attachment SET status = 'PENDING' WHERE id = test.id('f2')$$, '%đã ở trạng thái CLEAN%',
                   'quét lại không đưa tệp về chờ');
SELECT set_config('bms.rescan', 'off', true);

SELECT test.ok(EXISTS (SELECT 1 FROM core.attachment WHERE status = 'CLEAN' AND scan_engines = '{unscanned}'
                       AND id = test.id('f2')), 'tệp đánh dấu unscanned nằm trong hàng chờ quét lại');
