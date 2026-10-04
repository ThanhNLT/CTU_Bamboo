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

# Dấu | phân cách cột: Health rỗng (dịch vụ không có healthcheck) không làm lệch cột sau.
state() { docker compose ps -a --format '{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}' | awk -F'|' -v s="$1" '$1 == s'; }

while :; do
    pending=()
    for job in "${JOBS[@]}"; do
        IFS='|' read -r _ st _ code <<<"$(state "$job")"
        if [[ "$st" == exited && "$code" != 0 ]]; then
            echo "Job $job thoát với mã $code"; docker compose logs "$job" | tail -50; exit 1
        fi
        [[ "$st" == exited ]] || pending+=("$job")
    done
    for svc in "${SERVICES[@]}"; do
        IFS='|' read -r _ st health _ <<<"$(state "$svc")"
        [[ "$st" == running && "$health" == healthy ]] || pending+=("$svc($st/$health)")
    done
    if [[ ${#pending[@]} -eq 0 ]]; then
        echo "Hệ thống sẵn sàng sau ${SECONDS}s"; docker compose ps; exit 0
    fi
    if (( SECONDS > deadline )); then
        echo "Quá ${TIMEOUT}s, còn chờ: ${pending[*]}"; docker compose ps -a
        for s in "${pending[@]}"; do docker compose logs "${s%%(*}" | tail -40; done
        exit 1
    fi
    echo "[${SECONDS}s] chờ: ${pending[*]}"
    sleep 10
done
