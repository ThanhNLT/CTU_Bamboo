// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Plus } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import type { ProcessSummary } from "../types";

// ===== Hằng số =====
const RUN_LABEL = { COMPLETED: "chạy thử đạt", STOPPED: "chạy thử dừng", FAILED: "chạy thử lỗi" } as const;

// ===== Component =====
/** Cột trái: các quy trình của tenant (phiên bản phát hành, lần chạy thử gần nhất) và nút tạo quy trình. */
export const SidebarTools = ({
  processes,
  activeId,
  canDesign,
  onSelect,
  onCreate,
}: {
  processes: ProcessSummary[];
  activeId?: string;
  canDesign: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) => (
  <nav
    aria-label="Quy trình"
    className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-white p-2 shadow-card"
  >
    <ul className="m-0 list-none p-0">
      {processes.map((p) => {
        const active = p.id === activeId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "block w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                active ? "bg-bamboo-50" : "hover:bg-canvas",
              )}
            >
              <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                {p.publishedVersion ? `v${p.publishedVersion} đã phát hành` : "Chưa phát hành"}
                {p.lastRunStatus ? ` · ${RUN_LABEL[p.lastRunStatus]}` : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    {processes.length === 0 && <p className="m-0 px-3 py-2 text-[12.5px] text-muted">Chưa có quy trình nào.</p>}
    {canDesign && (
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-bamboo-700 hover:bg-bamboo-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> Tạo quy trình
      </button>
    )}
  </nav>
);
