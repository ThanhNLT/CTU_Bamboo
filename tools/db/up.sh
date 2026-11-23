#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

for _ in $(seq 1 30); do
    psql -X -q -d postgres -c "SELECT 1" > /dev/null 2>&1 && break
    sleep 2
done

# Volume tạo bằng image cũ (postgis/postgis trên Debian bullseye, glibc 2.31) rồi chạy bằng image bamboo-db
# (bookworm, glibc 2.36, chạy native trên arm64): dựng lại index theo collation mới và nâng extension PostGIS.
# Idempotent: volume mới hoặc đã nâng thì không làm gì.
for db in $(psql -X -At -d postgres -c "SELECT datname FROM pg_database WHERE datallowconn
        AND datcollversion IS DISTINCT FROM pg_database_collation_actual_version(oid)" 2> /dev/null); do
    echo "collation: reindex $db"
    psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "REINDEX DATABASE \"$db\"" \
        -c "ALTER DATABASE \"$db\" REFRESH COLLATION VERSION"
done
for db in $(psql -X -At -d postgres -c "SELECT datname FROM pg_database WHERE datallowconn"); do
    if [[ -n "$(psql -X -At -d "$db" -c "SELECT 1 FROM pg_extension e JOIN pg_available_extensions a ON a.name = e.extname
            WHERE e.extname = 'postgis' AND e.extversion <> a.default_version")" ]]; then
        echo "postgis: nâng extension trong $db"
        psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "SELECT postgis_extensions_upgrade()"
    fi
done

for db in ${EXTRA_DATABASES:-flowable hasura_meta}; do
    if [[ -z "$(psql -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]]; then
        echo "create database $db"
        psql -X -q -d postgres -c "CREATE DATABASE \"$db\""
    fi
done

HERE="$(dirname "$0")"
ROLES="$HERE/../../db/roles"
"$HERE/migrate.sh" bms "$HERE/../../db/migrations/bms"

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -f "$ROLES/roles.sql" \
    -v hasura_password="${HASURA_DB_PASSWORD:-hasura-db-dev}" \
    -v actions_password="${ACTIONS_DB_PASSWORD:-actions-db-dev}" \
    -v keycloak_password="${KEYCLOAK_DB_PASSWORD:-keycloak-db-dev}" \
    -v flowable_password="${FLOWABLE_DB_PASSWORD:-flowable-db-dev}" \
    -v cdc_password="${CDC_DB_PASSWORD:-cdc-db-dev}" \
    -v lakehouse_password="${LAKEHOUSE_DB_PASSWORD:-lakehouse-db-dev}"

for pair in ${SERVICE_DATABASES:-keycloak:bamboo_keycloak flowable:bamboo_flowable hasura_meta:bamboo_hasura}; do
    db="${pair%%:*}"
    owner="${pair#*:}"
    if [[ -n "$("${PSQL[@]}" -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]]; then
        "${PSQL[@]}" -d "$db" -v owner="$owner" -f "$ROLES/reown.sql"
    fi
done

for db in ${APP_DATABASES:-bms}; do
    "${PSQL[@]}" -d "$db" -f "$ROLES/grants.sql"
done
echo "roles: bamboo_hasura, bamboo_actions, bamboo_keycloak, bamboo_flowable, bamboo_cdc, bamboo_lakehouse"
