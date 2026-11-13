/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { cn } from "../../../utils/cn";
import type { CategoryFilter } from "../types";
import { CATEGORY_TABS } from "../utils";
import { tr } from "../../../i18n";

export const CategoryTabs = ({
  value,
  counts,
  onChange,
}: {
  value: CategoryFilter;
  counts: Record<CategoryFilter, number>;
  onChange: (c: CategoryFilter) => void;
}) => (
  <div
    role="tablist"
    aria-label={tr("Loại thực thể")}
    className="inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-full bg-black/[0.045] p-1"
  >
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
            active ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {label} <span className={cn("tabular-nums", active ? "text-ink" : "text-muted")}>{counts[key]}</span>
        </button>
      );
    })}
  </div>
);
