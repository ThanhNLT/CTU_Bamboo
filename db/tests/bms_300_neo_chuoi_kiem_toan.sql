-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);

CREATE FUNCTION pg_temp.head() RETURNS audit.chain_head LANGUAGE sql AS $$
    SELECT h FROM audit.chain_head h WHERE tenant_id = test.id('TDX')
$$;

SELECT test.ok((SELECT seq FROM pg_temp.head()) > 0, 'chuỗi kiểm toán đã có bản ghi');
INSERT INTO audit.anchor (tenant_id, seq, head_hash, statement, signature)
SELECT tenant_id, seq, hash, '{"v":1}', '{"alg":"ed25519","sig":"x"}' FROM audit.chain_head WHERE tenant_id = test.id('TDX');
SELECT test.eq((SELECT count(*)::int FROM audit.check_anchors(test.id('TDX'))), 0, 'chuỗi nguyên vẹn thì không có vấn đề');

-- Chuỗi tiếp tục dài ra: bản neo cũ vẫn khớp
SELECT test.pr('pr2', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq((SELECT count(*)::int FROM audit.check_anchors(test.id('TDX'))), 0, 'ghi thêm không làm bản neo cũ sai');

-- Bản neo chỉ ghi thêm
SELECT test.throws($$DELETE FROM audit.anchor$$, '%chỉ cho ghi thêm%', 'không xóa bản neo');
SELECT test.throws($$UPDATE audit.anchor SET head_hash = '\x00'$$, '%chỉ cho ghi thêm%', 'không sửa mã băm đã neo');
SELECT test.throws($$UPDATE audit.anchor SET signature = '{}'$$, '%chỉ cho ghi thêm%', 'không sửa chữ ký');
UPDATE audit.anchor SET published = '[{"kind": "s3", "key": "a"}]';
SELECT test.eq((SELECT jsonb_array_length(published) FROM audit.anchor LIMIT 1), 1, 'cập nhật được nơi công bố');

-- Kẻ có quyền cao viết lại một bản ghi kiểm toán đã neo: bị phát hiện
ALTER TABLE audit.log DISABLE TRIGGER USER;
UPDATE audit.log SET hash = '\xdeadbeef' WHERE tenant_id = test.id('TDX') AND seq = (SELECT seq FROM audit.anchor LIMIT 1);
ALTER TABLE audit.log ENABLE TRIGGER USER;
SELECT test.eq((SELECT problem FROM audit.check_anchors(test.id('TDX'))), 'LOG_REWRITTEN', 'phát hiện bản ghi bị viết lại');

-- Cắt bớt chuỗi: bị phát hiện
ALTER TABLE audit.log DISABLE TRIGGER USER;
DELETE FROM audit.log WHERE tenant_id = test.id('TDX') AND seq = (SELECT seq FROM audit.anchor LIMIT 1);
ALTER TABLE audit.log ENABLE TRIGGER USER;
SELECT test.eq((SELECT problem FROM audit.check_anchors(test.id('TDX'))), 'LOG_TRUNCATED', 'phát hiện chuỗi bị cắt');
