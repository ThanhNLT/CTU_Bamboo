// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Pause, Play } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import { RUNTIME_NOTE } from "../mock";
import type { Agent } from "../types";
import { STATUS, errorRate, num, pct } from "../utils";

// ===== Hằng số =====
const MAX_TOOLS = 2;

// ===== Component =====
/** Bảng tác tử đã đăng ký. Bấm một dòng để xem phân tích chi tiết bên dưới. */
export const AiAgentsTable = ({
  agents,
  selectedId,
  errorThreshold,
  onSelect,
  onPause,
  onResume,
}: {
  agents: Agent[];
  selectedId: string;
  errorThreshold: number;
  onSelect: (id: string) => void;
  onPause: (a: Agent) => void;
  onResume: (a: Agent) => void;
}) => (
  <section aria-label="Tác tử đã đăng ký" className="rounded-2xl border border-line bg-white p-5 shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold text-ink">Tác tử đã đăng ký</h2>
      <span className="text-[11.5px] text-muted">{RUNTIME_NOTE}</span>
    </div>
    <div className="relative mt-3 overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted">
            <th scope="col" className="border-b border-line py-2 pr-3 font-medium">
              Tác tử
            </th>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">
              Mô hình
            </th>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">
              Công cụ
            </th>
            <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
              Phiên 24h
            </th>
            <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
              Lỗi
            </th>
            <th scope="col" className="border-b border-line px-3 py-2 font-medium">
              Trạng thái
            </th>
            <th scope="col" className="border-b border-line py-2 pl-3 text-right font-medium">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const selected = a.id === selectedId;
            const rate = errorRate(a);
            const st = STATUS[a.status];
            return (
              <tr
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn("cursor-pointer transition-colors", selected ? "bg-bamboo-50" : "hover:bg-canvas")}
              >
                <td className="rounded-l-xl border-b border-line/70 py-2.5 pl-2 pr-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(a.id);
                    }}
                    aria-pressed={selected}
                    className="block rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
                  >
                    <span className="block text-[13px] font-semibold text-ink">{a.name}</span>
                    <span className="block text-[11.5px] text-muted">{a.description}</span>
                  </button>
                </td>
                <td className="border-b border-line/70 px-3 py-2.5 text-body">{a.model}</td>
                <td
                  className="border-b border-line/70 px-3 py-2.5 font-mono text-[11.5px] text-body"
                  title={a.tools.join(", ")}
                >
                  {a.tools.slice(0, MAX_TOOLS).join(", ")}
                  {a.tools.length > MAX_TOOLS && <span className="text-muted"> +{a.tools.length - MAX_TOOLS}</span>}
                </td>
                <td className="border-b border-line/70 px-3 py-2.5 text-right tabular-nums text-ink">
                  {num(a.sessions24h)}
                </td>
                <td
                  className={cn(
                    "border-b border-line/70 px-3 py-2.5 text-right tabular-nums",
                    rate >= errorThreshold ? "font-semibold text-red-600" : "text-ink",
                  )}
                >
                  {pct(rate)}
                </td>
                <td className="border-b border-line/70 px-3 py-2.5">
                  {st.badge ? (
                    <span
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
                        st.badge,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} aria-hidden />
                      {st.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink">
                      <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} aria-hidden />
                      {st.label}
                    </span>
                  )}
                </td>
                <td
                  className="rounded-r-xl border-b border-line/70 py-2.5 pl-3 pr-2 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {a.status === "active" && (
                    <button
                      type="button"
                      onClick={() => onPause(a)}
                      aria-label={`Tạm dừng ${a.name}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[12px] font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
                    >
                      <Pause className="h-3.5 w-3.5" aria-hidden />
                      Tạm dừng
                    </button>
                  )}
                  {a.status === "paused" && (
                    <button
                      type="button"
                      onClick={() => onResume(a)}
                      aria-label={`Tiếp tục ${a.name}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-bamboo-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-bamboo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      Tiếp tục
                    </button>
                  )}
                  {a.status === "pending" && <span className="text-[12px] text-muted">Chờ quản trị duyệt</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
);
