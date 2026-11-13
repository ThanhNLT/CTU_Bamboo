#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

FONT="${OCR_SMOKE_FONT:-/usr/share/fonts/gnu-free/FreeSerif.otf}"
SAMPLES="${1:-}"
MAX_CER="${OCR_MAX_CER:-0.05}"

curl -fsS -m 200 http://127.0.0.1:8866/health || { echo "Dịch vụ OCR chưa chạy (docker compose up -d)"; exit 1; }
echo
args=(--max-cer "$MAX_CER" --url http://ocr:8000)
docker compose cp tools/ocr_smoke.py ocr-core:/tmp/ocr_smoke.py >/dev/null 2>&1
if [[ -f "$FONT" ]]; then
    docker compose cp "$FONT" ocr-core:/tmp/ocr_smoke_font >/dev/null 2>&1
    args+=(--font /tmp/ocr_smoke_font)
else
    echo "Không thấy font $FONT (đặt OCR_SMOKE_FONT), bỏ qua mẫu tổng hợp"
fi
if [[ -n "$SAMPLES" ]]; then
    docker compose cp "$SAMPLES" ocr-core:/tmp/ocr_smoke_samples >/dev/null 2>&1
    args+=(--samples /tmp/ocr_smoke_samples)
fi
docker compose exec -T ocr-core python /tmp/ocr_smoke.py "${args[@]}"
