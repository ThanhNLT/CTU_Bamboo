// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ArrowUpRight, BellRing, FileText, Gauge, Inbox, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { SummaryStat } from "../types";
import { Dot } from "../../../components/ui";

// Biểu tượng lấy đúng từ menu (Hộp việc, Hồ sơ, Trung tâm điều hành, Thông báo) để người dùng nhận ra ngay
const ICONS: Record<string, LucideIcon> = { waiting: Inbox, processing: FileText, sla: Gauge, unread: BellRing };

const StatCard = ({ stat, accent }: { stat: SummaryStat; accent: boolean }) => {
  const danger = stat.tone === "danger" && stat.value > 0;
  const Icon = ICONS[stat.key] ?? FileText;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("text-[13px] font-medium leading-snug", accent ? "text-white/85" : "text-muted")}>
          {stat.label}
        </span>
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:-rotate-12",
            accent ? "bg-white/20 text-white" : "bg-[var(--glass-well)] text-bamboo-700",
          )}
          aria-hidden
        >
          {stat.to ? (
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
          ) : (
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </span>
      </div>
      <div
        className={cn(
          "mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[34px]",
          accent ? "text-white" : danger ? "text-red-600" : "text-ink",
        )}
      >
        {stat.value}
      </div>
      <div
        className={cn(
          "mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]",
          accent ? "bg-white/15 text-white/90" : "bg-[var(--glass-well)] text-muted",
        )}
      >
        {!accent && stat.tone && stat.tone !== "neutral" && <Dot tone={stat.tone} />}
        <Icon className={cn("h-3.5 w-3.5 shrink-0", accent ? "text-white/80" : "text-muted")} strokeWidth={1.75} />
        <span className="truncate">{stat.hint}</span>
      </div>
    </>
  );
  const cls = cn(
    "group block h-full min-w-0 rounded-2xl px-4 pb-4 pt-4 sm:px-5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
    accent ? "glass-accent" : "border bg-surface shadow-card",
    stat.to && "hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
  );
  return stat.to ? (
    <Link to={stat.to} className={cn(cls, accent ? "text-white!" : "text-ink!")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

/** Bốn chỉ số đầu trang; thẻ đầu (việc chờ tôi) là thẻ nhấn xanh Tre như mẫu Bamboo Glass. */
export const SummaryCards = ({ stats }: { stats: SummaryStat[] }) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
    {stats.map((s, i) => (
      <div
        key={s.key}
        className={cn(
          "min-w-0",
          // Thẻ nhấn và thẻ lẻ cuối cùng chiếm cả hàng trên điện thoại (lưới hai cột)
          (i === 0 || (i === stats.length - 1 && i % 2 === 1)) && "col-span-2 sm:col-span-1",
        )}
      >
        <StatCard stat={s} accent={i === 0} />
      </div>
    ))}
  </div>
);
