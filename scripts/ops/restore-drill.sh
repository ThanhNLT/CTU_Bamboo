#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
#
# Diễn tập khôi phục: kiểm tra mã băm các tệp sao lưu, khôi phục CSDL chính vào một CSDL tạm, đối chiếu chuỗi băm kiểm toán,
# bản neo và số dòng với CSDL đang chạy, rồi xóa CSDL tạm. Ghi kết quả vào audit.backup_run. Thoát khác 0 nếu có lỗi.
#   usage: restore-drill.sh <thư mục sao lưu>   CATALOG_DB (bms)   DRILL_TABLES
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
    # Cảnh báo về vai trò hoặc tiện ích đã có không phải lỗi dữ liệu; còn lại là lỗi thật
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
