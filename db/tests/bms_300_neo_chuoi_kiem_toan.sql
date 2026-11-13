-- Bamboo - DX-OS Open-Core
-- @version 0.5.0
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

CREATE FUNCTION pg_temp.head() RETURNS audit.chain_head LANGUAGE sql AS $$
    SELECT h FROM audit.chain_head h WHERE tenant_id = test.id('TDX')
$$;

SELECT test.ok((SELECT seq FROM pg_temp.head()) > 0, 'chuỗi kiểm toán đã có bản ghi');
INSERT INTO audit.anchor (tenant_id, seq, head_hash, statement, signature)
SELECT tenant_id, seq, hash, '{"v":1}', '{"alg":"ed25519","sig":"x"}' FROM audit.chain_head WHERE tenant_id = test.id('TDX');
SELECT test.eq((SELECT count(*)::int FROM audit.check_anchors(test.id('TDX'))), 0, 'chuỗi nguyên vẹn thì không có vấn đề');

SELECT test.pr('pr2', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq((SELECT count(*)::int FROM audit.check_anchors(test.id('TDX'))), 0, 'ghi thêm không làm bản neo cũ sai');

SELECT test.throws($$DELETE FROM audit.anchor$$, '%chỉ cho ghi thêm%', 'không xóa bản neo');
SELECT test.throws($$UPDATE audit.anchor SET head_hash = '\x00'$$, '%chỉ cho ghi thêm%', 'không sửa mã băm đã neo');
SELECT test.throws($$UPDATE audit.anchor SET signature = '{}'$$, '%chỉ cho ghi thêm%', 'không sửa chữ ký');
UPDATE audit.anchor SET published = '[{"kind": "s3", "key": "a"}]';
SELECT test.eq((SELECT jsonb_array_length(published) FROM audit.anchor LIMIT 1), 1, 'cập nhật được nơi công bố');

ALTER TABLE audit.log DISABLE TRIGGER USER;
UPDATE audit.log SET hash = '\xdeadbeef' WHERE tenant_id = test.id('TDX') AND seq = (SELECT seq FROM audit.anchor LIMIT 1);
ALTER TABLE audit.log ENABLE TRIGGER USER;
SELECT test.eq((SELECT problem FROM audit.check_anchors(test.id('TDX'))), 'LOG_REWRITTEN', 'phát hiện bản ghi bị viết lại');

ALTER TABLE audit.log DISABLE TRIGGER USER;
DELETE FROM audit.log WHERE tenant_id = test.id('TDX') AND seq = (SELECT seq FROM audit.anchor LIMIT 1);
ALTER TABLE audit.log ENABLE TRIGGER USER;
SELECT test.eq((SELECT problem FROM audit.check_anchors(test.id('TDX'))), 'LOG_TRUNCATED', 'phát hiện chuỗi bị cắt');
