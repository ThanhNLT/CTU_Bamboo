// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "../../../utils/cn";
import { COMPANIES, COMPANY, DAILY_APPROVALS, DEFINITIONS } from "../mock";
import type { CompanyKey } from "../types";
import { AXIS_TICK, DIM, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, ChipButton, DefinitionButton } from "./ChartWidget";

const LAST = DAILY_APPROVALS.length - 1;

/** Nhãn trực tiếp ở cuối mỗi đường ("Chip 17"); Recharts truyền x, y, index, value cho từng điểm. */
const EndLabel = (props: { x?: number | string; y?: number | string; index?: number; value?: number | string; text: string; strong: boolean; faded: boolean }) => {
  const { x, y, index, value, text, strong, faded } = props;
  if (index !== LAST || x == null || y == null) return null;
  return (
    <text x={Number(x) + 8} y={Number(y)} dy={4} fontSize={11} fontWeight={strong ? 600 : 400} fill="#36413a" opacity={faded ? 0.45 : 1}>
      {text} {value}
    </text>
  );
};

/** Hồ sơ được duyệt mỗi ngày — 4 đường theo công ty; công ty đang tô sáng nét đậm, còn lại mờ đi. */
export const DailyApprovalsChart = ({
  highlight, onHighlight,
}: {
  highlight?: CompanyKey;
  onHighlight: (c?: CompanyKey) => void;
}) => {
  const [asTable, setAsTable] = useState(false);

  return (
    <ChartWidget
      title="Hồ sơ được duyệt mỗi ngày"
      meta="Nóng · 10:42"
      footer={
        <>
          <ChipButton pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? "Xem dạng biểu đồ" : "Xem dạng bảng"}
          </ChipButton>
          <DefinitionButton text={DEFINITIONS.daily} />
        </>
      }
    >
      {/* Chú giải: luôn có với ≥ 2 chuỗi; bấm để tô sáng công ty. */}
      <ul className="m-0 mb-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0" aria-label="Chú giải">
        {COMPANIES.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => onHighlight(highlight === c.key ? undefined : c.key)}
              aria-pressed={highlight === c.key}
              className={cn(
                "inline-flex items-center gap-1.5 text-[11.5px] transition-opacity",
                highlight && highlight !== c.key ? "opacity-50" : "opacity-100",
                highlight === c.key ? "font-semibold text-ink" : "text-body",
              )}
            >
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: c.color }} aria-hidden />
              {c.name}
            </button>
          </li>
        ))}
      </ul>

      {asTable ? (
        <div className="max-h-[240px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Ngày</th>
                {COMPANIES.map((c) => <th key={c.key} className="py-1 text-right font-medium">{c.short}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums text-ink">
              {DAILY_APPROVALS.map((d) => (
                <tr key={d.day} className="border-t border-line/70">
                  <td className="py-1">{d.day}</td>
                  {COMPANIES.map((c) => <td key={c.key} className="py-1 text-right">{d[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[240px]" role="img" aria-label="Biểu đồ đường hồ sơ được duyệt mỗi ngày theo công ty, 23/09 đến 06/10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={DAILY_APPROVALS} margin={{ top: 8, right: 84, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={3} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip
                cursor={{ stroke: "#c3e0c8", strokeWidth: 1 }}
                content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => COMPANY[k as CompanyKey].name} />}
              />
              {COMPANIES.map((c) => {
                const faded = Boolean(highlight && highlight !== c.key);
                const strong = highlight === c.key;
                return (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={c.name}
                    stroke={c.color}
                    strokeWidth={strong ? 2.75 : 2}
                    strokeOpacity={faded ? DIM : 1}
                    dot={false}
                    activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                    isAnimationActive={false}
                    label={<EndLabel text={c.short} strong={strong} faded={faded} />}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartWidget>
  );
};
