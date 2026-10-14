#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PROJECT="${COMPOSE_PROJECT_NAME:-bamboo}"
OUT="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
dc() { docker compose -p "$PROJECT" "$@"; }

echo "==> CSDL (pg_dumpall)"
dc exec -T db sh -c 'pg_dumpall -U "${POSTGRES_USER:-bms}" -f /tmp/bamboo-backup.sql'
dc cp db:/tmp/bamboo-backup.sql "$OUT/postgres.sql"
dc exec -T db rm -f /tmp/bamboo-backup.sql

echo "==> Volume (tạm dừng OpenBao, SeaweedFS trong lúc chép)"
dc pause openbao seaweedfs > /dev/null
trap 'dc unpause openbao seaweedfs >/dev/null 2>&1 || true' EXIT
for vol in openbao-data openbao-keys seaweedfs-data; do
    docker run --rm -v "${PROJECT}_${vol}:/v:ro" -v "$OUT:/backup" alpine:3.22 \
        tar czf "/backup/${vol}.tgz" -C /v .
done
dc unpause openbao seaweedfs > /dev/null
trap - EXIT

ls -lh "$OUT"
echo "Đã sao lưu vào $OUT (chứa khóa két: cất giữ an toàn)."
