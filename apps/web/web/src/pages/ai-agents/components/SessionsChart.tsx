// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, BAMBOO_DARK, GRID_STROKE } from "../../operations-center/components/chartTheme";
import type { DayStat } from "../types";
import { num, pct } from "../utils";

const ERROR = "#dc2626";

type TipProps = { active?: boolean; label?: string | number; payload?: Array<{ payload?: DayStat }> };

const Tip = ({ active, label, payload }: TipProps) => {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const total = d.success + d.errors;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-float">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-body">Thành công</span>
        <span className="tabular-nums text-ink">{num(d.success)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-body">Lỗi</span>
        <span className="tabular-nums text-ink">
          {num(d.errors)} ({pct(total ? d.errors / total : 0)})
        </span>
      </div>
    </div>
  );
};

/** Cột chồng 7 ngày: phần xanh = phiên thành công, ngọn đỏ = phiên lỗi. */
export const SessionsChart = ({ data, total, errors }: { data: DayStat[]; total: number; errors: number }) => {
  const max = Math.max(...data.map((d) => d.success + d.errors));
  const top = Math.max(50, Math.ceil(max / 50) * 50);
  return (
    <figure className="m-0 min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <figcaption className="text-[14px] font-semibold text-ink">Phiên 7 ngày</figcaption>
        <span className="text-[11.5px] text-muted">
          Tổng {num(total)} · lỗi {num(errors)}
        </span>
      </div>
      <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAMBOO_DARK }} aria-hidden />
          Thành công
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ERROR }} aria-hidden />
          Lỗi
        </span>
      </div>
      <div className="mt-2 h-[220px]" role="img" aria-label={`Phiên 7 ngày: tổng ${total}, lỗi ${errors}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }} barCategoryGap="28%">
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} tickMargin={6} />
            <YAxis
              domain={[0, top]}
              ticks={[0, top / 2, top]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(47,122,62,0.06)" }}
              content={(p) => <Tip {...(p as unknown as TipProps)} />}
            />
            <Bar dataKey="success" stackId="s" fill={BAMBOO_DARK} isAnimationActive={false} />
            <Bar dataKey="errors" stackId="s" fill={ERROR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
};
