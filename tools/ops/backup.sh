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
