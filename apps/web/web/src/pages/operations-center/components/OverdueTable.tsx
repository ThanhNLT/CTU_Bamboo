// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Download } from "lucide-react"; // Lucide React
import { Link } from "react-router"; // React Router

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import type { Company, CompanyKey, OverdueRow } from "../types";
import { ChipButton, DefinitionButton } from "./ChartWidget";

// ===== Hàm tiện ích =====
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Xuất CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
const exportCsv = (rows: OverdueRow[], COMPANY: Record<CompanyKey, Company>) => {
  const lines = [
    ["Mã hồ sơ", "Công ty", "Loại hồ sơ", "Bước", "Quá hạn (phút)", "Quá hạn"],
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

// ===== Hằng số =====
const TH = "px-3 pb-2 pt-1 text-left text-[12px] font-medium text-muted";

// ===== Component =====
/** Hồ sơ quá hạn SLA – top 5. Dòng của công ty đang tô sáng nền xanh nhạt; bấm dòng để tô sáng công ty đó. */
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
  <section className="rounded-2xl border border-line bg-white p-5 shadow-card" aria-labelledby="overdue-title">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="overdue-title" className="text-[15px] font-semibold text-ink">
        Hồ sơ quá hạn SLA – top 5
      </h2>
      <div className="flex flex-wrap gap-2">
        <ChipButton onClick={() => exportCsv(rows, COMPANY)}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Xuất CSV
        </ChipButton>
        <DefinitionButton text={definition} />
      </div>
    </header>

    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Mã hồ sơ
            </th>
            <th scope="col" className={TH}>
              Công ty
            </th>
            <th scope="col" className={TH}>
              Loại hồ sơ
            </th>
            <th scope="col" className={cn(TH, "w-[80px]")}>
              Bước
            </th>
            <th scope="col" className={cn(TH, "w-[130px] text-right")}>
              Quá hạn
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-[13px] text-muted">
                Không có hồ sơ quá hạn.
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
                      className="h-2 w-2 rounded-full"
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
