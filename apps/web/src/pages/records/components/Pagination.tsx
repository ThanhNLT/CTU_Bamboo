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

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../../../utils/cn";
import { pageList } from "../utils";
import { tr } from "../../../i18n";

const btn =
  "grid h-7 min-w-7 place-items-center rounded-ui px-1.5 text-[12px] tabular-nums transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500 disabled:cursor-default disabled:opacity-40";

export const Pagination = ({
  page,
  pageSize,
  total,
  onChange,
  unit = tr("hồ sơ"),
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  unit?: string;
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label={tr("Phân trang")} className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[12px] tabular-nums text-muted">
        {from}–{to} {tr(" trên ")} {total} {unit}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(btn, "bg-canvas text-body hover:bg-gray-200/70")}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label={tr("Trang trước")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-[12px] text-muted" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                btn,
                p === page ? "bg-bamboo-600 font-semibold text-white" : "bg-canvas text-body hover:bg-gray-200/70",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(btn, "bg-canvas text-body hover:bg-gray-200/70")}
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label={tr("Trang sau")}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
};
