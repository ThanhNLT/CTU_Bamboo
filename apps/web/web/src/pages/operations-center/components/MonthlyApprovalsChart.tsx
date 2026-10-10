// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MONTHLY_APPROVALS } from "../mock";
import { AXIS_TICK, BAMBOO_DARK, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget } from "./ChartWidget";

const NAMES: Record<string, string> = { y2026: "2026", y2025: "2025" };

/** Hồ sơ duyệt theo tháng (mô phỏng khối Metabase nhúng): cột năm nay + đường đứt nét năm trước. */
export const MonthlyApprovalsChart = () => (
  <ChartWidget
    title="Hồ sơ duyệt theo tháng"
    meta="Ấm · Metabase nhúng"
    notice={
      <div role="note" className="flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        <span className="flex-1">Nguồn chưa đạt kiểm định chất lượng</span>
        <Link to="/d/lineage" className="shrink-0 font-semibold text-amber-900 underline-offset-2 hover:underline">Xem phả hệ</Link>
      </div>
    }
    footer={<span className="ml-auto text-[10.5px] text-muted">Powered by Metabase</span>}
  >
    <ul className="m-0 mb-2 flex list-none gap-4 p-0 text-[11.5px] text-body" aria-label="Chú giải">
      <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAMBOO_DARK }} aria-hidden />2026</li>
      <li className="inline-flex items-center gap-1.5">
        <svg width="16" height="4" aria-hidden><line x1="0" y1="2" x2="16" y2="2" stroke="#6b7670" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
        2025
      </li>
    </ul>
    <div className="h-[230px]" role="img" aria-label="Biểu đồ cột hồ sơ duyệt theo tháng năm 2026, so với đường năm 2025">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={MONTHLY_APPROVALS} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={1} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 400]} ticks={[0, 100, 200, 300, 400]} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(47,122,62,0.06)" }}
            content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => NAMES[k] ?? k} unit=" hồ sơ" />}
          />
          <Bar dataKey="y2026" fill={BAMBOO_DARK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line dataKey="y2025" type="monotone" stroke="#6b7670" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </ChartWidget>
);
