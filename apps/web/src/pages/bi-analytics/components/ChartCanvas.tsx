/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Table } from "antd";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_TICK, GRID_STROKE } from "../../operations-center/components/chartTheme";
import { PALETTE, fmt, fmtCompact, valueLabel } from "../chart";
import type { ChartSpec, ChartType, Pivot, QueryResult } from "../types";
import { tr, trf } from "../../../i18n";

const Tip = ({
  active,
  label,
  payload,
  pivot,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string; name?: string }>;
  pivot: Pivot;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="max-w-[320px] rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-float">
      {label != null && <div className="mb-1 font-semibold text-ink">{label}</div>}
      <ul className="m-0 list-none space-y-0.5 p-0">
        {payload.map((p) => {
          const s = pivot.series.find((x) => x.key === p.dataKey);
          return (
            <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-ui" style={{ background: p.color }} aria-hidden />
              <span className="flex-1 truncate text-body">{s?.label ?? p.name}</span>
              <span className="font-medium tabular-nums text-ink">
                {fmt(Number(p.value ?? 0))}
                {s?.unit ? ` ${s.unit}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const describe = (pivot: Pivot) =>
  pivot.data
    .slice(0, 40)
    .map((p) => [p.__category, ...pivot.series.map((s) => `${s.label} ${fmt(Number(p[s.key] ?? 0))}`)].join(": "))
    .join("; ");

export const ChartCanvas = ({
  type,
  pivot,
  result,
  spec,
  labelOf,
}: {
  type: ChartType;
  pivot: Pivot;
  result: QueryResult;
  spec: ChartSpec;
  labelOf: (column: string) => string;
}) => {
  if (!result.rows.length)
    return (
      <p className="grid h-[360px] place-items-center text-[13px] text-muted">
        {tr("Không có số liệu trong khoảng đã chọn.")}
      </p>
    );

  if (type === "table") {
    const metricCols = result.measures.length > 1 ? result.measures.map((m) => m.name) : ["value"];
    return (
      <Table
        size="small"
        rowKey={(_, i) => String(i)}
        pagination={result.rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        dataSource={result.rows}
        scroll={{ x: true }}
        columns={result.columns.map((c, i) => {
          const m = metricCols.indexOf(c);
          const measure = m >= 0 ? result.measures[m] : undefined;
          return {
            key: c,
            title: measure ? measure.label : labelOf(c),
            align: measure ? ("right" as const) : ("left" as const),
            render: (_: unknown, row: QueryResult["rows"][number]) =>
              measure ? (
                <span className="tabular-nums">
                  {fmt(Number(row[i] ?? 0))}
                  {measure.unit ? ` ${measure.unit}` : ""}
                </span>
              ) : (
                valueLabel(c, row[i], spec.time_grain)
              ),
          };
        })}
      />
    );
  }

  const common = { data: pivot.data, margin: { top: 8, right: 12, bottom: 4, left: 4 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
      <XAxis dataKey="__category" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={64}
        tickFormatter={(v: number) => fmtCompact(v)}
      />
      <Tooltip cursor={{ fill: "rgba(47,122,62,0.06)" }} content={(p) => <Tip {...(p as object)} pivot={pivot} />} />
      {pivot.series.length > 1 && (
        <Legend
          formatter={(k: string) => pivot.series.find((s) => s.key === k)?.label ?? k}
          wrapperStyle={{ fontSize: 11.5 }}
        />
      )}
    </>
  );

  let chart;
  if (type === "pie") {
    const [first] = pivot.series;
    const slices = pivot.data.map((p) => ({ name: String(p.__category), value: Number(p[first?.key ?? ""] ?? 0) }));
    chart = (
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" isAnimationActive={false}>
          {slices.map((s, i) => (
            <Cell key={s.name} fill={PALETTE[i % PALETTE.length]} stroke="var(--color-surface)" />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-float">
                <span className="font-semibold text-ink">{payload[0].name}</span>:{" "}
                <span className="tabular-nums">
                  {fmt(Number(payload[0].value))}
                  {first?.unit ? ` ${first.unit}` : ""}
                </span>
              </div>
            ) : null
          }
        />
        <Legend wrapperStyle={{ fontSize: 11.5 }} />
      </PieChart>
    );
  } else if (type === "line") {
    chart = (
      <LineChart {...common}>
        {axes}
        {pivot.series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={pivot.data.length <= 31}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  } else if (type === "area") {
    chart = (
      <AreaChart {...common}>
        {axes}
        {pivot.series.map((s, i) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="a"
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.25}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <BarChart {...common} barGap={2}>
        {axes}
        {pivot.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={type === "stacked" ? "a" : undefined}
            fill={PALETTE[i % PALETTE.length]}
            radius={type === "stacked" ? 0 : [3, 3, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  }

  return (
    <div className="h-[380px]" role="img" aria-label={trf("Biểu đồ: {0}", [describe(pivot)])}>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  );
};
