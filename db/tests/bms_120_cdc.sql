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

SELECT test.ok(EXISTS (SELECT FROM pg_publication_tables WHERE pubname = 'bms_cdc'
                       AND schemaname = 'proc' AND tablename = 'purchase_request'), 'Đề nghị mua sắm có trong publication');
SELECT test.ok(EXISTS (SELECT FROM pg_publication_tables WHERE pubname = 'bms_cdc'
                       AND schemaname = 'cdc' AND tablename = 'heartbeat'), 'Nhịp tim có trong publication');
SELECT test.ok(NOT EXISTS (SELECT FROM pg_publication_tables WHERE pubname = 'bms_cdc'
                           AND schemaname IN ('audit', 'search', 'public', 'test')),
               'Không đẩy nhật ký kiểm toán, hàng đợi tìm kiếm, bảng hệ thống');

CREATE TABLE proc.cdc_bang_moi (id int PRIMARY KEY);
SELECT test.ok(EXISTS (SELECT FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND tablename = 'cdc_bang_moi'),
               'Bảng tạo sau trong schema nghiệp vụ tự vào publication');
DROP TABLE proc.cdc_bang_moi;

SELECT test.ok((SELECT rolreplication AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
                FROM pg_roles WHERE rolname = 'bamboo_cdc'), 'bamboo_cdc chỉ có quyền replication');
SELECT test.ok(NOT pg_has_role('bamboo_cdc', 'bamboo_app', 'MEMBER'), 'bamboo_cdc không thuộc nhóm ứng dụng');
SELECT test.ok(has_table_privilege('bamboo_cdc', 'proc.purchase_request', 'SELECT'), 'Debezium đọc được để chụp ảnh ban đầu');
SELECT test.ok(has_table_privilege('bamboo_cdc', 'cdc.heartbeat', 'UPDATE'), 'Debezium ghi được nhịp tim');
SELECT test.ok(NOT has_table_privilege('bamboo_cdc', 'proc.purchase_request', 'INSERT')
               AND NOT has_table_privilege('bamboo_cdc', 'proc.purchase_request', 'UPDATE')
               AND NOT has_table_privilege('bamboo_cdc', 'proc.purchase_request', 'DELETE'), 'Debezium không ghi dữ liệu nghiệp vụ');
SELECT test.ok(NOT has_table_privilege('bamboo_cdc', 'audit.log', 'SELECT'), 'Debezium không đọc nhật ký kiểm toán');
SELECT test.ok(NOT has_table_privilege('bamboo_cdc', 'search.pending', 'SELECT'), 'Debezium không đọc hàng đợi tìm kiếm');
