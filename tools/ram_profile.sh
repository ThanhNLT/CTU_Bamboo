#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
# Chọn mức RAM (ADR #54) và in các dòng `export` cho `eval`; thông báo mức đã chọn ghi ra stderr.
#   BAMBOO_RAM=8   chỉ chức năng cơ bản, không AI (Ollama, OCR, ai-worker không chạy), heap JVM nhỏ hơn
#   BAMBOO_RAM=16  đầy đủ chức năng
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

services=""
case "$mode" in
    16)
        echo "Mức RAM 16: đầy đủ chức năng, gồm AI (Ollama, OCR ngủ khi nhàn rỗi)" >&2
        ;;
    8)
        # chỉ dựng và chạy các dịch vụ không thuộc AI (Makefile: AI_SERVICES)
        services=$(docker compose config --services | grep -vxE 'ollama-core|ollama-init|ocr-core|ocr-init|ai-worker' | paste -sd' ' -)
        cat << 'VARS'
export OLLAMA_URL=
export KEYCLOAK_HEAP="${KEYCLOAK_HEAP:--Xms64m -Xmx384m}"
export FLOWABLE_JAVA_OPTS="${FLOWABLE_JAVA_OPTS:--Xms64m -Xmx384m}"
export KAFKA_HEAP="${KAFKA_HEAP:--Xms64m -Xmx384m}"
export TIKA_JAVA_OPTS="${TIKA_JAVA_OPTS:--Xmx384m}"
export MEILI_MAX_INDEXING_MEMORY="${MEILI_MAX_INDEXING_MEMORY:-256 MiB}"
export KEYCLOAK_DB_POOL="${KEYCLOAK_DB_POOL:-10}"
export GATEWAY_WORKERS="${GATEWAY_WORKERS:-1}"
export SLEEPER_IDLE_SECONDS="${SLEEPER_IDLE_SECONDS:-120}"
VARS
        echo "Mức RAM 8: chỉ chức năng cơ bản, không AI" >&2
        ;;
    *)
        echo "BAMBOO_RAM phải là 8 hoặc 16 (đang là '$mode')" >&2
        exit 1
        ;;
esac
echo "export BAMBOO_RAM_MODE=$mode"
echo "export BAMBOO_SERVICES='$services'"
