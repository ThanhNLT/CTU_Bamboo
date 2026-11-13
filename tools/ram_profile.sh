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
cd "$(dirname "$0")/.."

env_value() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -n1 || true; }

mode=${BAMBOO_RAM:-$(env_value BAMBOO_RAM)}
if [ -z "$mode" ]; then
    kb=""
    if command -v docker > /dev/null 2>&1; then
        bytes=$(docker info --format '{{.MemTotal}}' 2> /dev/null || true)
        [ -n "$bytes" ] && kb=$((bytes / 1024))
    fi
    [ -z "$kb" ] && kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    if [ "$kb" -ge $((12 * 1024 * 1024)) ]; then mode=16; else mode=8; fi
    echo "Tự chọn mức RAM $mode (Docker thấy $((kb / 1024)) MB); đặt BAMBOO_RAM=8 hoặc 16 để chọn tay" >&2
fi

case "$mode" in
    16)
        echo "Mức RAM 16: đầy đủ chức năng, gồm AI (Ollama, OCR ngủ khi nhàn rỗi)" >&2
        ;;
    8)
        cat << 'VARS'
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export AI_KEEP_ALIVE="${AI_KEEP_ALIVE:-2m}"
export OCR_IDLE_SECONDS="${OCR_IDLE_SECONDS:-120}"
export KEYCLOAK_HEAP="${KEYCLOAK_HEAP:--Xms64m -Xmx384m}"
export FLOWABLE_JAVA_OPTS="${FLOWABLE_JAVA_OPTS:--Xms64m -Xmx384m}"
export KAFKA_HEAP="${KAFKA_HEAP:--Xms64m -Xmx384m}"
export TIKA_JAVA_OPTS="${TIKA_JAVA_OPTS:--Xmx384m}"
export MEILI_MAX_INDEXING_MEMORY="${MEILI_MAX_INDEXING_MEMORY:-256 MiB}"
export KEYCLOAK_DB_POOL="${KEYCLOAK_DB_POOL:-10}"
export GATEWAY_WORKERS="${GATEWAY_WORKERS:-1}"
export SLEEPER_IDLE_SECONDS="${SLEEPER_IDLE_SECONDS:-120}"
VARS
        echo "Mức RAM 8: đầy đủ chức năng kể cả AI, tiết kiệm RAM (mỗi lúc một mô hình AI, dịch vụ dùng thưa ngủ sớm)" >&2
        ;;
    *)
        echo "BAMBOO_RAM phải là 8 hoặc 16 (đang là '$mode')" >&2
        exit 1
        ;;
esac
case "${COMPOSE_FILE:-$(env_value COMPOSE_FILE)}" in
    *gpu.yml*)
        echo "CẢNH BÁO: COMPOSE_FILE ép GPU (infra/compose/gpu.yml): Docker không cấp được GPU thì Ollama, OCR không chạy và ai-worker chờ mãi; OCR cũng không tự tải PyTorch CUDA. Xóa dòng COMPOSE_FILE trong .env, sleeper tự dò GPU (ADR #79)" >&2
        ;;
esac
profiles=${COMPOSE_PROFILES:-$(env_value COMPOSE_PROFILES)}
add_profile() { case ",$profiles," in *",$1,"*) ;; *) profiles=${profiles:+$profiles,}$1 ;; esac; }
obs=${BAMBOO_OBSERVABILITY:-$(env_value BAMBOO_OBSERVABILITY)}
[ -z "$obs" ] && { [ "$mode" = 16 ] && obs=true || obs=false; }
clamav=${BAMBOO_CLAMAV:-$(env_value BAMBOO_CLAMAV)}
[ -z "$clamav" ] && { [ "$mode" = 16 ] && clamav=true || clamav=false; }
if [ "$obs" = true ]; then
    add_profile observability
    echo 'export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://otel-collector:4318}"'
    echo "Giám sát: Grafana http://localhost:3001, Jaeger http://localhost:16686, Prometheus http://localhost:9090" >&2
fi
if [ "$clamav" = true ]; then
    add_profile scan
    echo "export CLAMAV_HOST=\"\${CLAMAV_HOST:-clamav}\""
    echo "Quét virus: bộ quét nội bộ + CDR + ClamAV" >&2
fi
[ -n "$profiles" ] && echo "export COMPOSE_PROFILES=\"$profiles\""
echo "export BAMBOO_RAM_MODE=$mode"
