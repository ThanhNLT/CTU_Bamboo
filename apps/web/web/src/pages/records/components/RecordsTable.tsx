// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { RefreshCw, SearchX } from "lucide-react";
import { cn } from "../../../utils/cn";
import type { EofficeRecord, Sla } from "../types";
import { Pagination } from "./Pagination";
import { RecordStatusBadge } from "./RecordStatusBadge";

const SlaCell = ({ sla }: { sla: Sla }) => {
  if (sla.kind === "overdue") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
        {sla.label}
      </span>
    );
  }
  if (sla.kind === "remaining") return <span className="whitespace-nowrap text-ink">{sla.label}</span>;
  if (sla.kind === "ontime") return <span className="text-muted">Đúng hạn</span>;
  return <span className="text-muted" aria-label="Chưa áp dụng">—</span>;
};

const TH = "px-3 pb-2 pt-1 text-left text-[12px] font-medium text-muted";

/**
 * Bảng hồ sơ (cột trái). Phần thân cuộn độc lập; tiêu đề cột dính trên cùng khi cuộn.
 * Mũi tên lên/xuống trên một dòng chuyển hồ sơ đang chọn.
 */
export const RecordsTable = ({
  rows, total, selectedId, onSelect, page, pageSize, onPageChange, pendingUpdates, onRefresh, className,
}: {
  rows: EofficeRecord[];
  total: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  pendingUpdates: number;
  onRefresh: () => void;
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
      aria-label="Danh sách hồ sơ"
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-white shadow-card", className)}
    >
      <header className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 px-5 pt-2">
        <h2 className="text-[15px] font-semibold text-ink">
          <span className="tabular-nums">{total}</span> hồ sơ
        </h2>
        {pendingUpdates > 0 && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-bamboo-100 bg-bamboo-50 px-3 text-[11.5px] font-medium text-bamboo-700 transition-colors hover:bg-bamboo-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Có {pendingUpdates} cập nhật mới · Làm mới
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-2">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <SearchX className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
            <p className="text-[13px] font-medium text-ink">Không có hồ sơ phù hợp</p>
            <p className="text-[12px] text-muted">Thử đổi tab trạng thái, khoảng thời gian hoặc từ khóa.</p>
          </div>
        ) : (
          <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th scope="col" className={TH}>Hồ sơ</th>
                <th scope="col" className={cn(TH, "w-[160px]")}>Trạng thái</th>
                <th scope="col" className={cn(TH, "w-[150px]")}>Hạn SLA</th>
                <th scope="col" className={cn(TH, "w-[110px]")}>Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const selected = r.id === selectedId;
                // Đường kẻ dưới mỗi dòng; ẩn quanh dòng đang chọn để nền xanh bo góc liền mạch.
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
                        <span className="font-mono tracking-tight">{r.code}</span> · {r.submitter}
                      </div>
                    </td>
                    <td className={td}><RecordStatusBadge status={r.status} /></td>
                    <td className={td}><SlaCell sla={r.sla} /></td>
                    <td className={cn(td, "rounded-r-xl whitespace-nowrap text-muted")}>{r.updatedLabel}</td>
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
