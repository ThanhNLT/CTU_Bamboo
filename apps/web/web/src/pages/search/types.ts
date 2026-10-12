// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type ResultType = "record" | "document" | "knowledge" | "twin" | "data";
export type Company = "chip" | "phone" | "appliance" | "hospital";
export type SearchMode = "keyword" | "semantic" | "hybrid";
export type SortKey = "relevance" | "newest";
export type TimeRange = "7d" | "30d" | "90d" | "all";

/** Một "ý định" mà bộ hiểu câu hỏi nhận ra (thay cho embedding Qdrant trong bản mẫu). */
export type Concept = {
  key: string;
  /** "nhiệt độ thiết bị vượt ngưỡng" */
  label: string;
  /** Diễn đạt tương đương hiển thị trên banner. */
  synonyms: string[];
  /** Từ (đã bỏ dấu) làm câu hỏi được hiểu theo ý định này. */
  triggers: string[];
  /** Cụm từ được bôi vàng trong kết quả. */
  highlights: string[];
};

/** Tài liệu trong chỉ mục mẫu (các phân hệ chưa nối API thật). */
export type IndexedItem = {
  id: string;
  type: ResultType;
  company: Company;
  title: string;
  breadcrumb: string;
  snippet: string;
  to: string;
  /** Độ khớp ý nghĩa với từng ý định (0–1). */
  concepts: Record<string, number>;
  daysAgo: number;
  /** Nhãn thời gian (ví dụ dữ liệu thời gian thực "Cập nhật 10:42"). */
  updatedLabel?: string;
  mono?: boolean;
};

/** Một dòng kết quả đã chuẩn hóa để hiển thị (mẫu hoặc thật). */
export type SearchResult = {
  key: string;
  type: ResultType;
  /** Không có = dữ liệu thật từ máy chủ (đã lọc theo tenant ở máy chủ). */
  company?: Company;
  title: string;
  /** Tiền tố mono (số chứng từ) đứng trước tiêu đề. */
  code?: string;
  breadcrumb: string;
  snippet?: string;
  /** Đoạn trích HTML do máy chủ trả (đã escape, chỉ có <mark>). */
  snippetHtml?: string;
  to: string;
  semantic?: number;
  keyword: boolean;
  score: number;
  daysAgo?: number;
  updatedLabel?: string;
  matchedField?: string;
  status?: string;
  attachmentId?: string;
  mono?: boolean;
};
