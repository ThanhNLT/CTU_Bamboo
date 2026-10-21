#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

# Smoke test OCR tiếng Việt với dịch vụ `ocr` thật (ADR #52). Chạy khi ocr-init đã tải xong mô hình:
#   docker compose up -d && scripts/ocr_smoke.sh [thư mục mẫu thật]
# Mẫu tổng hợp cần một font có tiếng Việt (mặc định GNU FreeSerif); mẫu thật là cặp ảnh + .txt cùng tên.
set -euo pipefail

FONT="${OCR_SMOKE_FONT:-/usr/share/fonts/gnu-free/FreeSerif.otf}"
SAMPLES="${1:-}"
MAX_CER="${OCR_MAX_CER:-0.05}"

curl -fsS http://127.0.0.1:8866/health || { echo "Dịch vụ OCR chưa chạy (docker compose up -d)"; exit 1; }
echo
args=(--max-cer "$MAX_CER")
docker compose cp scripts/ocr_smoke.py ocr:/tmp/ocr_smoke.py >/dev/null 2>&1
if [[ -f "$FONT" ]]; then
    docker compose cp "$FONT" ocr:/tmp/ocr_smoke_font >/dev/null 2>&1
    args+=(--font /tmp/ocr_smoke_font)
else
    echo "Không thấy font $FONT (đặt OCR_SMOKE_FONT), bỏ qua mẫu tổng hợp"
fi
if [[ -n "$SAMPLES" ]]; then
    docker compose cp "$SAMPLES" ocr:/tmp/ocr_smoke_samples >/dev/null 2>&1
    args+=(--samples /tmp/ocr_smoke_samples)
fi
docker compose exec -T ocr python /tmp/ocr_smoke.py "${args[@]}"
