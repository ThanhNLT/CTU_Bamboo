-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);

INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key,
                             uploaded_by)
VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), 'bao-gia.pdf', 'application/pdf', 1024, 'k1',
        test.id('c'))
RETURNING test.put('f1', id);

SELECT test.ok((SELECT seq FROM audit.attachment_seal(test.id('f1'))) IS NULL, 'Tệp chưa sạch thì chưa có niêm phong');

UPDATE core.attachment SET status = 'CLEAN', sha256 = repeat('a', 64), scan_engines = ARRAY['test'], scanned_at = now() WHERE id = test.id('f1');
SELECT test.eq((SELECT new_data ->> 'sha256' FROM audit.attachment_seal(test.id('f1'))), repeat('a', 64),
               'Niêm phong ghi SHA-256 lúc nhận tệp');

UPDATE core.attachment SET file_name = 'bao-gia-2.pdf' WHERE id = test.id('f1');
SELECT test.eq((SELECT new_data ->> 'file_name' FROM audit.attachment_seal(test.id('f1'))), 'bao-gia.pdf',
               'Niêm phong là lần nhận tệp, không phải lần sửa sau');

SELECT test.ok(audit.entry_intact((SELECT id FROM audit.attachment_seal(test.id('f1')))),
               'Mắt xích của bản niêm phong còn nguyên trong chuỗi');
SELECT test.ok(audit.entry_intact((SELECT max(id) FROM audit.log WHERE tenant_id = test.id('TDX'))),
               'Dòng cuối chuỗi khớp đầu chuỗi');

ALTER TABLE audit.log DISABLE TRIGGER log_append_only;
UPDATE audit.log SET new_data = jsonb_set(new_data, '{sha256}', to_jsonb(repeat('b', 64)))
WHERE id = (SELECT id FROM audit.attachment_seal(test.id('f1')));
ALTER TABLE audit.log ENABLE TRIGGER log_append_only;
SELECT test.ok(NOT audit.entry_intact((SELECT id FROM audit.attachment_seal(test.id('f1')))),
               'Sửa bản niêm phong thì phát hiện được');

SELECT audit.add_ledger_check(test.id('TDX'), test.id('f1'), 'code', 'PR-1', 'match', 'x', 'x', test.id('c'));
SELECT audit.add_archive_access(test.id('TDX'), test.id('f1'), test.id('c'));
SELECT test.eq((SELECT count(*) FROM audit.ledger_check WHERE attachment_id = test.id('f1')), 1::bigint,
               'Ghi lịch sử đối soát');
SELECT test.throws($$UPDATE audit.ledger_check SET result = 'mismatch'$$, '%chỉ cho ghi thêm%',
                   'Không sửa lịch sử đối soát');
SELECT test.throws($$DELETE FROM audit.archive_access$$, '%chỉ cho ghi thêm%', 'Không xóa nhật ký phòng đọc');
SELECT test.throws($$SELECT audit.add_ledger_check(test.id('TDX'), NULL, 'x', 'q', 'match', NULL, NULL, test.id('c'))$$,
                   '%violates check%', 'Cách đối soát chỉ là code hoặc file');
