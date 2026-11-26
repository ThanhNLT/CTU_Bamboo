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

set -uo pipefail

dir="${1:?cần thư mục sao lưu, ví dụ /backups/db-20261025-020000}"
CATALOG_DB="${CATALOG_DB:-bms}"
TABLES="${DRILL_TABLES:-core.tenant core.person audit.log proc.purchase_request core.attachment}"
scratch="bms_drill_$$"
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
problems=()

record() {
    psql -X -q -d "$CATALOG_DB" -v ON_ERROR_STOP=0 -v status="$1" -v loc="$dir" -v detail="$2" -v started="$started" <<'SQL' > /dev/null 2>&1 || true
INSERT INTO audit.backup_run (kind, status, location, detail, started_at)
VALUES ('DRILL', :'status', :'loc', :'detail'::jsonb, :'started'::timestamptz);
SQL
}

cleanup() { psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$scratch\" WITH (FORCE)" > /dev/null 2>&1 || true; }
trap cleanup EXIT

finish() {
    local status=OK json
    [ "${#problems[@]}" -eq 0 ] || status=FAILED
    json="$(printf '{"problems": [%s], "tenants": %s, "audit_rows": %s}' \
        "$(printf '"%s",' "${problems[@]:-}" | sed 's/,$//; s/""//')" "${tenants:-0}" "${restored_audit:-0}")"
    record "$status" "$json"
    echo "Diễn tập khôi phục $dir: $status ${problems[*]:-}"
    [ "$status" = OK ]
    exit $?
}

[ -f "$dir/SHA256SUMS" ] || { problems+=("thiếu SHA256SUMS"); finish; }
(cd "$dir" && sha256sum -c --quiet SHA256SUMS > /dev/null 2>&1) || { problems+=("mã băm tệp sao lưu không khớp"); finish; }
[ -f "$dir/$CATALOG_DB.dump" ] || { problems+=("thiếu $CATALOG_DB.dump"); finish; }

psql -X -q -d postgres -c "CREATE DATABASE \"$scratch\"" > /dev/null 2>&1 || { problems+=("không tạo được CSDL tạm"); finish; }
if ! pg_restore --no-owner --no-privileges -d "$scratch" "$dir/$CATALOG_DB.dump" > /tmp/drill-$$.log 2>&1; then
    real="$(grep -E '^pg_restore: error' /tmp/drill-$$.log | grep -vE 'already exists|role .* does not exist' | head -1 || true)"
    [ -z "$real" ] || problems+=("pg_restore: ${real#pg_restore: error: }")
fi
rm -f "/tmp/drill-$$.log"

q() { psql -X -At -d "$scratch" -c "$1" 2> /dev/null; }
tenants="$(q 'SELECT count(*) FROM core.tenant')"
[ "${tenants:-0}" -gt 0 ] || problems+=("CSDL khôi phục không có tenant nào")
broken="$(q 'SELECT count(*) FROM core.tenant t, LATERAL audit.verify_chain(t.id)')"
[ "${broken:-x}" = "0" ] || problems+=("chuỗi băm kiểm toán lỗi ($broken vấn đề)")
anchors="$(q 'SELECT count(*) FROM core.tenant t, LATERAL audit.check_anchors(t.id)')"
[ "${anchors:-x}" = "0" ] || problems+=("bản neo không khớp chuỗi ($anchors vấn đề)")
for table in $TABLES; do
    live="$(psql -X -At -d "$CATALOG_DB" -c "SELECT count(*) FROM $table" 2> /dev/null || echo 0)"
    restored="$(q "SELECT count(*) FROM $table")"
    [ "$table" != "audit.log" ] || restored_audit="${restored:-0}"
    if [ -z "$restored" ] || [ "$restored" -gt "$live" ] || { [ "$live" -gt 0 ] && [ "$restored" -eq 0 ]; }; then
        problems+=("$table: khôi phục ${restored:-?} dòng, đang chạy $live dòng")
    fi
done
finish
