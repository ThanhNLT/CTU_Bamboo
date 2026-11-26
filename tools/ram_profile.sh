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

set -euo pipefail
cd "$(dirname "$0")/.."

# .env sửa bằng Notepad có CRLF, hoặc giá trị đặt trong nháy như Docker Compose vẫn nhận: bỏ cả hai.
env_value() { [ -f .env ] && sed -n "s/^[[:space:]]*$1=//p" .env | tail -n1 | tr -d '\r' | sed "s/^[[:space:]]*['\"]\{0,1\}//; s/['\"]\{0,1\}[[:space:]]*\$//" || true; }

# Phiên bản tối thiểu: Engine 25 (healthcheck start_interval), Compose 2.20 (include); tài liệu khuyên Compose 2.34+.
# Không đọc được phiên bản thì bỏ qua, để docker compose tự báo.
older() { awk -v a="$1" -v b="$2" 'BEGIN { split(a, x, "."); split(b, y, "."); for (i = 1; i <= 3; i++) { if (x[i] + 0 != y[i] + 0) exit !(x[i] + 0 < y[i] + 0) } exit 1 }'; }
if command -v docker > /dev/null 2>&1; then
    engine=$(docker version --format '{{.Server.Version}}' 2> /dev/null | sed -n 's/^v\{0,1\}\([0-9][0-9.]*\).*/\1/p' | head -n1 || true)
    compose=$(docker compose version --short 2> /dev/null | sed -n 's/^v\{0,1\}\([0-9][0-9.]*\).*/\1/p' | head -n1 || true)
    if [ -n "$engine" ] && older "$engine" 25.0.0; then
        echo "Docker Engine $engine quá cũ: Bamboo cần Docker Engine 25 trở lên (https://docs.docker.com/engine/install/)" >&2
        exit 1
    fi
    if [ -n "$compose" ] && older "$compose" 2.20.0; then
        echo "Docker Compose $compose quá cũ: Bamboo cần Docker Compose 2.34 trở lên (gói docker-compose-plugin)" >&2
        exit 1
    fi
    if [ -n "$compose" ] && older "$compose" 2.34.0; then
        echo "CẢNH BÁO: Docker Compose $compose cũ hơn bản khuyên dùng 2.34; gặp lỗi lạ thì nâng cấp trước" >&2
    fi
fi

mode=${BAMBOO_RAM:-$(env_value BAMBOO_RAM)}
if [ -z "$mode" ]; then
    kb=""
    if command -v docker > /dev/null 2>&1; then
        bytes=$(docker info --format '{{.MemTotal}}' 2> /dev/null || true)
        [ -n "$bytes" ] && kb=$((bytes / 1024))
    fi
    [ -z "$kb" ] && [ -r /proc/meminfo ] && kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    [ -z "$kb" ] && kb=$(($(sysctl -n hw.memsize 2> /dev/null || echo 0) / 1024))
    if [ "$kb" -ge $((12 * 1024 * 1024)) ]; then mode=16; else mode=8; fi
    min=${BAMBOO_AI_MIN_RAM_GB:-$(env_value BAMBOO_AI_MIN_RAM_GB)}
    case "${COMPOSE_FILE:-}" in
        *mac.yml*) ;;
        *)
            if awk -v kb="$kb" -v gb="${min:-7}" 'BEGIN { exit !(kb < gb * 1024 * 1024) }'; then
                echo "CẢNH BÁO: Docker chỉ có $((kb / 1024)) MB RAM, dưới ${min:-7} GB: máy không có GPU NVIDIA thì AI (trợ lý, OCR) sẽ tắt; cấp thêm RAM cho Docker để dùng AI trên CPU (ADR #90)" >&2
            fi
            ;;
    esac
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
cpus=${BAMBOO_CPU_LIMIT:-$(env_value BAMBOO_CPU_LIMIT)}
n=""
command -v docker > /dev/null 2>&1 && n=$(docker info --format '{{.NCPU}}' 2> /dev/null || true)
# Không hỏi được Docker thì không giới hạn: số lõi của máy thật (nproc) có thể lớn hơn số lõi máy ảo của Docker
# Desktop, Docker sẽ từ chối tạo container.
case "$n" in '' | *[!0-9]*) n=0 ;; esac
if [ -z "$cpus" ]; then
    reserve=$((n / 4))
    [ "$reserve" -lt 1 ] && reserve=1
    cpus=$((n - reserve))
    if [ "$cpus" -lt 1 ]; then
        cpus=0
    else
        echo "Giới hạn CPU: mỗi dịch vụ nặng (AI, OCR, JVM, Trino, Gotenberg, PostgreSQL) dùng tối đa $cpus/$n lõi để máy không bị đơ; BAMBOO_CPU_LIMIT=0 để bỏ giới hạn" >&2
    fi
fi
case "$cpus" in
    '' | *[!0-9.]* | .*)
        echo "BAMBOO_CPU_LIMIT phải là số lõi (vd. 6 hoặc 2.5), 0 là không giới hạn (đang là '$cpus')" >&2
        exit 1
        ;;
esac
if [ "$n" -gt 0 ] && awk -v c="$cpus" -v n="$n" 'BEGIN { exit !(c > n) }'; then
    echo "BAMBOO_CPU_LIMIT=$cpus lớn hơn số lõi Docker có ($n): dùng $n" >&2
    cpus=$n
fi
echo "export BAMBOO_CPU_LIMIT=$cpus"
case "${COMPOSE_FILE:-$(env_value COMPOSE_FILE)}" in
    *gpu.yml*)
        echo "CẢNH BÁO: COMPOSE_FILE ép GPU (infra/compose/gpu.yml): Docker không cấp được GPU thì Ollama, OCR không chạy và ai-worker chờ mãi; OCR cũng không tự tải PyTorch CUDA. Xóa dòng COMPOSE_FILE trong .env, sleeper tự dò GPU (ADR #79)" >&2
        ;;
esac
# Docker arm64: CSDL và ClamAV bản arm64 thay vì giả lập amd64 (ADR #91); giá trị đặt trong .env được giữ.
arch=""
command -v docker > /dev/null 2>&1 && arch=$(docker info --format '{{.Architecture}}' 2> /dev/null || true)
case "$arch" in
    aarch64 | arm64)
        [ -n "${BAMBOO_DB_IMAGE:-$(env_value BAMBOO_DB_IMAGE)}" ] || echo 'export BAMBOO_DB_IMAGE="imresamu/postgis:17-3.5"'
        [ -n "${BAMBOO_DB_PLATFORM:-$(env_value BAMBOO_DB_PLATFORM)}" ] || echo 'export BAMBOO_DB_PLATFORM="linux/arm64"'
        [ -n "${BAMBOO_CLAMAV_IMAGE:-$(env_value BAMBOO_CLAMAV_IMAGE)}" ] || echo 'export BAMBOO_CLAMAV_IMAGE="clamav/clamav-debian:1.4"'
        echo "Docker arm64: CSDL, ClamAV chạy bản arm64, không qua giả lập" >&2
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
