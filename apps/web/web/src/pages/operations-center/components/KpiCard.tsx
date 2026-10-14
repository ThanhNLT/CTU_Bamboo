// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Tooltip } from "antd";
import { Info } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { Kpi } from "../types";

const TONE: Record<"good" | "bad" | "neutral", string> = {
  good: "text-bamboo-700",
  bad: "text-red-600",
  neutral: "text-muted",
};

export const KpiCard = ({ kpi }: { kpi: Kpi }) => {
  const d = kpi.delta;
  return (
    <section
      className="flex min-w-0 flex-col rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card"
      aria-label={kpi.label}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-[12px] text-muted">{kpi.label}</h3>
        <Tooltip title={kpi.definition} placement="topRight">
          <button
            type="button"
            aria-label={`Định nghĩa: ${kpi.label}`}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Tooltip>
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-ink">{kpi.value}</div>
      {d && (
        <div className="mt-2 flex min-w-0 items-center gap-1 text-[11.5px] text-muted">
          {d.dir === "up" && (
            <span className={cn("text-[10px]", TONE[d.tone])} aria-label="tăng">
              ▲
            </span>
          )}
          {d.dir === "down" && (
            <span className={cn("text-[10px]", TONE[d.tone])} aria-label="giảm">
              ▼
            </span>
          )}
          {d.dir === "dot" && (
            <span
              className={cn("h-1.5 w-1.5 rounded-full", d.tone === "bad" ? "bg-red-500" : "bg-bamboo-500")}
              aria-hidden
            />
          )}
          <span className="truncate">{d.text}</span>
        </div>
      )}
      <div className="mt-auto pt-2 text-[11px] text-muted">
        {kpi.freshness.tier} · {kpi.freshness.at}
      </div>
    </section>
  );
};
