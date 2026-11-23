#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

for _ in $(seq 1 30); do
    psql -X -q -d postgres -c "SELECT 1" > /dev/null 2>&1 && break
    sleep 2
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
