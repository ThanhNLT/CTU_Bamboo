// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { useState } from "react"; // React
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"; // Recharts

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import type { Company, CompanyKey, DailyPoint } from "../types";
import { AXIS_TICK, DIM, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, ChipButton, DefinitionButton } from "./ChartWidget";

// ===== Hằng số =====
const DEFINITION =
  "Số hồ sơ hoàn tất toàn bộ chuỗi duyệt mỗi ngày (sự kiện COMPLETED), theo đơn vị cấp 1 của đơn vị lập. " +
  "Nguồn: wf.approval_history, trong phạm vi bạn được xem.";

// ===== Component =====
/** Nhãn trực tiếp ở cuối mỗi đường ("Chip 17"); Recharts truyền x, y, index, value cho từng điểm. */
const EndLabel = (props: {
  x?: number | string;
  y?: number | string;
  index?: number;
  value?: number | string;
  text: string;
  strong: boolean;
  faded: boolean;
  last: number;
}) => {
  const { x, y, index, value, text, strong, faded, last } = props;
  if (index !== last || x == null || y == null) return null;
  return (
    <text
      x={Number(x) + 8}
      y={Number(y)}
      dy={4}
      fontSize={11}
      fontWeight={strong ? 600 : 400}
      fill="#36413a"
      opacity={faded ? 0.45 : 1}
    >
      {text} {value}
    </text>
  );
};

/** Hồ sơ được duyệt mỗi ngày — mỗi công ty một đường; công ty đang tô sáng nét đậm, còn lại mờ đi. */
export const DailyApprovalsChart = ({
  data,
  companies,
  company,
  meta,
  rangeLabel,
  highlight,
  onHighlight,
}: {
  data: DailyPoint[];
  companies: Company[];
  company: Record<CompanyKey, Company>;
  meta: string;
  rangeLabel: string;
  highlight?: CompanyKey;
  onHighlight: (c?: CompanyKey) => void;
}) => {
  const [asTable, setAsTable] = useState(false);
  const last = data.length - 1;

  return (
    <ChartWidget
      title="Hồ sơ được duyệt mỗi ngày"
      meta={meta}
      footer={
        <>
          <ChipButton pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? "Xem dạng biểu đồ" : "Xem dạng bảng"}
          </ChipButton>
          <DefinitionButton text={DEFINITION} />
        </>
      }
    >
      {/* Chú giải: luôn có với ≥ 2 chuỗi; bấm để tô sáng công ty. */}
      <ul className="m-0 mb-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0" aria-label="Chú giải">
        {companies.length === 0 && <li className="text-[11.5px] text-muted">Chưa có hồ sơ duyệt xong trong kỳ.</li>}
        {companies.map((c) => (
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
                {companies.map((c) => (
                  <th key={c.key} className="py-1 text-right font-medium">
                    {c.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums text-ink">
              {data.map((d) => (
                <tr key={d.day} className="border-t border-line/70">
                  <td className="py-1">{d.day}</td>
                  {companies.map((c) => (
                    <td key={c.key} className="py-1 text-right">
                      {d[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="h-[240px]"
          role="img"
          aria-label={`Biểu đồ đường hồ sơ được duyệt mỗi ngày theo công ty, ${rangeLabel}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 110, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="day"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                interval={Math.max(0, Math.ceil(data.length / 7) - 1)}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip
                cursor={{ stroke: "#c3e0c8", strokeWidth: 1 }}
                content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => company[k]?.name ?? k} />}
              />
              {companies.map((c) => {
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
                    label={<EndLabel text={c.short} strong={strong} faded={faded} last={last} />}
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
