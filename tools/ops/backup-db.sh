#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-7}"
DBS="${BACKUP_DATABASES:-bms keycloak flowable hasura_meta lakehouse}"
CATALOG_DB="${CATALOG_DB:-bms}"
stamp="$(date +%Y%m%d-%H%M%S-%3N)"
out="$BACKUP_DIR/db-$stamp"
tmp="$out.partial"
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

record() {
    psql -X -q -d "$CATALOG_DB" -v ON_ERROR_STOP=0 \
        -v status="$1" -v loc="$2" -v size="$3" -v detail="$4" -v started="$started" <<'SQL' > /dev/null 2>&1 || true
INSERT INTO audit.backup_run (kind, status, location, size_bytes, detail, started_at)
VALUES ('BACKUP', :'status', NULLIF(:'loc', ''), NULLIF(:'size', '')::bigint, :'detail'::jsonb, :'started'::timestamptz);
SQL
}

fail() {
    rm -rf "$tmp"
    record FAILED "" "" "$(printf '{"error": "%s"}' "${1//\"/\'}")"
    echo "Sao lưu thất bại: $1" >&2
    exit 1
}

mkdir -p "$tmp"
pg_dumpall --globals-only -f "$tmp/globals.sql" || fail "pg_dumpall --globals-only"
done_dbs=""
for db in $DBS; do
    if [ "$(psql -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" = "1" ]; then
        pg_dump -Fc -d "$db" -f "$tmp/$db.dump" || fail "pg_dump $db"
        done_dbs="$done_dbs $db"
    fi
done
[ -n "$done_dbs" ] || fail "không có CSDL nào để sao lưu"
(cd "$tmp" && sha256sum ./* > SHA256SUMS)
mv "$tmp" "$out"

ls -1d "$BACKUP_DIR"/db-* 2> /dev/null | sort | head -n "-$KEEP" | while read -r old; do rm -rf "$old"; done

size="$(du -sb "$out" | cut -f1)"
record OK "$out" "$size" "$(printf '{"databases": "%s"}' "${done_dbs# }")"
echo "$out"
