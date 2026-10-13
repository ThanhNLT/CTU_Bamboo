// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, BAMBOO_DARK, GRID_STROKE } from "../../operations-center/components/chartTheme";
import type { ChartPoint, ChartSpec } from "../types";

const BAND_FILL = "#98c9a0";
const COMPARE = "#9aa49e";

type TipProps = { active?: boolean; label?: string | number; payload?: Array<{ payload?: ChartPoint }> };

const fmt = (n: number, d: number) => n.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

const ChartTip = ({ active, label, payload, spec }: TipProps & { spec: ChartSpec }) => {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const rows: Array<[string, string]> = [];
  if (p.actual != null) rows.push([spec.legend.actual, `${fmt(p.actual, spec.decimals)}%`]);
  if (p.compare != null && spec.legend.compare) rows.push([spec.legend.compare, `${fmt(p.compare, spec.decimals)}%`]);
  if (p.forecast != null && p.actual == null && spec.legend.forecast)
    rows.push([spec.legend.forecast, `${fmt(p.forecast, spec.decimals)}%`]);
  if (p.band && p.band[0] !== p.band[1] && spec.legend.band) {
    rows.push([spec.legend.band, `${fmt(p.band[0], 0)}–${fmt(p.band[1], 0)}%`]);
  }
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-float">
      <div className="mb-1 font-semibold text-ink">Tuần {String(label).replace(/^T/, "")}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-body">{k}</span>
          <span className="font-medium tabular-nums text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
};

const LegendItem = ({ kind, label }: { kind: "solid" | "dashed" | "band" | "muted"; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    {kind === "band" ? (
      <span className="h-2.5 w-3.5 rounded-sm" style={{ background: BAND_FILL, opacity: 0.35 }} aria-hidden />
    ) : (
      <svg width="16" height="6" aria-hidden>
        <line
          x1="0"
          y1="3"
          x2="16"
          y2="3"
          stroke={kind === "muted" ? COMPARE : BAMBOO_DARK}
          strokeWidth="2"
          strokeDasharray={kind === "dashed" ? "4 3" : undefined}
        />
      </svg>
    )}
    {label}
  </span>
);

/** Biểu đồ nhúng trong câu trả lời: thực tế (liền), dự báo (đứt), khoảng tin cậy (vùng nhạt), so sánh (xám). */
export const AiChartWidget = ({ spec }: { spec: ChartSpec }) => {
  const lastActual = [...spec.data].reverse().find((d) => d.actual != null);
  return (
    <figure className="m-0 rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <figcaption className="text-[13px] font-semibold text-ink">{spec.title}</figcaption>
        {spec.link && (
          <Link
            to={spec.link.to}
            className="shrink-0 text-[12px] font-medium text-bamboo-700 underline-offset-2 hover:underline"
          >
            {spec.link.label}
          </Link>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <LegendItem kind="solid" label={spec.legend.actual} />
        {spec.legend.compare && <LegendItem kind="muted" label={spec.legend.compare} />}
        {spec.legend.forecast && <LegendItem kind="dashed" label={spec.legend.forecast} />}
        {spec.legend.band && <LegendItem kind="band" label={spec.legend.band} />}
      </div>

      <div className="mt-2 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={spec.data} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              tickMargin={6}
            />
            <YAxis
              domain={spec.yDomain}
              ticks={spec.yTicks}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDataOverflow
            />
            <Tooltip
              cursor={{ stroke: "#c9d2cc", strokeDasharray: "3 3" }}
              content={(p) => <ChartTip {...(p as unknown as TipProps)} spec={spec} />}
            />
            {spec.legend.band && (
              <Area
                dataKey="band"
                stroke="none"
                fill={BAND_FILL}
                fillOpacity={0.35}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {spec.legend.compare && (
              <Line dataKey="compare" stroke={COMPARE} strokeWidth={1.75} dot={false} isAnimationActive={false} />
            )}
            {spec.legend.forecast && (
              <Line
                dataKey="forecast"
                stroke={BAMBOO_DARK}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            <Line
              dataKey="actual"
              stroke={BAMBOO_DARK}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: BAMBOO_DARK }}
              isAnimationActive={false}
              connectNulls={false}
            />
            {lastActual?.actual != null && (
              <ReferenceDot
                x={lastActual.label}
                y={lastActual.actual}
                r={3.5}
                fill={BAMBOO_DARK}
                stroke="#fff"
                strokeWidth={1.5}
                label={{
                  value: fmt(lastActual.actual, spec.decimals),
                  position: "top",
                  fill: "#1b231e",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11.5px] text-muted">{spec.method}</p>
    </figure>
  );
};
