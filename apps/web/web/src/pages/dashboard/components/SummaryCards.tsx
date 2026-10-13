// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";
import { cn } from "../../../utils/cn";
import type { SummaryStat } from "../types";
import { Dot } from "../../../components/ui";

const StatCard = ({ stat }: { stat: SummaryStat }) => {
  const danger = stat.tone === "danger";
  const body = (
    <>
      <div className="text-[12.5px] text-muted">{stat.label}</div>
      <div
        className={cn("mt-2 text-[28px] font-semibold leading-none tabular-nums", danger ? "text-red-600" : "text-ink")}
      >
        {stat.value}
      </div>
      <div className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
        {stat.tone && stat.tone !== "neutral" && <Dot tone={stat.tone} />}
        <span className="truncate">{stat.hint}</span>
      </div>
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-line bg-white px-5 py-4 shadow-card";
  return stat.to ? (
    <Link to={stat.to} className={cn(cls, "transition-colors hover:border-bamboo-200 hover:bg-bamboo-50/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

export const SummaryCards = ({ stats }: { stats: SummaryStat[] }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {stats.map((s) => (
      <StatCard key={s.key} stat={s} />
    ))}
  </div>
);
