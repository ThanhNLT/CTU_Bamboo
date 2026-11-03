// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { fold } from "../../utils/text";
import type { Company, ResultType, SearchResult, SortKey, TimeRange } from "./types";
import { trf } from "../../i18n";

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

export const queryTokens = (q: string) =>
  fold(q)
    .split(/[^\p{L}\p{N}\-_.]+/u)
    .map((t) => t.replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

export const TIME_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90, all: Infinity };

export type Filters = { types: ResultType[]; companies: Company[]; range: TimeRange };

const inTime = (r: SearchResult, range: TimeRange) => r.daysAgo == null || r.daysAgo <= TIME_DAYS[range];
const inCompany = (r: SearchResult, companies: Company[]) => r.company == null || companies.includes(r.company);

export const applyFilters = (rows: SearchResult[], f: Filters) =>
  rows.filter((r) => f.types.includes(r.type) && inCompany(r, f.companies) && inTime(r, f.range));

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

export const highlightTerms = (q: string) => {
  const terms = new Set(queryTokens(q));
  return [...terms].sort((a, b) => b.length - a.length);
};

export type Segment = { text: string; mark: boolean };

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

export const formatSeconds = (ms: number) => trf("{0} giây", [(Math.max(ms, 10) / 1000).toFixed(2).replace(".", ",")]);
