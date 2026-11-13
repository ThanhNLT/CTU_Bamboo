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

SELECT test.ok((SELECT count(*) FROM audit.log WHERE tenant_id = test.id('TDX')) > 0, 'Dữ liệu mẫu đã được ghi nhật ký');
SELECT test.eq((SELECT count(*) FROM audit.verify_chain(test.id('TDX'))), 0::bigint, 'Chuỗi ban đầu nguyên vẹn');
SELECT test.eq((SELECT count(*) FROM audit.log WHERE tenant_id = test.id('TDX') AND seq = 1 AND prev_hash IS NULL),
               1::bigint, 'Dòng đầu chuỗi không có prev_hash');

SELECT set_config('hasura.user', json_build_object('x-hasura-role', 'user', 'x-hasura-user-id', test.id('c'))::text, true);
UPDATE core.person SET full_name = 'Chị C (đổi tên)' WHERE id = test.id('c');
SELECT set_config('hasura.user', '', true);
SELECT test.eq((SELECT actor_id::text || '|' || actor_role || '|' || array_to_string(changed_cols, ',')
                FROM audit.log WHERE table_name = 'core.person' AND row_id = test.id('c')::text AND op = 'UPDATE'),
               test.id('c')::text || '|user|full_name', 'Ghi người sửa, role và cột thay đổi');
SELECT test.eq((SELECT old_data ->> 'full_name' FROM audit.log
                WHERE table_name = 'core.person' AND row_id = test.id('c')::text AND op = 'UPDATE'),
               'Chị C', 'Ghi dữ liệu cũ');

CREATE TEMP TABLE n AS SELECT count(*) AS c FROM audit.log;
UPDATE core.person SET full_name = full_name WHERE id = test.id('d');
SELECT test.eq((SELECT count(*) FROM audit.log), (SELECT c FROM n), 'Không đổi giá trị thì không ghi nhật ký');

INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'KT', 'Kiểm toán');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, 'audit.read' FROM core.role WHERE code = 'KT';
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'core.role_permission'
                       AND row_id = (SELECT id FROM core.role WHERE code = 'KT')::text || ':audit.read'),
               'Khóa nhiều cột ghép bằng dấu hai chấm');

INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT tenant_id, id, test.id('P_PTGD'), 'TENANT' FROM core.role WHERE code = 'KT';
SELECT test.ok(EXISTS (SELECT 1 FROM audit.v_reader WHERE person_id = test.id('ptgd') AND tenant_id = test.id('TDX')),
               'Người có audit.read là người đọc nhật ký');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM audit.v_reader WHERE person_id = test.id('c')), 'Nhân viên không đọc được');

SELECT test.throws($$UPDATE audit.log SET actor_role = 'x' WHERE id = (SELECT min(id) FROM audit.log)$$,
                   '%chỉ cho ghi thêm%', 'Không sửa được nhật ký');
SELECT test.throws($$DELETE FROM audit.log WHERE id = (SELECT max(id) FROM audit.log)$$,
                   '%chỉ cho ghi thêm%', 'Không xóa được nhật ký');
SELECT test.throws($$TRUNCATE audit.log$$, '%chỉ cho ghi thêm%', 'Không truncate được nhật ký');
UPDATE audit.log SET sealed_at = now() WHERE id = (SELECT min(id) FROM audit.log);
SELECT test.throws($$UPDATE audit.log SET sealed_at = now() WHERE id = (SELECT min(id) FROM audit.log)$$,
                   '%chỉ cho ghi thêm%', 'sealed_at chỉ đặt một lần');

ALTER TABLE audit.log DISABLE TRIGGER log_append_only;
UPDATE audit.log SET new_data = jsonb_set(new_data, '{full_name}', '"Giả mạo"')
WHERE table_name = 'core.person' AND row_id = test.id('d')::text AND op = 'INSERT';
SELECT test.eq((SELECT array_agg(problem) FROM audit.verify_chain(test.id('TDX'))), ARRAY['HASH_MISMATCH'],
               'Sửa nội dung một dòng: phát hiện đúng dòng đó');
SELECT test.eq((SELECT seq FROM audit.verify_chain(test.id('TDX'))),
               (SELECT seq FROM audit.log WHERE table_name = 'core.person' AND row_id = test.id('d')::text AND op = 'INSERT'),
               'Chỉ ra đúng số thứ tự bị sửa');
UPDATE audit.log l SET hash = audit.compute_hash(l)
WHERE table_name = 'core.person' AND row_id = test.id('d')::text AND op = 'INSERT';
SELECT test.eq((SELECT array_agg(problem) FROM audit.verify_chain(test.id('TDX'))), ARRAY['PREV_MISMATCH'],
               'Tính lại hash thì dòng kế tiếp lệch');
DELETE FROM audit.log WHERE tenant_id = test.id('TDX') AND seq = (SELECT max(seq) FROM audit.log WHERE tenant_id = test.id('TDX'));
SELECT test.ok('HEAD_MISMATCH' = ANY (SELECT problem FROM audit.verify_chain(test.id('TDX'))), 'Xóa dòng cuối: lệch đầu chuỗi');
ALTER TABLE audit.log ENABLE TRIGGER log_append_only;

SELECT test.eq((SELECT count(*) FROM audit.verify_chain(test.id('BVX'))), 0::bigint, 'Chuỗi tenant khác không bị ảnh hưởng');
