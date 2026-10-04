#!/usr/bin/env bash
# Chạy các migration chưa chạy của một database, theo thứ tự tên file.
# Dùng biến môi trường chuẩn của psql: PGHOST, PGPORT, PGUSER, PGPASSWORD.
#   scripts/db/migrate.sh [database] [thư mục migration]
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

DB="${1:-bms}"
DIR="${2:-$(dirname "$0")/../../db/migrations/bms}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS public.schema_migration (
    filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"

for file in "$DIR"/*.sql; do
    name="$(basename "$file")"
    applied="$("${PSQL[@]}" -At -c "SELECT 1 FROM public.schema_migration WHERE filename = '$name'")"
    if [[ -n "$applied" ]]; then
        continue
    fi
    echo "migrate $DB: $name"
    # Mỗi file chạy trong một transaction; lỗi thì không để lại gì.
    "${PSQL[@]}" -1 -f "$file" -c "INSERT INTO public.schema_migration (filename) VALUES ('$name')"
done
