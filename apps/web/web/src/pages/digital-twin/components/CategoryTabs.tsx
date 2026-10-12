// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import type { CategoryFilter } from "../types";
import { CATEGORY_TABS } from "../utils";

/** Tab phân loại thực thể dạng viên thuốc, kèm số lượng. */
export const CategoryTabs = ({
  value, counts, onChange,
}: {
  value: CategoryFilter;
  counts: Record<CategoryFilter, number>;
  onChange: (c: CategoryFilter) => void;
}) => (
  <div role="tablist" aria-label="Loại thực thể" className="inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-full bg-black/[0.045] p-1">
    {CATEGORY_TABS.map(({ key, label }) => {
      const active = key === value;
      return (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(key)}
          className={cn(
            "h-8 rounded-full px-3.5 text-[12.5px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
            active ? "bg-white font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {label} <span className={cn("tabular-nums", active ? "text-ink" : "text-muted")}>{counts[key]}</span>
        </button>
      );
    })}
  </div>
);
