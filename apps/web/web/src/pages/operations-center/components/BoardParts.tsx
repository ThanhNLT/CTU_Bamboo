// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Skeleton } from "antd";
import type { ReactNode } from "react";

import { cn } from "../../../utils/cn";
import type { Kpi } from "../types";
import { KpiCard } from "./KpiCard";

export const KpiRow = ({ kpis }: { kpis: Kpi[] }) => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
    {kpis.map((k) => (
      <KpiCard key={k.key} kpi={k} />
    ))}
  </div>
);

export const BoardState = ({
  loading,
  error,
  ready,
  children,
}: {
  loading: boolean;
  error?: string;
  ready: boolean;
  children: ReactNode;
}) => (
  <>
    {error && <Alert type="error" showIcon message="Không tải được số liệu" description={error} />}
    {!ready && loading && (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    )}
    {ready && children}
  </>
);

export const NumTable = <T,>({
  rows,
  columns,
  empty,
  rowKey,
}: {
  rows: T[];
  columns: { title: string; render: (r: T) => ReactNode; align?: "left" | "right" }[];
  empty: string;
  rowKey: (r: T, i: number) => string;
}) =>
  rows.length === 0 ? (
    <p className="py-8 text-center text-[13px] text-muted">{empty}</p>
  ) : (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c, i) => (
              <th
                key={c.title}
                className={cn(
                  "whitespace-nowrap px-2 pb-2 pt-1 font-medium text-muted",
                  (c.align ?? (i === 0 ? "left" : "right")) === "left" ? "text-left" : "text-right",
                )}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey(r, ri)} className="border-b border-line/60 last:border-0">
              {columns.map((c, i) => (
                <td
                  key={c.title}
                  className={cn(
                    "px-2 py-1.5 text-ink",
                    i === 0 && "whitespace-nowrap",
                    (c.align ?? (i === 0 ? "left" : "right")) === "left" ? "text-left" : "text-right tabular-nums",
                  )}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
