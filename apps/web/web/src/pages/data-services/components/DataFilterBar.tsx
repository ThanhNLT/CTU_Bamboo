// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { DOMAIN_LABEL, DOMAIN_TOTALS } from "../mock";
import type { DomainFilter } from "../types";

const DOMAINS: DomainFilter[] = ["all", "process", "production", "health", "security"];

/** Ô tìm tập dữ liệu/cột + chip lĩnh vực (kèm tổng số trong danh mục). */
export const DataFilterBar = ({
  query, onQueryChange, domain, onDomainChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  domain: DomainFilter;
  onDomainChange: (d: DomainFilter) => void;
}) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-center">
    <SearchInput
      className="w-full md:w-[340px]"
      value={query}
      onChange={onQueryChange}
      placeholder="Tìm tập dữ liệu, cột"
      label="Tìm tập dữ liệu theo tên, bảng hoặc cột"
    />
    <div className="flex flex-wrap gap-2" role="group" aria-label="Lĩnh vực">
      {DOMAINS.map((d) => {
        const active = d === domain;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            onClick={() => onDomainChange(d)}
            className={cn(
              "h-7 rounded-full px-3 text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
              active ? "bg-bamboo-100 text-bamboo-800" : "bg-black/[0.04] text-body hover:bg-black/[0.07] hover:text-ink",
            )}
          >
            {d === "all" ? "Tất cả" : DOMAIN_LABEL[d]} · <span className="tabular-nums">{DOMAIN_TOTALS[d]}</span>
          </button>
        );
      })}
    </div>
  </div>
);
