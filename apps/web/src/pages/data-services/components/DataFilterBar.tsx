/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { DomainFilter } from "../types";
import { tr } from "../../../i18n";

export const DataFilterBar = ({
  query,
  onQueryChange,
  domain,
  onDomainChange,
  domains,
  total,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  domain: DomainFilter;
  onDomainChange: (d: DomainFilter) => void;
  domains: Array<{ key: string; count: number }>;
  total: number;
}) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-center">
    <SearchInput
      className="w-full md:w-[340px]"
      value={query}
      onChange={onQueryChange}
      placeholder={tr("Tìm tập dữ liệu, cột")}
      label={tr("Tìm tập dữ liệu theo tên, bảng hoặc cột")}
    />
    <div className="flex flex-wrap gap-2" role="group" aria-label={tr("Lĩnh vực")}>
      {[{ key: "all", count: total }, ...domains].map((d) => {
        const active = d.key === domain;
        return (
          <button
            key={d.key}
            type="button"
            aria-pressed={active}
            onClick={() => onDomainChange(d.key)}
            className={cn(
              "h-7 rounded-full px-3 text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
              active
                ? "bg-bamboo-100 text-bamboo-800"
                : "bg-black/[0.04] text-body hover:bg-black/[0.07] hover:text-ink",
            )}
          >
            {d.key === "all" ? tr("Tất cả") : d.key} · <span className="tabular-nums">{d.count}</span>
          </button>
        );
      })}
    </div>
  </div>
);
