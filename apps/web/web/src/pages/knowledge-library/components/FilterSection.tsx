// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Segmented } from "antd";
import { Search, X } from "lucide-react";
import { cn } from "../../../utils/cn";
import { CATEGORY_LABEL, CATEGORY_TOTALS, SCOPE_OPTIONS } from "../mock";
import type { CategoryFilter, DocCategory, ScopeFilter } from "../types";

const CATEGORIES: CategoryFilter[] = ["all", ...(Object.keys(CATEGORY_LABEL) as DocCategory[])];

/** Ô tìm kiếm + phạm vi (Tất cả / Tập đoàn / Công ty của tôi) + chip loại tài liệu. */
export const FilterSection = ({
  query, onQueryChange, scope, onScopeChange, category, onCategoryChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  scope: ScopeFilter;
  onScopeChange: (s: ScopeFilter) => void;
  category: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">Tìm trong thư viện</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Tìm trong thư viện..."
          className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-9 text-[13.5px] text-ink shadow-card outline-none transition-colors placeholder:text-muted hover:border-bamboo-200 focus:border-bamboo-400 focus:ring-3 focus:ring-bamboo-100 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Xóa từ khóa"
            className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      <Segmented
        className="self-start md:self-auto"
        options={SCOPE_OPTIONS}
        value={scope}
        onChange={(v) => onScopeChange(v as ScopeFilter)}
      />
    </div>

    <div className="flex flex-wrap gap-2" role="group" aria-label="Loại tài liệu">
      {CATEGORIES.map((c) => {
        const active = c === category;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onCategoryChange(c)}
            className={cn(
              "h-7 rounded-full px-3 text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
              active ? "bg-bamboo-100 text-bamboo-800" : "bg-black/[0.04] text-body hover:bg-black/[0.07] hover:text-ink",
            )}
          >
            {c === "all" ? "Tất cả" : CATEGORY_LABEL[c]} · <span className="tabular-nums">{CATEGORY_TOTALS[c]}</span>
          </button>
        );
      })}
    </div>
  </div>
);
