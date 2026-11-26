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

import { Download } from "lucide-react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { Company, CompanyKey, OverdueRow } from "../types";
import { ChipButton, DefinitionButton } from "./ChartWidget";
import { tr } from "../../../i18n";

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const exportCsv = (rows: OverdueRow[], COMPANY: Record<CompanyKey, Company>) => {
  const lines = [
    [tr("Mã hồ sơ"), tr("Công ty"), tr("Loại hồ sơ"), tr("Bước"), tr("Quá hạn (phút)"), tr("Quá hạn")],
    ...rows.map((r) => [
      r.code,
      COMPANY[r.company]?.name ?? "",
      r.type,
      r.step,
      String(r.overdueMinutes),
      r.overdueLabel,
    ]),
  ].map((cols) => cols.map(csvCell).join(","));
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ho-so-qua-han-sla-top5.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const TH = "px-3 pb-2 pt-1 text-left text-[12px] font-medium text-muted";

export const OverdueTable = ({
  rows,
  company: COMPANY,
  definition,
  highlight,
  onHighlight,
}: {
  rows: OverdueRow[];
  company: Record<CompanyKey, Company>;
  definition: string;
  highlight?: CompanyKey;
  onHighlight: (c?: CompanyKey) => void;
}) => (
  <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-labelledby="overdue-title">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="overdue-title" className="text-[15px] font-semibold text-ink">
        {tr("Hồ sơ quá hạn SLA – top 5")}
      </h2>
      <div className="flex flex-wrap gap-2">
        <ChipButton onClick={() => exportCsv(rows, COMPANY)}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {tr("Xuất CSV")}
        </ChipButton>
        <DefinitionButton text={definition} />
      </div>
    </header>

    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              {tr("Mã hồ sơ")}
            </th>
            <th scope="col" className={TH}>
              {tr("Công ty")}
            </th>
            <th scope="col" className={TH}>
              {tr("Loại hồ sơ")}
            </th>
            <th scope="col" className={cn(TH, "w-[80px]")}>
              {tr("Bước")}
            </th>
            <th scope="col" className={cn(TH, "w-[130px] text-right")}>
              {tr("Quá hạn")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-[13px] text-muted">
                {tr("Không có hồ sơ quá hạn.")}
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const on = r.company === highlight;
            const td = cn(
              "px-3 py-2.5 transition-colors",
              on ? "bg-bamboo-50" : "group-hover:bg-canvas",
              i < rows.length - 1 && !on && rows[i + 1]?.company !== highlight && "border-b border-line/70",
            );
            return (
              <tr key={r.code} className="group cursor-pointer" onClick={() => onHighlight(on ? undefined : r.company)}>
                <td className={cn(td, "rounded-l-xl font-mono text-[11.5px] tracking-tight text-body")}>
                  <Link
                    to={r.to}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-bamboo-700 hover:underline underline-offset-2"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className={td}>
                  <span className="inline-flex items-center gap-2 text-ink">
                    <span
                      className="h-2 w-2 rounded-ui"
                      style={{ background: COMPANY[r.company]?.color }}
                      aria-hidden
                    />
                    {COMPANY[r.company]?.name}
                  </span>
                </td>
                <td className={cn(td, "text-ink")}>{r.type}</td>
                <td className={cn(td, "text-body")}>{r.step}</td>
                <td className={cn(td, "rounded-r-xl whitespace-nowrap text-right font-medium tabular-nums text-ink")}>
                  {r.overdueLabel}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
);
