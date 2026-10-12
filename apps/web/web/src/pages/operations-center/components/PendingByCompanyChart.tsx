// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Company, CompanyKey, PendingRow } from "../types";
import { BAMBOO_DARK, BAMBOO_LIGHT, DIM, INK } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget } from "./ChartWidget";

const LEVEL_NAME: Record<string, string> = { l1: "Cấp 1", l2: "Cấp 2+" };

/** Tổng ở cuối thanh xếp chồng. */
const TotalLabel = (props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number; totals?: number[] }) => {
  const { x, y, width, height, index, totals } = props;
  if (x == null || y == null || index == null || !totals) return null;
  return (
    <text x={Number(x) + Number(width ?? 0) + 8} y={Number(y) + Number(height ?? 0) / 2} dy={4} fontSize={11.5} fontWeight={600} fill="#1b231e">
      {totals[index]}
    </text>
  );
};

/**
 * Hồ sơ đang chờ theo công ty — thanh ngang xếp chồng Cấp 1 / Cấp 2 (hai bậc cùng một sắc xanh).
 * Bấm một thanh để tô sáng công ty đó trên cả trang; Esc để bỏ.
 */
export const PendingByCompanyChart = ({
  rows, company, meta, highlight, onHighlight,
}: {
  rows: PendingRow[];
  company: Record<CompanyKey, Company>;
  meta: string;
  highlight?: CompanyKey;
  onHighlight: (c?: CompanyKey) => void;
}) => {
  const DATA = rows.map((r) => ({ ...r, name: company[r.company]?.short ?? r.company, total: r.l1 + r.l2 }));
  const toggle = (index: number) => {
    const key = DATA[index]?.company;
    onHighlight(key === highlight ? undefined : key);
  };
  const opacity = (key: CompanyKey) => (highlight && highlight !== key ? DIM + 0.18 : 1);

  return (
    <ChartWidget
      title="Hồ sơ đang chờ theo công ty"
      meta={meta}
      footer={<p className="text-[11.5px] text-muted">Nhấn một thanh để tô sáng cả trang · Esc để bỏ</p>}
    >
      <ul className="m-0 mb-2 flex list-none gap-4 p-0 text-[11.5px] text-body" aria-label="Chú giải">
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAMBOO_DARK }} aria-hidden />Cấp 1</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAMBOO_LIGHT }} aria-hidden />Cấp 2 trở lên</li>
      </ul>
      {DATA.length === 0 && <p className="py-16 text-center text-[13px] text-muted">Không có hồ sơ nào đang chờ.</p>}
      <div className={DATA.length ? "h-[220px]" : "hidden"} role="img" aria-label={DATA.map((d) => `${d.name}: ${d.total} hồ sơ chờ (cấp 1 ${d.l1}, cấp 2 ${d.l2})`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={DATA} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={14}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={120}
              tick={(p: { x?: number | string; y?: number | string; payload?: { value?: string }; index?: number }) => {
                const key = DATA[p.index ?? 0]?.company;
                return (
                  <text x={Number(p.x) - 4} y={Number(p.y)} dy={4} textAnchor="end" fontSize={12}
                        fontWeight={key === highlight ? 600 : 400} fill={INK}>
                    {p.payload?.value}
                  </text>
                );
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(47,122,62,0.06)" }}
              content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => LEVEL_NAME[k] ?? k} />}
            />
            <Bar dataKey="l1" stackId="s" fill={BAMBOO_DARK} stroke="#fff" strokeWidth={2} radius={[4, 0, 0, 4]}
                 cursor="pointer" onClick={(_d: unknown, i: number) => toggle(i)} isAnimationActive={false}>
              {DATA.map((d) => <Cell key={d.company} fillOpacity={opacity(d.company)} />)}
            </Bar>
            <Bar dataKey="l2" stackId="s" fill={BAMBOO_LIGHT} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]}
                 cursor="pointer" onClick={(_d: unknown, i: number) => toggle(i)} isAnimationActive={false}>
              {DATA.map((d) => <Cell key={d.company} fillOpacity={opacity(d.company)} />)}
              <LabelList content={<TotalLabel totals={DATA.map((d) => d.total)} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWidget>
  );
};
