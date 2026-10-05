-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Tài khoản CSDL đặc quyền tối thiểu (ADR #35). Job migrate chạy lại mỗi lần khởi động (idempotent),
-- mật khẩu lấy từ biến psql nên đổi biến môi trường là đổi mật khẩu.
--
--   bamboo_app       nhóm, không đăng nhập: đọc/ghi dữ liệu nghiệp vụ trong CSDL bms (cấp ở grants.sql)
--   bamboo_hasura    Hasura: thành viên bamboo_app, chủ CSDL metadata hasura_meta
--   bamboo_actions   dịch vụ actions, flow-sync: thành viên bamboo_app
--   bamboo_keycloak  chủ CSDL keycloak     bamboo_flowable  chủ CSDL flowable
--   bamboo_cdc       Debezium (ADR #38): replication logic, chỉ đọc các schema trong publication bms_cdc
--
-- Không role nào là superuser, tạo được CSDL/role hay bỏ qua RLS; chỉ bamboo_cdc có quyền replication.
-- Tài khoản `bms` (superuser, chủ schema nghiệp vụ) chỉ dùng cho migrate và seed.
--
-- psql -v hasura_password=... -v actions_password=... -v keycloak_password=... -v flowable_password=...
--      -v cdc_password=...

SELECT format('CREATE ROLE %I', r)
FROM unnest(ARRAY['bamboo_app', 'bamboo_hasura', 'bamboo_actions', 'bamboo_keycloak', 'bamboo_flowable',
                   'bamboo_cdc']) r
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = r)
\gexec

ALTER ROLE bamboo_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE bamboo_hasura LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'hasura_password';
ALTER ROLE bamboo_actions LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'actions_password';
ALTER ROLE bamboo_keycloak LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'keycloak_password';
ALTER ROLE bamboo_flowable LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'flowable_password';
ALTER ROLE bamboo_cdc LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE REPLICATION NOBYPASSRLS
    PASSWORD :'cdc_password';

GRANT bamboo_app TO bamboo_hasura, bamboo_actions;

-- CSDL nghiệp vụ: chỉ nhóm ứng dụng (và superuser) được kết nối. CSDL của từng dịch vụ: reown.sql.
SELECT 'REVOKE CONNECT, TEMPORARY ON DATABASE bms FROM PUBLIC' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'bms')
\gexec
