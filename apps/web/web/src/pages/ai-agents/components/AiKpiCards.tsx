// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../../utils/cn";
import { KPI_STATIC } from "../mock";
import { num, pct, type computeKpis } from "../utils";

const Card = ({ label, value, unit, note }: { label: string; value: string; unit?: string; note: ReactNode }) => (
  <div className="min-w-0 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card">
    <dt className="truncate text-[12px] text-muted">{label}</dt>
    <dd className="m-0">
      <span className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink">
          {value}
        </span>
        {unit && <span className="text-[13px] text-muted">{unit}</span>}
      </span>
      <span className="mt-1 flex items-center gap-1.5 truncate text-[11.5px] text-muted">{note}</span>
    </dd>
  </div>
);

const Dot = ({ className }: { className: string }) => (
  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", className)} aria-hidden />
);

export const AiKpiCards = ({ kpi }: { kpi: ReturnType<typeof computeKpis> }) => {
  const overError = kpi.errorRate >= kpi.errorThreshold;
  const overLatency = kpi.p95 > kpi.p95Target;
  return (
    <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Card
        label="Tác tử hoạt động"
        value={num(kpi.active)}
        note={
          kpi.paused > 0 ? (
            <>
              <Dot className="bg-yellow-500" />
              {kpi.paused} đang tạm dừng
            </>
          ) : (
            "Không có tác tử tạm dừng"
          )
        }
      />
      <Card
        label="Phiên · 24 giờ"
        value={num(kpi.sessions)}
        note={
          <>
            <ArrowUp className="h-3 w-3 shrink-0" aria-label="Tăng" />
            {KPI_STATIC.sessionsDelta}
          </>
        }
      />
      <Card
        label="Tỉ lệ lỗi"
        value={pct(kpi.errorRate)}
        note={
          overError ? (
            <>
              <Dot className="bg-red-500" />
              Vượt ngưỡng cảnh báo {pct(kpi.errorThreshold, 0)}
            </>
          ) : (
            `Ngưỡng cảnh báo ${pct(kpi.errorThreshold, 0)}`
          )
        }
      />
      <Card
        label="Độ trễ p95"
        value={num(kpi.p95, 1)}
        unit="giây"
        note={
          overLatency ? (
            <>
              <Dot className="bg-red-500" />
              Vượt mục tiêu ≤ {kpi.p95Target} giây
            </>
          ) : (
            `Mục tiêu ≤ ${kpi.p95Target} giây`
          )
        }
      />
      <Card label="Đánh giá hữu ích" value={pct(kpi.helpful, 0)} note={`Từ ${num(kpi.ratings)} lượt đánh giá`} />
    </dl>
  );
};
