// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "../../../utils/cn";
import { AXIS_TICK, BAMBOO_DARK, GRID_STROKE } from "../../operations-center/components/chartTheme";
import { useSeries } from "../api";
import { MINUTE, RANGES, aggregationOf, breachSpans, bucketize, xTicksOf, yAxisOf } from "../signal";
import type { Metric, Threshold, TimeRange, TwinEntity } from "../types";
import { formatDay, formatDayTime, formatDuration, formatNumber, formatTime } from "../utils";

const RED = "#dc2626";
const RED_TEXT = "#b91c1c";
const AGG_WORD = { max: "đỉnh", min: "đáy", mean: "trung bình" } as const;

type TipProps = { active?: boolean; label?: number | string; payload?: Array<{ value?: number | string | null }> };

const outside = (v: number, th: Threshold) => (th.max != null && v > th.max) || (th.min != null && v < th.min);

const SensorTooltip = ({ active, label, payload, metric, range }: TipProps & { metric: Metric; range: TimeRange }) => {
  const v = payload?.[0]?.value;
  if (!active || typeof v !== "number" || typeof label !== "number") return null;
  const r = RANGES[range];
  const agg = aggregationOf(metric.threshold);
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-float">
      <div className="font-semibold text-ink">
        {range === "1h" ? formatTime(label) : formatDayTime(label)}
        {r.bucket > 1 && (
          <span className="font-normal text-muted">
            {" "}
            · {AGG_WORD[agg]} {formatDuration(r.bucket)}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: BAMBOO_DARK }} aria-hidden />
        <span className="font-medium tabular-nums text-ink">
          {formatNumber(v, metric.decimals)} {metric.unitLong ?? metric.unit}
        </span>
      </div>
      {outside(v, metric.threshold) && <div className="mt-0.5 font-medium text-red-700">Ngoài ngưỡng</div>}
    </div>
  );
};

const RangeToggle = ({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) => (
  <div
    role="group"
    aria-label="Khoảng thời gian"
    className="inline-flex shrink-0 gap-0.5 rounded-full bg-black/[0.045] p-1"
  >
    {(Object.keys(RANGES) as TimeRange[]).map((key) => {
      const active = key === value;
      return (
        <button
          key={key}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(key)}
          className={cn(
            "h-7 rounded-full px-3 text-[12px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
            active ? "bg-white font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {RANGES[key].short}
        </button>
      );
    })}
  </div>
);

const limitText = (metric: Metric, side: "max" | "min") => {
  const th = metric.threshold;
  const both = th.min != null && th.max != null;
  const name =
    side === "max"
      ? (metric.limitLabel ?? (both ? "Tối đa" : "Ngưỡng"))
      : both
        ? "Tối thiểu"
        : (metric.limitLabel ?? "Tối thiểu");
  return `${name} · ${formatNumber((side === "max" ? th.max : th.min) ?? 0)}`;
};

export const SensorChart = ({
  entity,
  metric,
  range,
  onRangeChange,
}: {
  entity: TwinEntity;
  metric: Metric;
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) => {
  const r = RANGES[range];
  const th = metric.threshold;
  const agg = aggregationOf(th);

  const series = useSeries(entity.uuid, metric.key, r.minutes);
  const chart = useMemo(() => {
    const minutes = series.points;
    const data = bucketize(minutes, r.bucket, agg, metric.decimals);
    const end = Date.now();
    const start = end - r.minutes * MINUTE;
    const minWidth = Math.max(r.bucket * MINUTE, (end - start) * 0.008);
    const areas = breachSpans(minutes, th).map((s) => {
      let x1 = s.start - MINUTE / 2;
      let x2 = s.end + MINUTE / 2;
      if (x2 - x1 < minWidth) {
        const mid = (x1 + x2) / 2;
        x1 = mid - minWidth / 2;
        x2 = mid + minWidth / 2;
      }
      return { ...s, x1: Math.max(start, x1), x2: Math.min(end, x2) };
    });
    return { data, start, end, areas, y: yAxisOf(data, th), xTicks: xTicksOf(start, end, r.tickEvery) };
  }, [series.points, metric.decimals, th, r, agg]);

  const lastArea = chart.areas[chart.areas.length - 1];
  const totalMinutes = chart.areas.reduce((a, s) => a + s.minutes, 0);
  const summary =
    `${metric.label}, ${r.label}: ${chart.data.length} điểm đo, hiện tại ${formatNumber(metric.value, metric.decimals)} ${metric.unitLong ?? metric.unit}. ` +
    (chart.areas.length
      ? `${chart.areas.length} lần ra ngoài ngưỡng, tổng ${formatDuration(totalMinutes)}.`
      : "Luôn trong ngưỡng.");

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card" aria-label={`Biểu đồ ${metric.label}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-ink">
          {metric.label} · {r.label} ({metric.unitLong ?? metric.unit})
        </h3>
        <RangeToggle value={range} onChange={onRangeChange} />
      </div>

      <figure className="m-0 mt-3 h-[260px]" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[chart.start, chart.end]}
              ticks={chart.xTicks}
              tickFormatter={(t: number) => (range === "7d" ? formatDay(t) : formatTime(t))}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              tickMargin={8}
            />
            <YAxis
              domain={chart.y.domain}
              ticks={chart.y.ticks}
              allowDataOverflow
              tickFormatter={(v: number) => formatNumber(v)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            {chart.areas.map((a) => (
              <ReferenceArea
                key={a.start}
                x1={a.x1}
                x2={a.x2}
                fill={RED}
                fillOpacity={0.08}
                stroke="none"
                label={
                  a === lastArea
                    ? {
                        value: `${a.side === "above" ? "Vượt" : "Dưới"} ngưỡng ${formatDuration(a.minutes)}`,
                        position: "insideTop",
                        fill: RED_TEXT,
                        fontSize: 11,
                        fontWeight: 500,
                      }
                    : undefined
                }
              />
            ))}
            {th.max != null && (
              <ReferenceLine
                y={th.max}
                stroke={RED}
                strokeDasharray="5 4"
                strokeWidth={1.25}
                label={{ value: limitText(metric, "max"), position: "insideBottomRight", fill: RED_TEXT, fontSize: 11 }}
              />
            )}
            {th.min != null && (
              <ReferenceLine
                y={th.min}
                stroke={RED}
                strokeDasharray="5 4"
                strokeWidth={1.25}
                label={{ value: limitText(metric, "min"), position: "insideTopRight", fill: RED_TEXT, fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: "#c9d2cc", strokeDasharray: "3 3" }}
              content={(p) => <SensorTooltip {...(p as unknown as TipProps)} metric={metric} range={range} />}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={BAMBOO_DARK}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: BAMBOO_DARK }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>

      <p className="mt-3 text-[11.5px] text-muted">
        Nguồn: iot.measurement · thuộc tính <span className="font-mono">{metric.key}</span> của mô hình {entity.type}
        {series.loading ? " · đang tải…" : chart.data.length === 0 ? " · chưa có số đo trong khoảng này" : ""}
        {r.bucket > 1 && ` · giá trị ${AGG_WORD[agg]} mỗi ${formatDuration(r.bucket)}`}
        {entity.offlineMinutes ? ` · mất tín hiệu ${entity.offlineMinutes} phút gần nhất` : ""}
      </p>
    </section>
  );
};
