// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Phép tính phía giao diện trên kết quả tìm kiếm: lọc, đếm bộ lọc, sắp xếp, tô sáng (khớp không dấu).
// Không phụ thuộc React.

// ===== Module nội bộ =====
import { fold } from "../../utils/text";
import type { Company, ResultType, SearchResult, SortKey, TimeRange } from "./types";

// ===== Hằng số =====
/** Từ quá phổ biến, bỏ khi khớp từ khóa và tô sáng ("máy bị nóng quá" → "nóng"). */
const STOPWORDS = new Set([
  "may",
  "bi",
  "qua",
  "cua",
  "la",
  "va",
  "cho",
  "the",
  "nao",
  "sao",
  "gi",
  "co",
  "khong",
  "nhu",
  "rat",
  "bao",
  "nhieu",
  "o",
]);

// ===== Hàm tiện ích =====
/** Từ có nghĩa trong câu hỏi, đã bỏ dấu. Giữ "-", "_", "." để tìm được mã như HS-SEMI-2026-00125. */
export const queryTokens = (q: string) =>
  fold(q)
    .split(/[^\p{L}\p{N}\-_.]+/u)
    .map((t) => t.replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

// ===== Hằng số =====
export const TIME_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90, all: Infinity };

// ===== Kiểu dữ liệu =====
export type Filters = { types: ResultType[]; companies: Company[]; range: TimeRange };

// ===== Hàm tiện ích =====
const inTime = (r: SearchResult, range: TimeRange) => r.daysAgo == null || r.daysAgo <= TIME_DAYS[range];
/** Kết quả thật không có `company` (máy chủ đã lọc theo tenant) → không bị bộ lọc công ty loại. */
const inCompany = (r: SearchResult, companies: Company[]) => r.company == null || companies.includes(r.company);

export const applyFilters = (rows: SearchResult[], f: Filters) =>
  rows.filter((r) => f.types.includes(r.type) && inCompany(r, f.companies) && inTime(r, f.range));

/** Số đếm cạnh mỗi lựa chọn: tính với các bộ lọc KHÁC đang áp (kiểu tìm kiếm có mặt cắt). */
export const facetCounts = (rows: SearchResult[], f: Filters) => {
  const types = {} as Record<ResultType, number>;
  const companies = {} as Record<Company, number>;
  for (const r of rows) {
    if (!inTime(r, f.range)) continue;
    if (inCompany(r, f.companies)) types[r.type] = (types[r.type] ?? 0) + 1;
    if (r.company && f.types.includes(r.type)) companies[r.company] = (companies[r.company] ?? 0) + 1;
  }
  return { types, companies };
};

export const sortResults = (rows: SearchResult[], sort: SortKey) =>
  [...rows].sort((a, b) =>
    sort === "newest" ? (a.daysAgo ?? -1) - (b.daysAgo ?? -1) || b.score - a.score : b.score - a.score,
  );

/** Cụm từ để tô sáng: các từ có nghĩa trong câu hỏi. */
export const highlightTerms = (q: string) => {
  const terms = new Set(queryTokens(q));
  // Cụm dài trước để "quá nhiệt" thắng "nhiệt".
  return [...terms].sort((a, b) => b.length - a.length);
};

export type Segment = { text: string; mark: boolean };

/**
 * Tách văn bản thành đoạn thường / đoạn tô sáng, khớp không dấu nhưng giữ nguyên chữ gốc.
 * Chỉ khớp khi cụm bắt đầu ở đầu một từ (tránh tô "on" giữa "phòng").
 */
export const highlight = (text: string, terms: string[]): Segment[] => {
  if (!terms.length || !text) return [{ text, mark: false }];
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i] ?? "");
    for (let k = 0; k < f.length; k++) {
      folded += f[k];
      origin.push(i);
    }
  }
  const isWordChar = (ch: string | undefined) => ch != null && /[\p{L}\p{N}]/u.test(ch);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(t, from);
      if (at < 0) break;
      from = at + 1;
      if (isWordChar(folded[at - 1])) continue;
      const start = origin[at] ?? 0;
      const end = origin[at + t.length - 1] ?? start;
      for (let i = start; i <= end; i++) marked[i] = true;
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const m = marked[i] ?? false;
    const last = out[out.length - 1];
    if (last && last.mark === m) last.text += text[i];
    else out.push({ text: text[i] ?? "", mark: m });
  }
  return out;
};

/** "0,12 giây" */
export const formatSeconds = (ms: number) => `${(Math.max(ms, 10) / 1000).toFixed(2).replace(".", ",")} giây`;
