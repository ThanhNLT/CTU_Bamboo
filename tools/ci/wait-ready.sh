#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

TIMEOUT="${1:-900}"
JOBS=(migrate seed openbao-init bootstrap)
SERVICES=(db keycloak flowable hasura openbao seaweedfs actions web gateway)
deadline=$((SECONDS + TIMEOUT))
DC=(docker compose -p "${COMPOSE_PROJECT_NAME:-bamboo}")

state() { "${DC[@]}" ps -a --format '{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}' | awk -F'|' -v s="$1" '$1 == s'; }

while :; do
    pending=()
    for job in "${JOBS[@]}"; do
        IFS='|' read -r _ st _ code <<< "$(state "$job")"
        if [[ "$st" == exited && "$code" != 0 ]]; then
            echo "Job $job thoát với mã $code"
            "${DC[@]}" logs "$job" | tail -50
            exit 1
        fi
        [[ "$st" == exited ]] || pending+=("$job")
    done
    for svc in "${SERVICES[@]}"; do
        IFS='|' read -r _ st health _ <<< "$(state "$svc")"
        [[ "$st" == running && "$health" == healthy ]] || pending+=("$svc($st/$health)")
    done
    if [[ ${#pending[@]} -eq 0 ]]; then
        echo "Hệ thống sẵn sàng sau ${SECONDS}s"
        "${DC[@]}" ps
        exit 0
    fi
    if ((SECONDS > deadline)); then
        echo "Quá ${TIMEOUT}s, còn chờ: ${pending[*]}"
        "${DC[@]}" ps -a
        for s in "${pending[@]}"; do "${DC[@]}" logs "${s%%(*}" | tail -40; done
        exit 1
    fi
    echo "[${SECONDS}s] chờ: ${pending[*]}"
    sleep 10
done
