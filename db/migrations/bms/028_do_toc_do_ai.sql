-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 028: Đo tốc độ lượt hỏi Trợ lý RAG: lúc chữ đầu tiên xuất hiện và lượt có phải chờ nạp mô hình sinh không.
ALTER TABLE core.ai_question
    ADD COLUMN IF NOT EXISTS first_token_at timestamptz,
    ADD COLUMN IF NOT EXISTS cold_start boolean;
