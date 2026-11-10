import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthlyPoint } from "../types";
import { AXIS_TICK, BAMBOO_DARK, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget } from "./ChartWidget";
import { tr, trf } from "../../../i18n";

export const MonthlyApprovalsChart = ({ data, year, meta }: { data: MonthlyPoint[]; year: number; meta: string }) => {
  const names: Record<string, string> = { current: String(year), previous: String(year - 1) };
  const max = Math.max(4, ...data.map((d) => Math.max(d.current ?? 0, d.previous)));
  return (
    <ChartWidget title={tr("Hồ sơ duyệt theo tháng")} meta={meta}>
      <ul className="m-0 mb-2 flex list-none gap-4 p-0 text-[11.5px] text-body" aria-label={tr("Chú giải")}>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAMBOO_DARK }} aria-hidden />
          {year}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" stroke="#6b7670" strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
          {year - 1}
        </li>
      </ul>
      <div
        className="h-[230px]"
        role="img"
        aria-label={trf("Biểu đồ cột hồ sơ duyệt theo tháng năm {0}, so với đường năm {1}", [year, year - 1])}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={1} />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              domain={[0, Math.ceil(max * 1.1)]}
              allowDecimals={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "rgba(47,122,62,0.06)" }}
              content={(p) => (
                <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => names[k] ?? k} unit={tr(" hồ sơ")} />
              )}
            />
            <Bar dataKey="current" fill={BAMBOO_DARK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line
              dataKey="previous"
              type="monotone"
              stroke="#6b7670"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWidget>
  );
};
