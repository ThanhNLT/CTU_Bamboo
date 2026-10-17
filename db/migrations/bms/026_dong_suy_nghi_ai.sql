-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 026: Dòng suy nghĩ của mô hình trong lượt hỏi Trợ lý RAG.
ALTER TABLE core.ai_question ADD COLUMN IF NOT EXISTS thinking text;
