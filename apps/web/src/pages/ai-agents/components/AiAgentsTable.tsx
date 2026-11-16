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

import { Pause, Pencil, Play, Trash2, Zap } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { Agent, AgentStats } from "../types";
import { GUARDS, STATUS, guardOn, num, seconds, statsOf } from "../utils";
import { tr, trf } from "../../../i18n";

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-black/[0.05] hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";

export const AiAgentsTable = ({
  agents,
  stats,
  loading,
  onEdit,
  onAutomate,
  onToggle,
  onRemove,
}: {
  agents: Agent[];
  stats: AgentStats[];
  loading: boolean;
  onEdit: (a: Agent) => void;
  onAutomate: (a: Agent) => void;
  onToggle: (a: Agent) => void;
  onRemove: (a: Agent) => void;
}) => {
  const models = [...new Set(agents.map((a) => a.model))];
  return (
    <section aria-label={tr("Tác tử đã đăng ký")} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{tr("Tác tử đã đăng ký")}</h2>
        {models.length > 0 && <span className="text-[11.5px] text-muted">Ollama · {models.join(", ")}</span>}
      </div>
      <div className="relative mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted">
              <th scope="col" className="border-b border-line py-2 pr-3 font-medium">
                {tr("Tác tử")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Mô hình")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Rào chắn")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
                {tr("Lượt hỏi")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
                TB / p90
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
                {tr("Lỗi")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
                {tr("Đề xuất được nhận")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Trạng thái")}
              </th>
              <th scope="col" className="border-b border-line py-2 pl-3 text-right font-medium">
                <span className="sr-only">{tr("Thao tác")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  {loading ? tr("Đang tải…") : tr("Chưa có tác tử nào.")}
                </td>
              </tr>
            )}
            {agents.map((a) => {
              const s = statsOf(stats, a.id);
              const st = STATUS[a.status];
              return (
                <tr key={a.id} className="hover:bg-canvas">
                  <td className="border-b border-line/70 py-2.5 pr-3">
                    <span className="block font-semibold text-ink">{a.name}</span>
                    <span className="font-mono text-[11px] text-muted">{a.tool_list.join(" · ") || "—"}</span>
                    {a.triggers.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-800">
                        <Zap className="h-3 w-3" aria-hidden />
                        {a.autonomy === "act"
                          ? trf("Tự hành động khi có {0} sự kiện", [a.triggers.length])
                          : a.autonomy === "suggest"
                            ? trf("Đề xuất chờ chấp nhận khi có {0} sự kiện", [a.triggers.length])
                            : trf("Đề xuất khi có {0} sự kiện", [a.triggers.length])}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-line/70 px-3 py-2.5 font-mono text-[12px] text-body">{a.model}</td>
                  <td className="border-b border-line/70 px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {GUARDS.filter((g) => guardOn(a, g)).map((g) => (
                        <span
                          key={g}
                          className="rounded-md bg-black/[0.045] px-1.5 py-0.5 font-mono text-[10.5px] text-body"
                        >
                          {g}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="border-b border-line/70 px-3 py-2.5 text-right tabular-nums text-ink">
                    {num(s.questions)}
                    {s.pending > 0 && (
                      <span className="block text-[11px] text-muted">
                        {s.pending} {tr(" đang chờ")}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-line/70 px-3 py-2.5 text-right tabular-nums text-body">
                    {seconds(s.avg_seconds)}
                    <span className="block text-[11px] text-muted">{seconds(s.p90_seconds)}</span>
                  </td>
                  <td
                    className={cn(
                      "border-b border-line/70 px-3 py-2.5 text-right tabular-nums",
                      s.errors ? "font-semibold text-red-700" : "text-body",
                    )}
                  >
                    {num(s.errors)}
                  </td>
                  <td className="border-b border-line/70 px-3 py-2.5 text-right tabular-nums text-body">
                    {s.acceptance_rate == null ? "—" : `${Math.round(s.acceptance_rate * 100)}%`}
                    {(s.suggestions_decided > 0 || s.suggestions_pending > 0) && (
                      <span className="block text-[11px] text-muted">
                        {trf("{0}/{1} · {2} chờ", [
                          s.suggestions_accepted,
                          s.suggestions_decided,
                          s.suggestions_pending,
                        ])}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-line/70 px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]",
                        st.badge ?? "text-ink",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-ui", st.dot)} aria-hidden />
                      {st.label}
                    </span>
                  </td>
                  <td className="border-b border-line/70 py-2.5 pl-3">
                    <span className="flex justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onEdit(a)}
                        className={iconBtn}
                        aria-label={trf("Sửa {0}", [a.name])}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onAutomate(a)}
                        className={iconBtn}
                        aria-label={trf("Tự hành động của {0}", [a.name])}
                        title={tr("Tự hành động khi có sự kiện")}
                      >
                        <Zap className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggle(a)}
                        className={iconBtn}
                        aria-label={a.status === "active" ? trf("Ngừng {0}", [a.name]) : trf("Bật lại {0}", [a.name])}
                      >
                        {a.status === "active" ? (
                          <Pause className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(a)}
                        className={iconBtn}
                        aria-label={trf("Xóa {0}", [a.name])}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
