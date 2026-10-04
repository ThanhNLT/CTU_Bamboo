#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

# Service `migrate`: tạo các database phụ (Flowable, metadata Hasura) nếu chưa có, rồi migrate `bms`.
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

# Chờ CSDL nhận kết nối TCP (phòng khi healthcheck báo sẵn sàng sớm), tối đa 60 giây.
for _ in $(seq 1 30); do
    psql -X -q -d postgres -c "SELECT 1" >/dev/null 2>&1 && break
    sleep 2
done

for db in ${EXTRA_DATABASES:-flowable hasura_meta}; do
    if [[ -z "$(psql -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]]; then
        echo "create database $db"
        psql -X -q -d postgres -c "CREATE DATABASE \"$db\""
    fi
done
exec "$(dirname "$0")/migrate.sh" bms "$(dirname "$0")/../../db/migrations/bms"
