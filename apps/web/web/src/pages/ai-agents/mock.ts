// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu mẫu cổng quản trị tác tử (thay cho API thống kê của gateway trợ lý). Các con số khớp nhau:
// tổng phiên 24 giờ = 412 (cộng từ bảng), tỉ lệ lỗi 1,9% = 29 lỗi / 1.510 lượt gọi công cụ, hữu ích 81% = 191/236.
// Tác tử "Phân tích & dự báo" là tác tử Trợ lý đa năng dùng để trả lời câu hỏi OEE (query_metric, forecast_metric).
import type { Agent, DayStat, GuardKey } from "./types";

export const DAYS = ["30/09", "01/10", "02/10", "03/10", "04/10", "05/10", "06/10"];
export const RUNTIME_NOTE = "Ollama · máy chủ GPU nội bộ";
export const MODELS = ["Qwen3-8B", "Qwen3-14B", "Qwen3-32B"];
export const TOOL_CATALOG = [
  "search_docs", "cite", "create_draft", "get_document", "query_metric", "forecast_metric",
  "get_twin_history", "ocr_extract", "summarize", "find_records",
];
export const SCOPE_OPTIONS = ["Hồ sơ e-Office", "Thư viện tri thức", "Ổ đĩa tài liệu", "Dữ liệu sản xuất", "Bản sao số", "Sổ cái"];

export const GUARD_INFO: Record<GuardKey, { label: string; description: string }> = {
  "scope-guard": { label: "scope-guard", description: "Chặn truy vấn dữ liệu ngoài công ty / ngoài quyền của người hỏi" },
  "pii-guard": { label: "pii-guard", description: "Che số điện thoại, CCCD, số tài khoản trong câu trả lời" },
  "prompt-guard": { label: "prompt-guard", description: "Chặn chỉ dẫn lạ chèn trong tệp, trang web, kết quả công cụ" },
};

export const KPI_STATIC = {
  sessionsDelta: "8% so với hôm qua",
  errorThreshold: 3,
  p95: 6.8,
  p95Target: 8,
};

const week = (success: number[], errors: number[]): DayStat[] =>
  DAYS.map((day, i) => ({ day, success: (success[i] ?? 0) - (errors[i] ?? 0), errors: errors[i] ?? 0 }));

const allOn = { "scope-guard": true, "pii-guard": true, "prompt-guard": true };

export const AGENTS: Agent[] = [
  {
    id: "ag-knowledge", name: "Trợ lý tri thức", description: "RAG quy chế, tài liệu", model: "Qwen3-14B",
    tools: ["search_docs", "cite"], status: "active",
    sessions24h: 168, calls24h: 500, errors24h: 3, p95: 5.2, ratingsUp: 92, ratingsTotal: 108,
    week: week([158, 171, 149, 180, 166, 172, 168], [1, 0, 2, 1, 1, 0, 1]),
    toolStats: [
      { name: "search_docs", calls: 312, errors: 2, p95: 1.4, scope: "Thư viện tri thức" },
      { name: "cite", calls: 188, errors: 1, p95: 0.3, scope: "Thư viện tri thức" },
    ],
    events: [
      { id: "e1", title: "Hỏi lương của người khác", at: "10:05", source: "người dùng TQ", guard: "scope-guard", action: "blocked" },
    ],
    sessions: [
      { id: "s1", at: "10:31", user: "N. Tùng", question: "Quy chế phòng sạch khi vượt ngưỡng hạt bụi?", tools: ["search_docs", "cite"], seconds: 3.1, ok: true, rating: "up" },
      { id: "s2", at: "10:12", user: "L. Hà", question: "Xử lý tràn đổ hóa chất thế nào?", tools: ["search_docs", "cite"], seconds: 2.7, ok: true },
      { id: "s3", at: "09:48", user: "P. Long", question: "Chu kỳ hiệu chuẩn máy đếm hạt?", tools: ["search_docs"], seconds: 2.2, ok: true, rating: "up" },
    ],
    guards: allOn,
    config: {
      temperature: 0.2, maxTokens: 1024, scopes: ["Thư viện tri thức"], retentionDays: 30,
      systemPrompt: "Bạn trả lời dựa trên tài liệu được trích. Mỗi ý phải có trích nguồn [n]. Không có nguồn thì nói không biết.",
    },
  },
  {
    id: "ag-eoffice", name: "Trợ lý e-Office", description: "Tạo nháp, tra hồ sơ", model: "Qwen3-14B",
    tools: ["create_draft", "get_document"], status: "active",
    sessions24h: 97, calls24h: 300, errors24h: 3, p95: 7.4, ratingsUp: 43, ratingsTotal: 54,
    week: week([88, 95, 90, 101, 94, 99, 97], [1, 1, 0, 2, 1, 1, 1]),
    toolStats: [
      { name: "get_document", calls: 214, errors: 1, p95: 0.8, scope: "Hồ sơ e-Office" },
      { name: "create_draft", calls: 86, errors: 2, p95: 2.9, scope: "Hồ sơ e-Office" },
    ],
    events: [
      { id: "e1", title: "Bản nháp chứa số CCCD", at: "09:20", source: "pii-guard", guard: "pii-guard", action: "masked" },
    ],
    sessions: [
      { id: "s1", at: "10:40", user: "T. Quân", question: "Tạo báo cáo tuần cho SMT-02", tools: ["get_document", "create_draft"], seconds: 6.2, ok: true, rating: "up" },
      { id: "s2", at: "10:02", user: "N. An", question: "Tóm tắt ECR-88", tools: ["get_document"], seconds: 3.9, ok: true },
      { id: "s3", at: "09:15", user: "L. Hà", question: "Soạn công văn nhắc nhà cung cấp CMP", tools: ["create_draft"], seconds: 7.8, ok: false },
    ],
    guards: allOn,
    config: {
      temperature: 0.3, maxTokens: 2048, scopes: ["Hồ sơ e-Office", "Ổ đĩa tài liệu"], retentionDays: 30,
      systemPrompt: "Chỉ tạo hồ sơ ở trạng thái Nháp khi người dùng xác nhận. Không tự gửi duyệt, không tự ký.",
    },
  },
  {
    id: "ag-analytics", name: "Phân tích & dự báo", description: "Chỉ số, dự báo chuỗi thời gian", model: "Qwen3-32B",
    tools: ["query_metric", "forecast_metric", "get_document"], status: "active",
    sessions24h: 74, calls24h: 336, errors24h: 9, p95: 9.1, ratingsUp: 29, ratingsTotal: 38,
    week: week([63, 70, 60, 81, 77, 69, 71], [2, 1, 3, 2, 1, 2, 2]),
    toolStats: [
      { name: "query_metric", calls: 205, errors: 5, p95: 1.2, scope: "Dữ liệu sản xuất" },
      { name: "forecast_metric", calls: 91, errors: 4, p95: 3.4, scope: "Dữ liệu sản xuất" },
      { name: "get_document", calls: 40, errors: 0, p95: 0.7, scope: "Hồ sơ e-Office" },
    ],
    events: [
      { id: "e1", title: "Truy vấn dữ liệu ngoài phạm vi công ty", at: "09:12", source: "người dùng NA", guard: "scope-guard", action: "blocked" },
      { id: "e2", title: "Câu trả lời chứa số điện thoại", at: "08:40", source: "pii-guard", guard: "pii-guard", action: "masked" },
      { id: "e3", title: "Chỉ dẫn lạ trong tệp đính kèm", at: "07:55", source: "prompt-guard", guard: "prompt-guard", action: "blocked" },
    ],
    sessions: [
      { id: "s1", at: "10:42", user: "N. An", question: "Vì sao OEE tuần này giảm? Dự báo tuần tới thế nào?", tools: ["query_metric", "get_twin_history", "forecast_metric"], seconds: 1.9, ok: true, rating: "up" },
      { id: "s2", at: "10:20", user: "T. Quân", question: "So sánh OEE với cùng kỳ năm trước", tools: ["query_metric"], seconds: 2.4, ok: true },
      { id: "s3", at: "09:12", user: "N. An", question: "OEE của công ty Gia dụng tuần 40?", tools: ["query_metric"], seconds: 0.6, ok: false },
      { id: "s4", at: "08:31", user: "P. Long", question: "Dự báo tồn kho chip PMIC tháng 11", tools: ["forecast_metric"], seconds: 8.6, ok: true, rating: "down" },
    ],
    guards: allOn,
    config: {
      temperature: 0.1, maxTokens: 2048, scopes: ["Dữ liệu sản xuất", "Bản sao số"], retentionDays: 30,
      systemPrompt: "Mọi con số phải lấy từ công cụ query_metric / forecast_metric, kèm phương pháp và khoảng tin cậy. Không ước lượng bằng lời.",
    },
  },
  {
    id: "ag-operations", name: "Vận hành", description: "Bản sao số, cảnh báo thiết bị", model: "Qwen3-14B",
    tools: ["get_twin_history"], status: "active",
    sessions24h: 51, calls24h: 210, errors24h: 4, p95: 4.8, ratingsUp: 20, ratingsTotal: 26,
    week: week([47, 52, 44, 55, 50, 49, 51], [1, 0, 1, 1, 1, 0, 1]),
    toolStats: [{ name: "get_twin_history", calls: 210, errors: 4, p95: 0.9, scope: "Bản sao số" }],
    events: [],
    sessions: [
      { id: "s1", at: "10:35", user: "N. Tùng", question: "Vì sao CR-02 vượt ngưỡng?", tools: ["get_twin_history"], seconds: 2.0, ok: true, rating: "up" },
      { id: "s2", at: "10:28", user: "T. Quân", question: "Chênh áp CR-02 hiện thế nào?", tools: ["get_twin_history"], seconds: 1.4, ok: true },
    ],
    guards: allOn,
    config: {
      temperature: 0.2, maxTokens: 1024, scopes: ["Bản sao số"], retentionDays: 30,
      systemPrompt: "Chỉ đọc dữ liệu cảm biến; không gửi lệnh điều khiển xuống thiết bị.",
    },
  },
  {
    id: "ag-ocr", name: "Tài liệu & OCR", description: "Tóm tắt, trích xuất trường", model: "Qwen3-8B",
    tools: ["ocr_extract", "summarize"], status: "paused",
    sessions24h: 22, calls24h: 164, errors24h: 10, p95: 12.3, ratingsUp: 7, ratingsTotal: 10,
    week: week([30, 28, 33, 26, 31, 24, 22], [2, 1, 2, 3, 2, 1, 2]),
    toolStats: [
      { name: "ocr_extract", calls: 98, errors: 8, p95: 9.8, scope: "Ổ đĩa tài liệu" },
      { name: "summarize", calls: 66, errors: 2, p95: 4.1, scope: "Ổ đĩa tài liệu" },
    ],
    events: [
      { id: "e1", title: "Tệp PDF chứa chỉ dẫn ẩn", at: "07:31", source: "prompt-guard", guard: "prompt-guard", action: "blocked" },
      { id: "e2", title: "Ảnh chụp chứa số tài khoản", at: "06:50", source: "pii-guard", guard: "pii-guard", action: "masked" },
    ],
    sessions: [
      { id: "s1", at: "08:02", user: "L. Hà", question: "Trích xuất phiếu yêu cầu bảo trì BM-BT-02", tools: ["ocr_extract"], seconds: 11.9, ok: false },
      { id: "s2", at: "07:44", user: "P. Long", question: "Tóm tắt biên bản bàn giao W-77", tools: ["summarize"], seconds: 5.2, ok: true },
    ],
    guards: allOn,
    config: {
      temperature: 0.0, maxTokens: 4096, scopes: ["Ổ đĩa tài liệu"], retentionDays: 7,
      systemPrompt: "Chỉ trích xuất đúng chữ trên giấy; trường không đọc được thì để trống và báo độ tin cậy.",
    },
  },
];

export const DEFAULT_AGENT_ID = "ag-analytics";
