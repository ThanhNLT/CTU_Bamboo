#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

set -euo pipefail
cd "$(dirname "$0")/.."

OLLAMA="${OLLAMA:-http://127.0.0.1:11434}"
CHAT_MODEL="${AI_CHAT_MODEL:-qwen3:4b}"
EMBED_MODEL="${AI_EMBED_MODEL:-bge-m3}"
KEEP="${DEMO_KEEP_ALIVE:-2h}"
ok=1

fail() { echo "THIẾU  $*"; ok=0; }

echo "== Dịch vụ AI =="
mode=$(docker compose exec -T actions printenv OLLAMA_URL 2> /dev/null | tr -d '\r' || true)
[ -n "$mode" ] && echo "ok     actions có OLLAMA_URL (AI bật)" || fail "OLLAMA_URL trống: chạy lại docker compose up -d (hoặc make up)"
ocr_health=$(curl -fsS http://127.0.0.1:8866/health 2> /dev/null || true)
[ -n "$ocr_health" ] && echo "ok     OCR: $ocr_health" || fail "dịch vụ ocr chưa chạy"

echo "== Làm nóng mô hình (giữ $KEEP) =="
if curl -fsS "$OLLAMA/api/tags" > /dev/null 2>&1; then
    curl -fsS "$OLLAMA/api/embed" -d "{\"model\":\"$EMBED_MODEL\",\"input\":\"khởi động\",\"keep_alive\":\"$KEEP\"}" > /dev/null \
        && echo "ok     $EMBED_MODEL" || fail "không nạp được $EMBED_MODEL"
    curl -fsS "$OLLAMA/api/generate" -d "{\"model\":\"$CHAT_MODEL\",\"stream\":false,\"keep_alive\":\"$KEEP\",\"prompt\":\"ok\",\"options\":{\"num_predict\":1}}" > /dev/null \
        && echo "ok     $CHAT_MODEL" || fail "không nạp được $CHAT_MODEL"
    docker compose exec -T ollama ollama ps || true
    echo "(cột PROCESSOR phải ghi 100% GPU; ai-worker vẫn gỡ mô hình sinh nếu có việc OCR, xem ADR #52)"
else
    fail "Ollama không trả lời ở $OLLAMA"
fi

echo "== Tệp quét đã OCR =="
done_count=$(docker compose exec -T db psql -U bms -d bms -At -c "SELECT count(*) FROM core.attachment_ocr WHERE status = 'DONE'" | tr -d '\r')
if [ "${done_count:-0}" -ge 1 ]; then
    echo "ok     $done_count tệp ở trạng thái Đã OCR"
else
    fail "chưa có tệp nào Đã OCR: đính kèm một báo giá quét (PDF hoặc ảnh) vào một đề nghị rồi chờ nhãn \"Đã OCR\""
fi

echo
if [ "$ok" = 1 ]; then echo "Sẵn sàng."; else echo "Chưa sẵn sàng, xem các dòng THIẾU ở trên."; exit 1; fi
