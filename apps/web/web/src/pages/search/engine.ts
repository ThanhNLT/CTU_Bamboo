// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Bộ tìm kiếm phía giao diện cho chỉ mục mẫu: hiểu ý định, khớp từ khóa (không dấu), chấm điểm theo chế độ,
// phân quyền theo công ty, đếm bộ lọc và tô sáng. Không phụ thuộc React.
import { fold } from "../../utils/text";
import { CONCEPTS, SEARCH_INDEX } from "./mock";
import type { Company, Concept, ResultType, SearchMode, SearchResult, SortKey, TimeRange } from "./types";

/** Từ quá phổ biến, bỏ khi khớp từ khóa và tô sáng ("máy bị nóng quá" → "nóng"). */
const STOPWORDS = new Set(["may", "bi", "qua", "cua", "la", "va", "cho", "the", "nao", "sao", "gi", "co", "khong", "nhu", "rat", "bao", "nhieu", "o"]);

/** Từ có nghĩa trong câu hỏi, đã bỏ dấu. Giữ "-", "_", "." để tìm được mã như HS-SEMI-2026-00125. */
export const queryTokens = (q: string) =>
  fold(q)
    .split(/[^\p{L}\p{N}\-_.]+/u)
    .map((t) => t.replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

export const detectConcepts = (q: string): Concept[] => {
  const f = fold(q);
  return CONCEPTS.filter((c) => c.triggers.some((t) => f.includes(t)));
};

/** Công ty được xem theo tenant đang chọn. Bệnh viện là tenant riêng (dữ liệu người bệnh). */
export const permittedCompanies = (tenantName: string): Company[] => {
  const n = fold(tenantName);
  if (n.includes("benh vien")) return ["hospital"];
  if (n.includes("chip")) return ["chip"];
  if (n.includes("dien thoai")) return ["phone"];
  if (n.includes("gia dung")) return ["appliance"];
  return ["chip", "phone", "appliance"];
};

/** Chọn sẵn như thiết kế: bỏ "Gia dụng" khi được xem nhiều công ty. */
export const defaultCompanies = (permitted: Company[]) =>
  permitted.length > 1 ? permitted.filter((c) => c !== "appliance") : permitted;

/** Tìm trong chỉ mục mẫu (chưa áp quyền / bộ lọc). */
export const searchIndex = (q: string, mode: SearchMode): SearchResult[] => {
  const tokens = queryTokens(q);
  const concepts = mode === "keyword" ? [] : detectConcepts(q);
  // Không nhận ra ý định thì "Ngữ nghĩa" quay về khớp từ khóa thay vì trả về rỗng.
  const useKeyword = mode !== "semantic" || concepts.length === 0;
  if (!tokens.length && !concepts.length) return [];

  return SEARCH_INDEX.flatMap((item): SearchResult[] => {
    const hay = fold(`${item.title} ${item.breadcrumb} ${item.snippet}`);
    const keyword = useKeyword && tokens.length > 0 && tokens.every((t) => hay.includes(t));
    const sem = Math.max(0, ...concepts.map((c) => item.concepts[c.key] ?? 0));
    const semantic = sem >= 0.5 ? sem : undefined;
    if (!keyword && semantic == null) return [];
    const score = Math.min(0.99, Math.max(semantic ?? 0, keyword ? 0.6 : 0) + (keyword && semantic != null ? 0.05 : 0));
    return [{
      key: `idx:${item.id}`, type: item.type, company: item.company, title: item.title, breadcrumb: item.breadcrumb,
      snippet: item.snippet, to: item.to, semantic, keyword, score, daysAgo: item.daysAgo,
      updatedLabel: item.updatedLabel, mono: item.mono,
    }];
  });
};

export const TIME_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90, all: Infinity };

export type Filters = { types: ResultType[]; companies: Company[]; range: TimeRange };

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

/** Cụm từ để tô sáng: từ trong câu hỏi + cụm của các ý định nhận ra. */
export const highlightTerms = (q: string, mode: SearchMode) => {
  const terms = new Set(queryTokens(q));
  if (mode !== "keyword") for (const c of detectConcepts(q)) for (const h of c.highlights) terms.add(fold(h));
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
