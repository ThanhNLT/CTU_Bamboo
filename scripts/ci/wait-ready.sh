#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
#
# Chờ `docker compose up -d` xong: job khởi tạo thoát mã 0, dịch vụ chạy lâu "healthy".
#   scripts/ci/wait-ready.sh [số giây tối đa, mặc định 900]
set -euo pipefail
TIMEOUT="${1:-900}"
JOBS=(migrate seed openbao-init bootstrap)
SERVICES=(db keycloak flowable hasura openbao seaweedfs actions web)
deadline=$((SECONDS + TIMEOUT))
# Theo tên project: chạy được cả khi hệ thống dựng từ compose.release.yml hay oci:// (không cần tệp compose ở đây).
DC=(docker compose -p "${COMPOSE_PROJECT_NAME:-bamboo}")

# Dấu | phân cách cột: Health rỗng (dịch vụ không có healthcheck) không làm lệch cột sau.
state() { "${DC[@]}" ps -a --format '{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}' | awk -F'|' -v s="$1" '$1 == s'; }

while :; do
    pending=()
    for job in "${JOBS[@]}"; do
        IFS='|' read -r _ st _ code <<<"$(state "$job")"
        if [[ "$st" == exited && "$code" != 0 ]]; then
            echo "Job $job thoát với mã $code"; "${DC[@]}" logs "$job" | tail -50; exit 1
        fi
        [[ "$st" == exited ]] || pending+=("$job")
    done
    for svc in "${SERVICES[@]}"; do
        IFS='|' read -r _ st health _ <<<"$(state "$svc")"
        [[ "$st" == running && "$health" == healthy ]] || pending+=("$svc($st/$health)")
    done
    if [[ ${#pending[@]} -eq 0 ]]; then
        echo "Hệ thống sẵn sàng sau ${SECONDS}s"; "${DC[@]}" ps; exit 0
    fi
    if (( SECONDS > deadline )); then
        echo "Quá ${TIMEOUT}s, còn chờ: ${pending[*]}"; "${DC[@]}" ps -a
        for s in "${pending[@]}"; do "${DC[@]}" logs "${s%%(*}" | tail -40; done
        exit 1
    fi
    echo "[${SECONDS}s] chờ: ${pending[*]}"
    sleep 10
done
