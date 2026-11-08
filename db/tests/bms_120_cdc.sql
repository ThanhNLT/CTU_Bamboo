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
