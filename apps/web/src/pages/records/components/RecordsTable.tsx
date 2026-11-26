/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import { RefreshCw, SearchX } from "lucide-react";

import { cn } from "../../../utils/cn";
import { DOC_KIND_LABEL } from "../../../api/documents";
import type { EofficeRecord } from "../types";
import { Pagination } from "./Pagination";
import { RecordStatusBadge } from "./RecordStatusBadge";
import { tr } from "../../../i18n";

const TH = "px-3 pb-2 pt-1 text-left text-[12px] font-medium text-muted";

export const RecordsTable = ({
  rows,
  total,
  selectedId,
  onSelect,
  page,
  pageSize,
  onPageChange,
  formatUpdated,
  loading,
  className,
}: {
  rows: EofficeRecord[];
  total: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  formatUpdated: (iso: string) => string;
  loading?: boolean;
  className?: string;
}) => {
  const focusRow = (index: number) => {
    const r = rows[Math.min(rows.length - 1, Math.max(0, index))];
    if (!r) return;
    onSelect(r.id);
    document.getElementById(`rec-row-${r.id}`)?.focus();
  };

  return (
    <section
      aria-label={tr("Danh sách hồ sơ")}
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-surface shadow-card", className)}
    >
      <header className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 px-5 pt-2">
        <h2 className="text-[15px] font-semibold text-ink">
          <span className="tabular-nums">{total}</span> {tr(" hồ sơ")}
        </h2>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> {tr(" Đang tải")}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-2">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <SearchX className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
            <p className="text-[13px] font-medium text-ink">{tr("Không có hồ sơ phù hợp")}</p>
            <p className="text-[12px] text-muted">{tr("Thử đổi tab trạng thái, khoảng thời gian hoặc từ khóa.")}</p>
          </div>
        ) : (
          <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th scope="col" className={TH}>
                  {tr("Hồ sơ")}
                </th>
                <th scope="col" className={cn(TH, "w-[160px]")}>
                  {tr("Trạng thái")}
                </th>
                <th scope="col" className={cn(TH, "w-[150px] text-right")}>
                  {tr("Số tiền")}
                </th>
                <th scope="col" className={cn(TH, "w-[110px]")}>
                  {tr("Cập nhật")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const selected = r.id === selectedId;
                const divider = !selected && rows[i + 1]?.id !== selectedId && i < rows.length - 1;
                const td = cn(
                  "px-3 py-2.5 align-middle transition-colors",
                  selected ? "bg-bamboo-50" : "group-hover:bg-canvas",
                  divider && "border-b border-line/70",
                );
                return (
                  <tr
                    key={r.id}
                    id={`rec-row-${r.id}`}
                    tabIndex={0}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        focusRow(i + (e.key === "ArrowDown" ? 1 : -1));
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r.id);
                      }
                    }}
                    className="group cursor-pointer outline-none focus-visible:[&>td]:bg-bamboo-50/60"
                  >
                    <td className={cn(td, "rounded-l-xl")}>
                      <div className="truncate font-semibold text-ink">{r.title}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted">
                        <span className="font-mono tracking-tight">{r.code}</span> · {DOC_KIND_LABEL[r.type]} ·{" "}
                        {r.submitter}
                      </div>
                    </td>
                    <td className={td}>
                      <RecordStatusBadge status={r.status} label={r.statusLabel} />
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums text-ink")}>{r.amount}</td>
                    <td className={cn(td, "rounded-r-xl whitespace-nowrap text-muted")}>
                      {formatUpdated(r.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-5 py-3">
        <Pagination page={page} pageSize={pageSize} total={total} onChange={onPageChange} />
      </footer>
    </section>
  );
};
