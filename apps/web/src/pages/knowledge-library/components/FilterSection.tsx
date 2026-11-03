// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Segmented } from "antd";

import { SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { CATEGORY_LABEL, SCOPE_OPTIONS } from "../labels";
import type { CategoryFilter, DocCategory, ScopeFilter } from "../types";
import { tr } from "../../../i18n";

const CATEGORIES: CategoryFilter[] = ["all", ...(Object.keys(CATEGORY_LABEL) as DocCategory[])];

export const FilterSection = ({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  category,
  onCategoryChange,
  counts,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  scope: ScopeFilter;
  onScopeChange: (s: ScopeFilter) => void;
  category: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
  counts: Partial<Record<CategoryFilter, number>>;
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <SearchInput
        className="flex-1"
        value={query}
        onChange={onQueryChange}
        placeholder={tr("Tìm trong thư viện...")}
        label={tr("Tìm trong thư viện")}
      />
      <Segmented
        className="self-start md:self-auto"
        options={SCOPE_OPTIONS}
        value={scope}
        onChange={(v) => onScopeChange(v as ScopeFilter)}
      />
    </div>

    <div className="flex flex-wrap gap-2" role="group" aria-label={tr("Loại tài liệu")}>
      {CATEGORIES.map((c) => {
        const active = c === category;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onCategoryChange(c)}
            className={cn(
              "h-7 rounded-ui px-3 text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
              active
                ? "bg-bamboo-100 text-bamboo-800"
                : "bg-black/[0.04] text-body hover:bg-black/[0.07] hover:text-ink",
            )}
          >
            {c === "all" ? tr("Tất cả") : CATEGORY_LABEL[c]} · <span className="tabular-nums">{counts[c] ?? 0}</span>
          </button>
        );
      })}
    </div>
  </div>
);
