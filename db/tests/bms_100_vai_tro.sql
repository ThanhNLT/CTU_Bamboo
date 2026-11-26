-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

SELECT test.ok(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls,
               'bamboo_actions không có đặc quyền hệ thống')
FROM pg_roles WHERE rolname = 'bamboo_actions';
SELECT test.ok(pg_has_role('bamboo_hasura', 'bamboo_app', 'MEMBER') AND pg_has_role('bamboo_actions', 'bamboo_app', 'MEMBER'),
               'Hasura và actions thuộc nhóm bamboo_app');

GRANT USAGE ON SCHEMA test TO bamboo_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA test TO bamboo_app;
SET LOCAL ROLE bamboo_actions;

SELECT test.ok((SELECT count(*) FROM core.person) > 0, 'Đọc được dữ liệu nghiệp vụ');
SELECT test.ok((SELECT count(*) FROM audit.log) > 0, 'Đọc được nhật ký kiểm toán');

CREATE TEMP TABLE n AS SELECT count(*) AS c FROM audit.log;
SELECT set_config('hasura.user', json_build_object('x-hasura-role', 'user', 'x-hasura-user-id', test.id('c'))::text, true);
UPDATE core.person SET full_name = 'Chị C (role ứng dụng)' WHERE id = test.id('c');
SELECT set_config('hasura.user', '', true);
SELECT test.eq((SELECT count(*) FROM audit.log), (SELECT c + 1 FROM n), 'Trigger ghi nhật ký dưới role ứng dụng');
SELECT test.eq((SELECT count(*) FROM audit.verify_chain(test.id('TDX'))), 0::bigint, 'Chuỗi vẫn nguyên vẹn');
UPDATE core.person SET full_name = full_name || '.' WHERE id = test.id('d');
SELECT test.eq((SELECT actor_role FROM audit.log ORDER BY id DESC LIMIT 1), session_user::text,
               'Không có phiên Hasura thì ghi tên tài khoản đăng nhập');

SELECT test.throws($$INSERT INTO audit.log (tenant_id, seq, table_name, row_id, op, created_at, hash)
                     VALUES (test.id('TDX'), 999999, 'x', 'x', 'INSERT', now(), '\x00')$$,
                   '%permission denied%', 'Không tự ghi nhật ký');
SELECT test.throws($$UPDATE audit.chain_head SET seq = 0$$, '%permission denied%', 'Không sửa đầu chuỗi');
SELECT test.throws($$DELETE FROM audit.log$$, '%permission denied%', 'Không xóa nhật ký');
SELECT test.throws($$ALTER TABLE audit.log DISABLE TRIGGER log_append_only$$, '%must be owner%',
                   'Không tắt được trigger chỉ-ghi-thêm');
SELECT test.throws($$DROP TABLE proc.purchase_request$$, '%must be owner%', 'Không xóa bảng');
SELECT test.throws($$CREATE TABLE core.x (id int)$$, '%permission denied%', 'Không tạo bảng trong schema nghiệp vụ');
SELECT test.throws($$TRUNCATE core.person CASCADE$$, '%permission denied%', 'Không TRUNCATE');
SELECT test.throws($$SELECT count(*) FROM public.schema_migration$$, '%permission denied%', 'Không đọc bảng migration');
SELECT test.throws($$COPY core.person TO PROGRAM 'id'$$, '%permission denied%',
                   'Không chạy lệnh hệ điều hành');

RESET ROLE;
