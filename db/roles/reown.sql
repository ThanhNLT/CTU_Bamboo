-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Chuyển mọi đối tượng trong CSDL hiện tại sang chủ mới (:owner). Dùng khi nâng cấp từ bản mà
-- Keycloak, Flowable, Hasura còn đăng nhập bằng `bms`: dịch vụ phải là chủ bảng của mình để tự
-- migrate schema. Không dùng REASSIGN OWNED vì `bms` là superuser khởi tạo, sở hữu cả catalog hệ thống.
-- Bỏ qua đối tượng của extension và sequence gắn với cột (đổi theo bảng).

SELECT format('ALTER DATABASE %I OWNER TO %I', current_database(), :'owner')
WHERE (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) <> :'owner'
\gexec

-- Chỉ chủ sở hữu (và superuser) được kết nối.
SELECT format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database())
\gexec

SELECT format('ALTER SCHEMA %I OWNER TO %I', n.nspname, :'owner')
FROM pg_namespace n
WHERE n.nspname NOT IN ('public', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND pg_get_userbyid(n.nspowner) <> :'owner'
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_namespace'::regclass AND d.objid = n.oid
                  AND d.deptype = 'e')
\gexec

SELECT format('ALTER %s %I.%I OWNER TO %I',
              CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                             WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
              n.nspname, c.relname, :'owner')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  AND n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND pg_get_userbyid(c.relowner) <> :'owner'
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                  AND d.deptype IN ('e', 'a', 'i'))
\gexec

SELECT format('ALTER %s %s OWNER TO %I', CASE p.prokind WHEN 'a' THEN 'AGGREGATE' ELSE 'ROUTINE' END,
              p.oid::regprocedure, :'owner')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND pg_get_userbyid(p.proowner) <> :'owner'
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
                  AND d.deptype = 'e')
\gexec

SELECT format('ALTER %s %s OWNER TO %I', CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
              t.oid::regtype, :'owner')
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE (t.typtype IN ('e', 'd', 'r')
       OR (t.typtype = 'c' AND (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c'))
  AND n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND pg_get_userbyid(t.typowner) <> :'owner'
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid
                  AND d.deptype = 'e')
\gexec
