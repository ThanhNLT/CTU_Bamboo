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

import type { Seal } from "../types";
import { tr } from "../../../i18n";

const DEFAULT_ROWS = 5;

const ResultTag = ({ result }: { result: Seal["lastResult"] }) =>
  result == null ? (
    <span className="text-[12.5px] text-muted">{tr("Chưa đối soát")}</span>
  ) : result === "match" ? (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink">
      <span className="h-1.5 w-1.5 rounded-ui bg-bamboo-500" aria-hidden />
      {tr("Khớp")}
    </span>
  ) : (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-red-50 px-2.5 text-[12px] font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-ui bg-red-500" aria-hidden />
      {tr("Không khớp")}
    </span>
  );

export const RecentSealsWidget = ({ rows, onPick }: { rows: Seal[]; onPick: (row: Seal) => void }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, DEFAULT_ROWS);

  return (
    <section
      className="rounded-2xl border border-line bg-surface p-5 shadow-card"
      aria-label={tr("Niêm phong gần đây")}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{tr("Niêm phong gần đây")}</h2>
        {rows.length > DEFAULT_ROWS && (
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

      {rows.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted">
          {tr("Chưa có tệp nào được niêm phong trong các chứng từ bạn được xem.")}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[400px] border-collapse whitespace-nowrap text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted">
              <th scope="col" className="border-b border-line py-2 pr-3 font-medium">
                {tr("Hồ sơ")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Phiên bản")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-medium">
                {tr("Niêm phong lúc")}
              </th>
              <th scope="col" className="border-b border-line py-2 pl-3 font-medium">
                {tr("Kết quả")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.attachmentId}>
                <td className="border-b border-line/70 py-2.5 pr-3">
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    title={tr("Đối soát lại hồ sơ này")}
                    className="rounded font-mono text-[12px] text-ink hover:text-bamboo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
                  >
                    {r.code}
                  </button>
                </td>
                <td className="border-b border-line/70 px-3 py-2.5 text-body">v{r.version}</td>
                <td className="border-b border-line/70 px-3 py-2.5 tabular-nums text-body">{r.sealedAt}</td>
                <td className="border-b border-line/70 py-2.5 pl-3">
                  <ResultTag result={r.lastResult} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
