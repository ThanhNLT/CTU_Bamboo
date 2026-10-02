#!/usr/bin/env bash
# Tạo database kiểm thử sạch, chạy migration, rồi chạy từng file db/tests/bms_*.sql
# trong một transaction tự rollback.
#   scripts/db/test.sh [mẫu tên file, ví dụ bms_030]
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${TEST_DB:-bms_test}"
FILTER="${1:-}"

psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
"$ROOT/scripts/db/migrate.sh" "$DB" "$ROOT/db/migrations/bms" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f "$ROOT/db/tests/helpers.sql"

pass=0
fail=0
for file in "$ROOT"/db/tests/bms_*.sql; do
    name="$(basename "$file")"
    [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && continue
    if out="$(psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB" -c 'BEGIN' -f "$file" -c 'ROLLBACK' 2>&1)"; then
        echo "ok   $name"
        pass=$((pass + 1))
    else
        echo "FAIL $name"
        echo "$out" | sed 's/^/     /'
        fail=$((fail + 1))
    fi
done
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
