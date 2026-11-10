/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Trash, Users } from "lucide-react";

import { cn } from "../../../utils/cn";
import { formatDate } from "../../../utils/format";
import type { SavedChart } from "../types";
import { CHART_TYPES } from "../chartTypes";
import { tr } from "../../../i18n";

export const SavedCharts = ({
  charts,
  activeId,
  onOpen,
  onDelete,
}: {
  charts: SavedChart[];
  activeId?: string;
  onOpen: (c: SavedChart) => void;
  onDelete: (c: SavedChart) => void;
}) =>
  charts.length === 0 ? (
    <p className="text-[12.5px] text-muted">
      {tr("Chưa có biểu đồ nào được lưu. Dựng biểu đồ rồi bấm Lưu để mở lại nhanh hoặc chia sẻ trong công ty.")}
    </p>
  ) : (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {charts.map((c) => {
        const type = CHART_TYPES.find((t) => t.key === c.chart_type);
        return (
          <li key={c.id} className="min-w-0">
            <div
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                c.id === activeId ? "border-bamboo-300 bg-bamboo-50" : "border-line bg-canvas hover:bg-bamboo-50",
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-ui bg-surface text-bamboo-700"
                  aria-hidden
                >
                  {type?.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{c.name}</span>
                  <span className="flex items-center gap-1 truncate text-[11.5px] text-muted">
                    {!c.is_mine && <Users className="h-3 w-3 shrink-0" aria-label={tr("Được chia sẻ")} />}
                    {c.is_mine && c.shared && <Users className="h-3 w-3 shrink-0" aria-label={tr("Đang chia sẻ")} />}
                    {type?.label} · {formatDate(c.updated_at)}
                  </span>
                </span>
              </button>
              {c.is_mine && (
                <button
                  type="button"
                  onClick={() => onDelete(c)}
                  aria-label={tr("Xóa biểu đồ")}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
