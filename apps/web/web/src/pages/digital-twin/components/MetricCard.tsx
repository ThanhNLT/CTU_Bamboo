// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Activity } from "lucide-react";
import { Dot } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { Metric, MetricStatus } from "../types";
import { METRIC_TONE, formatNumber } from "../utils";

const NOTE_CLASS: Record<MetricStatus, string> = {
  critical: "text-red-700",
  warning: "text-amber-800",
  ok: "text-muted",
  stale: "text-muted",
};

const VALUE_CLASS: Record<MetricStatus, string> = {
  critical: "text-red-600",
  warning: "text-ink",
  ok: "text-ink",
  stale: "text-muted",
};

/** Thẻ một chỉ số cảm biến. Bấm để vẽ chỉ số này ở biểu đồ bên dưới. */
export const MetricCard = ({
  metric,
  selected,
  onSelect,
}: {
  metric: Metric;
  selected: boolean;
  onSelect: () => void;
}) => {
  const critical = metric.status === "critical";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-white p-4 text-left shadow-card transition-[border-color,box-shadow]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
        critical ? "border-red-300" : selected ? "border-bamboo-400" : "border-line hover:border-bamboo-200",
        selected && (critical ? "ring-3 ring-red-100" : "ring-3 ring-bamboo-100"),
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] leading-snug text-muted">{metric.label}</span>
        {selected && <Activity className="h-3.5 w-3.5 shrink-0 text-bamboo-600" aria-label="Đang xem biểu đồ" />}
      </span>
      <span className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[26px] font-semibold leading-none tracking-[-0.01em] tabular-nums",
            VALUE_CLASS[metric.status],
          )}
        >
          {formatNumber(metric.value, metric.decimals)}
        </span>
        <span className="text-[13px] text-muted">{metric.unit}</span>
      </span>
      <span className={cn("mt-2.5 flex items-start gap-1.5 text-[12px] leading-snug", NOTE_CLASS[metric.status])}>
        <Dot tone={METRIC_TONE[metric.status]} className="mt-[5px]" />
        <span className="min-w-0">{metric.note}</span>
      </span>
    </button>
  );
};
