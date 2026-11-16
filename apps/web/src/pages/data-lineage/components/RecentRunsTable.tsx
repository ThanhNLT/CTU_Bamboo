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

import { useState } from "react";

import { cn } from "../../../utils/cn";
import type { RunResult, RunRow } from "../types";
import { tr } from "../../../i18n";

const DEFAULT_ROWS = 3;

const ResultBadge = ({ result }: { result: RunResult }) => {
  if (result === "check_failed") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 text-[12px] font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-ui bg-red-500" aria-hidden />
        {tr("Lỗi kiểm tra")}
      </span>
    );
  }
  const map: Record<Exclude<RunResult, "check_failed">, { dot: string; label: string; text: string }> = {
    success: { dot: "bg-bamboo-500", label: tr("Thành công"), text: "text-ink" },
    failed: { dot: "bg-red-500", label: tr("Thất bại"), text: "text-red-700" },
    running: { dot: "bg-sky-500 motion-safe:animate-pulse", label: tr("Đang chạy"), text: "text-ink" },
  };
  const m = map[result];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px]", m.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-ui", m.dot)} aria-hidden />
      {m.label}
    </span>
  );
};

export const RecentRunsTable = ({
  runs,
  selectedNodeId,
  onSelectNode,
}: {
  runs: RunRow[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
}) => {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? runs : runs.slice(0, DEFAULT_ROWS);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label={tr("Lần chạy gần đây")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{tr("Lần chạy gần đây")}</h2>
        {runs.length > DEFAULT_ROWS && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="rounded-md text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
          >
            {showAll ? tr("Thu gọn") : tr("Xem tất cả")}
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted">
              <th scope="col" className="border-b border-line py-2 pr-3 font-medium">
                {tr("Tác vụ")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Bắt đầu")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Thời lượng")}
              </th>
              <th scope="col" className="border-b border-line py-2 pl-3 font-medium">
                {tr("Kết quả")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bad = r.result === "check_failed" || r.result === "failed";
              return (
                <tr
                  key={r.id}
                  className={cn(bad ? "bg-red-50/70" : r.nodeId === selectedNodeId ? "bg-bamboo-50/60" : "")}
                >
                  <td className="rounded-l-xl border-b border-line/70 py-2.5 pl-2 pr-3">
                    <button
                      type="button"
                      onClick={() => onSelectNode(r.nodeId)}
                      className="rounded text-left font-mono text-[12px] text-ink hover:text-bamboo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
                    >
                      {r.task} · {r.engine}
                    </button>
                  </td>
                  <td className="border-b border-line/70 px-3 py-2.5 tabular-nums text-body">{r.start}</td>
                  <td className="border-b border-line/70 px-3 py-2.5 tabular-nums text-body">{r.duration}</td>
                  <td className="rounded-r-xl border-b border-line/70 py-2.5 pl-3 pr-2">
                    <ResultBadge result={r.result} />
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
