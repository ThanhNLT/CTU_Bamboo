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

# Ollama và OCR chạy thẳng trên macOS Apple Silicon để dùng GPU Metal (ADR #90).
#
#   tools/mac/ai.sh up       dựng Ollama, OCR trên máy (nếu chưa chạy); in ra các biến cho `eval` để docker compose
#                            dùng infra/compose/mac.yml. Máy không phải Mac Apple Silicon, hoặc BAMBOO_GPU=false, thì
#                            không in gì (stack giữ Ollama, OCR trong Docker).
#   tools/mac/ai.sh down     dừng Ollama, OCR do script này dựng (không đụng Ollama.app người dùng tự mở)
#   tools/mac/ai.sh status   Ollama, OCR trên máy có đang chạy không, chạy trên đâu
#   tools/mac/ai.sh compose-file
#                            in COMPOSE_FILE kèm infra/compose/mac.yml khi OCR (và Ollama) do `up` dựng đang chạy, không
#                            in gì nếu không; Makefile dùng để mọi lệnh docker compose (test, migrate...) cùng cấu hình với
#                            `make up`, không dựng lại sleeper mở cổng 11434, 8866 đang thuộc Ollama, OCR trên máy
#
# Docker trên macOS chạy trong máy ảo Linux, không cấp được GPU Apple cho container. `make up` gọi `up`, `make down`
# gọi `down`. Dữ liệu (môi trường Python của OCR, mô hình OCR, log) nằm ở BAMBOO_MAC_DIR, mặc định
# ~/Library/Application Support/Bamboo; mô hình Ollama nằm ở ~/.ollama như Ollama thường dùng.
# Mọi thông báo ra stderr, stdout chỉ có các dòng `export` cho `eval`.

set -euo pipefail
cd "$(dirname "$0")/../.."

OLLAMA_ADDR=127.0.0.1:11434
OCR_PORT=8866
STATE=${BAMBOO_MAC_DIR:-"$HOME/Library/Application Support/Bamboo"}
UV=${UV:-uv}

say() { echo "$*" >&2; }
# Như tools/ram_profile.sh: .env sửa bằng Notepad có CRLF, hoặc giá trị đặt trong nháy.
env_value() { [ -f .env ] && sed -n "s/^[[:space:]]*$1=//p" .env | tail -n1 | tr -d '\r' | sed "s/^[[:space:]]*['\"]\{0,1\}//; s/['\"]\{0,1\}[[:space:]]*\$//" || true; }
setting() { local v="${!1:-}"; [ -n "$v" ] || v=$(env_value "$1"); echo "${v:-$2}"; }

apple_silicon() {
    [ "$(uname -s)" = Darwin ] && [ "$(sysctl -n hw.optional.arm64 2> /dev/null || echo 0)" = 1 ]
}

ollama_up() { curl -fsS -m 2 "http://$OLLAMA_ADDR/api/version" > /dev/null 2>&1; }
ocr_up() { curl -fsS -m 3 "http://127.0.0.1:$OCR_PORT/health" > /dev/null 2>&1; }
# Cổng đang do một container Docker giữ (sleeper của lần chạy AI trong Docker trước đó mở 11434, 8866 tới Ollama, OCR
# trong Docker): trả lời trên cổng đó không phải Ollama, OCR trên máy.
docker_port() { docker ps -q --filter "publish=$1" 2> /dev/null | grep -q .; }

# Tiến trình do script dựng: pid trong $STATE/<tên>.pid, còn sống và đúng là tiến trình đó.
ours() {
    local pid
    pid=$(cat "$STATE/$1.pid" 2> /dev/null || true)
    [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null && echo "$pid"
}

wait_for() {
    local check=$1 seconds=$2 name=$3 i
    for ((i = 0; i < seconds; i++)); do
        "$check" && return 0
        if [ -n "$name" ] && [ -z "$(ours "$name")" ]; then
            return 1
        fi
        sleep 1
    done
    return 1
}

start_ollama() {
    if ollama_up; then
        if [ -z "$(ours ollama)" ]; then
            say "Ollama trên máy đã chạy sẵn (Ollama.app?): dùng nó. Cấu hình của Bamboo (ngữ cảnh 12K, KV cache f16 khi máy từ 16 GB, flash attention) chỉ áp khi script tự dựng Ollama; muốn áp thì thoát Ollama.app rồi chạy lại make up"
        fi
        return 0
    fi
    if ! command -v ollama > /dev/null 2>&1; then
        say "Chưa cài Ollama: brew install ollama (hoặc tải Ollama.app ở https://ollama.com/download) rồi chạy lại make up"
        return 1
    fi
    # Bộ nhớ hợp nhất của Mac là bộ nhớ của GPU: tính theo RAM của máy, không theo RAM cấp cho máy ảo Docker.
    # KV cache (ADR #93, đo trên M1 Pro 16 GB, Qwen3 4B, ngữ cảnh 12K): f16 sinh 33 token/giây, q8_0 và q4_0 chỉ 26 vì
    # GPU Metal phải giải lượng tử từng bước; prefill như nhau. f16 tốn thêm khoảng 1,2 GB (4,1 GB thay vì 2,9 GB), nên
    # chỉ dùng khi máy từ 16 GB; máy 8 GB giữ q4_0. AI_KV_CACHE_TYPE trong .env (không để trống) thắng cả hai.
    local gb models=1 keep=2m kv=q4_0
    gb=$(($(sysctl -n hw.memsize 2> /dev/null || echo 0) / 1024 / 1024 / 1024))
    if [ "$gb" -ge 16 ]; then models=2 keep=5m kv=f16; fi
    kv=$(setting AI_KV_CACHE_TYPE "$kv")
    mkdir -p "$STATE/logs"
    say "Dựng Ollama trên máy (GPU Metal, $gb GB bộ nhớ hợp nhất, KV cache $kv), log ở $STATE/logs/ollama.log"
    OLLAMA_HOST=$OLLAMA_ADDR \
        OLLAMA_NUM_PARALLEL=1 \
        OLLAMA_MAX_LOADED_MODELS=$(setting OLLAMA_MAX_LOADED_MODELS "$models") \
        OLLAMA_KEEP_ALIVE=$(setting AI_KEEP_ALIVE "$keep") \
        OLLAMA_CONTEXT_LENGTH=12288 \
        OLLAMA_FLASH_ATTENTION=1 \
        OLLAMA_KV_CACHE_TYPE=$kv \
        nohup ollama serve >> "$STATE/logs/ollama.log" 2>&1 < /dev/null &
    echo $! > "$STATE/ollama.pid"
    if ! wait_for ollama_up 30 ollama; then
        say "Ollama trên máy không lên sau 30 giây, xem $STATE/logs/ollama.log"
        return 1
    fi
}

start_ocr() {
    ocr_up && return 0
    if ! command -v "$UV" > /dev/null 2>&1; then
        say "Chưa cài uv (cần để dựng OCR trên máy): brew install uv rồi chạy lại make up"
        return 1
    fi
    mkdir -p "$STATE/logs" "$STATE/ocr-models"
    local venv="$STATE/ocr-venv" models="$STATE/ocr-models" gb idle=300
    gb=$(($(sysctl -n hw.memsize 2> /dev/null || echo 0) / 1024 / 1024 / 1024))
    [ "$gb" -ge 16 ] || idle=120
    say "Cài môi trường Python cho OCR (lần đầu tải khoảng 1 GB) vào $venv"
    UV_PROJECT_ENVIRONMENT=$venv "$UV" sync --frozen --no-dev --project services/ocr --python 3.11 >&2 || return 1
    local -a env=(
        OCR_MODELS_DIR="$models"
        PADDLE_PDX_CACHE_HOME="$models/paddlex"
        HF_HOME="$models/huggingface"
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
        OCR_ACCEL_DIR="$STATE/ocr-accel"
        PYTORCH_ENABLE_MPS_FALLBACK=1
        PYTHONUNBUFFERED=1
    )
    say "Kiểm, tải mô hình OCR vào $models (lần đầu cần Internet)"
    (cd services/ocr && env "${env[@]}" "$venv/bin/python" -m app.download >&2) || return 1
    say "Dựng OCR trên máy (VietOCR trên GPU Metal), log ở $STATE/logs/ocr.log"
    # Lệnh nền phải là một lệnh đơn có chuyển hướng: `cd && lệnh &` để cả subshell giữ stdout của `eval "$(...)"`
    # (make up treo) và $! là pid của subshell chứ không phải của OCR.
    (
        cd services/ocr || exit 1
        env "${env[@]}" HF_HUB_OFFLINE=1 \
            OCR_IDLE_SECONDS="$(setting OCR_IDLE_SECONDS "$idle")" OCR_WARM_CACHE=0 OCR_THREADS="$(setting OCR_THREADS '')" \
            nohup "$venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$OCR_PORT" --no-access-log \
            >> "$STATE/logs/ocr.log" 2>&1 < /dev/null &
        echo $! > "$STATE/ocr.pid"
    )
    if ! wait_for ocr_up 60 ocr; then
        say "OCR trên máy không lên sau 60 giây, xem $STATE/logs/ocr.log"
        return 1
    fi
}

stop() {
    local name=$1 pid i
    pid=$(ours "$name") || true
    if [ -n "$pid" ]; then
        kill "$pid" 2> /dev/null || true
        for ((i = 0; i < 30; i++)); do kill -0 "$pid" 2> /dev/null || break; sleep 1; done
        kill -9 "$pid" 2> /dev/null || true
        say "Đã dừng $name trên máy"
    fi
    rm -f "$STATE/$name.pid"
}

cmd_up() {
    apple_silicon || return 0
    case "$(setting BAMBOO_GPU auto)" in
        false | 0 | no | off)
            say "BAMBOO_GPU=false: Ollama, OCR chạy CPU trong Docker"
            return 0
            ;;
    esac
    # infra/compose/mac.yml dùng thẻ !reset, !override của Docker Compose 2.24.4 trở lên.
    local compose
    compose=$(docker compose version --short 2> /dev/null | sed -n 's/^v\{0,1\}\([0-9][0-9.]*\).*/\1/p' | head -n1 || true)
    if [ -n "$compose" ] && awk -v a="$compose" 'BEGIN { split(a, x, "."); split("2.24.4", y, "."); for (i = 1; i <= 3; i++) { if (x[i] + 0 != y[i] + 0) exit !(x[i] + 0 < y[i] + 0) } exit 1 }'; then
        say "Docker Compose $compose cũ hơn 2.24.4, chưa chạy được AI trên GPU Apple: Ollama, OCR chạy CPU trong Docker. Nâng cấp Docker Desktop để dùng GPU"
        return 0
    fi
    mkdir -p "$STATE"
    if docker_port "${OLLAMA_ADDR##*:}" || docker_port "$OCR_PORT"; then
        if ! command -v ollama > /dev/null 2>&1; then
            say "Chưa cài Ollama: brew install ollama uv rồi chạy lại make up để AI dùng GPU Apple; lần này Ollama, OCR chạy CPU trong Docker"
            return 0
        fi
        if ! command -v "$UV" > /dev/null 2>&1; then
            say "Chưa cài uv (cần để dựng OCR trên máy): brew install uv rồi chạy lại make up; lần này Ollama, OCR chạy CPU trong Docker"
            return 0
        fi
        # Chuyển từ AI trong Docker sang AI trên máy: trả cổng 11434, 8866 cho Ollama, OCR trên máy. docker compose up sau
        # đó dựng lại sleeper theo infra/compose/mac.yml (không mở hai cổng này).
        say "Cổng ${OLLAMA_ADDR##*:}, $OCR_PORT đang do container của lần chạy AI trong Docker giữ: dừng sleeper, ollama-core, ocr-core để chuyển AI sang GPU Apple"
        docker compose stop sleeper ollama-core ocr-core > /dev/null 2>&1 || true
        local c
        for c in $(docker ps -q --filter "publish=${OLLAMA_ADDR##*:}") $(docker ps -q --filter "publish=$OCR_PORT"); do
            say "CẢNH BÁO: container $(docker inspect -f '{{.Name}}' "$c" 2> /dev/null) vẫn giữ cổng; Ollama, OCR chạy CPU trong Docker"
            return 0
        done
    fi
    if ! start_ollama || ! start_ocr; then
        stop ocr
        stop ollama
        say "Không dựng được AI trên máy: Ollama, OCR chạy CPU trong Docker (chậm hơn nhiều). Sửa lỗi trên rồi chạy lại make up, hoặc đặt BAMBOO_GPU=false để không thử nữa"
        ollama_up && ! docker_port "${OLLAMA_ADDR##*:}" \
            && say "CẢNH BÁO: cổng 11434 đang có Ollama khác trên máy (Ollama.app?), sleeper không mở được cổng đó: thoát nó trước khi make up"
        return 0
    fi
    # Container Ollama, OCR của lần chạy CPU trước (nếu có) không còn dùng: dừng để trả RAM cho máy ảo Docker.
    docker compose stop ollama-core ocr-core > /dev/null 2>&1 || true
    say "AI chạy trên GPU Apple (Metal): Ollama $(curl -fsS -m 2 "http://$OLLAMA_ADDR/api/version" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'), OCR $(curl -fsS -m 3 "http://127.0.0.1:$OCR_PORT/health" | sed -n 's/.*"device":"\([^"]*\)".*/\1/p')"
    local files
    files=$(setting COMPOSE_FILE compose.yaml)
    case ":$files:" in *:infra/compose/mac.yml:*) ;; *) files="$files:infra/compose/mac.yml" ;; esac
    echo "export COMPOSE_FILE=\"$files\""
    echo "export OLLAMA_URL=\"http://host.docker.internal:11434\""
}

cmd_compose_file() {
    apple_silicon || return 0
    [ -n "$(ours ocr)" ] || return 0
    [ -n "$(ours ollama)" ] || ollama_up || return 0
    local files
    files=$(setting COMPOSE_FILE compose.yaml)
    case ":$files:" in *:infra/compose/mac.yml:*) ;; *) files="$files:infra/compose/mac.yml" ;; esac
    echo "$files"
}

cmd_status() {
    if ollama_up; then
        say "Ollama: chạy ở $OLLAMA_ADDR$([ -n "$(ours ollama)" ] && echo " (do Bamboo dựng)")"
        ollama ps >&2 2> /dev/null || true
    else
        say "Ollama: không chạy"
    fi
    if ocr_up; then
        say "OCR: $(curl -fsS -m 3 "http://127.0.0.1:$OCR_PORT/health")"
    else
        say "OCR: không chạy"
    fi
}

case "${1:-}" in
    up) cmd_up ;;
    down) stop ocr && stop ollama ;;
    status) cmd_status ;;
    compose-file) cmd_compose_file ;;
    *)
        say "Cách dùng: $0 up|down|status|compose-file"
        exit 2
        ;;
esac
