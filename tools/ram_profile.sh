#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
# Chọn mức RAM (ADR #54) và in các dòng `export` cho `eval`; thông báo mức đã chọn ghi ra stderr.
#   BAMBOO_RAM=8   đầy đủ chức năng kể cả AI, tiết kiệm RAM: heap JVM nhỏ hơn, mỗi lúc một mô hình AI, dịch vụ dùng thưa
#                  (Ollama, OCR, Trino, Tika, Gotenberg) ngủ sớm hơn (ADR #69)
#   BAMBOO_RAM=16  đầy đủ chức năng, giá trị mặc định
# Bỏ trống thì tự chọn theo RAM Docker thấy được (WSL2 mặc định chỉ cấp một nửa RAM máy, nâng bằng .wslconfig).
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
    # máy "16 GB" báo khoảng 15 GiB, máy "8 GB" báo khoảng 7,5 GiB
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
# Giám sát (ADR #75): mức 16 bật nhóm observability (OTel Collector, Jaeger, Prometheus, Grafana) và truy vết;
# mức 8 tắt để tiết kiệm khoảng 1 GB, bật tay bằng BAMBOO_OBSERVABILITY=true. COMPOSE_PROFILES sẵn có được giữ.
# ClamAV (ADR #26, #70): mức 16 bật profile scan và quét thêm bằng ClamAV; mức 8 chỉ bộ quét nội bộ + CDR (ClamAV
# cần thêm 1–2 GB), bật tay bằng BAMBOO_CLAMAV=true. Lần đầu ClamAV tải cơ sở dữ liệu mẫu virus mất vài phút: trong lúc
# đó tải tệp lên báo "chưa quét được virus, thử lại sau".
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
