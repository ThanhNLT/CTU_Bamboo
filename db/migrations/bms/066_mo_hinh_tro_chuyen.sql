-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

-- Mô hình trò chuyện mặc định đổi từ `qwen3:4b` sang `qwen3:4b-instruct-2507-q4_K_M` (ADR #93). Thẻ `qwen3:4b` của
-- kho Ollama là Qwen3-4B bản thinking-2507: tắt suy nghĩ vẫn lập luận 800–2.000 token trước câu trả lời (ADR #89),
-- mỗi lượt hỏi mất 45–65 giây trên Apple M1 Pro; bản instruct-2507 cùng kích thước, cùng giấy phép Apache-2.0, trả lời
-- thẳng. Tác tử đang dùng mô hình mặc định cũ chuyển sang mô hình mới (`ollama-init` chỉ tải mô hình trong
-- AI_CHAT_MODEL); lịch sử lượt hỏi (`core.ai_question.model`) giữ nguyên tên mô hình đã trả lời.

UPDATE core.ai_agent SET model = 'qwen3:4b-instruct-2507-q4_K_M' WHERE model = 'qwen3:4b';
