// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { ChevronLeft, ChevronRight } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import { pageList } from "../utils";

// ===== Hằng số =====
const btn =
  "grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[12px] tabular-nums transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500 disabled:cursor-default disabled:opacity-40";

// ===== Component =====
/** "1–20 trên 128 hồ sơ" + nút trang tròn. */
export const Pagination = ({
  page,
  pageSize,
  total,
  onChange,
  unit = "hồ sơ",
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
    <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[12px] tabular-nums text-muted">
        {from}–{to} trên {total} {unit}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(btn, "bg-canvas text-body hover:bg-gray-200/70")}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Trang trước"
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
          aria-label="Trang sau"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
};
