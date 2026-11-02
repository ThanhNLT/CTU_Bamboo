#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

# Smoke test Trợ lý RAG với Ollama thật (ADR #51, #52). Chạy khi ollama-init đã tải xong mô hình và có dữ liệu demo:
#   docker compose up -d && tools/ai_smoke.sh [--cold]
# Bộ câu hỏi và luật chấm ở tools/ai_smoke_cases.json; mã chấm ở tools/ai_smoke.py.
exec python3 "$(dirname "$0")/ai_smoke.py" "$@"
