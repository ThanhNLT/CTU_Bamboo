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

SELECT format('CREATE ROLE %I', r)
FROM unnest(ARRAY['bamboo_app', 'bamboo_hasura', 'bamboo_actions', 'bamboo_keycloak', 'bamboo_flowable',
                   'bamboo_cdc', 'bamboo_lakehouse']) r
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
ALTER ROLE bamboo_lakehouse LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'lakehouse_password';

GRANT bamboo_app TO bamboo_hasura, bamboo_actions;

SELECT 'REVOKE CONNECT, TEMPORARY ON DATABASE bms FROM PUBLIC' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'bms')
\gexec
