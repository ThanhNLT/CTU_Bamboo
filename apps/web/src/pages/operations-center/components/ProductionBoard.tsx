/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { Tag } from "antd";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDay, formatMoney } from "../../../utils/format";
import { useOpsTab } from "../api";
import { AXIS_TICK, BAMBOO_DARK, BAMBOO_LIGHT, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, DefinitionButton } from "./ChartWidget";
import { fmtBucket, fmtHours, fmtMoneyShort, fmtNum, kpi } from "../boardFormat";
import { BoardState, KpiRow, NumTable } from "./BoardParts";
import { tr, trf } from "../../../i18n";

const STATUS_NAME: Record<string, string> = {
  RELEASED: tr("Đã xuất xưởng"),
  ON_HOLD: tr("Đang giữ"),
  SCRAPPED: tr("Hủy"),
  lots: tr("Lô sản xuất"),
  on_hold: tr("Trong đó đang giữ"),
};
const HOLD = "#eda100";
const SCRAP = "#c2410c";

export const ProductionBoard = ({ days }: { days: number }) => {
  const { data, error, loading, at } = useOpsTab("production", days);
  const t = data?.totals;
  const trend = (data?.trend ?? []).map((p) => ({ ...p, label: fmtBucket(p.at, days) }));

  return (
    <BoardState loading={loading} error={error} ready={Boolean(data)}>
      {data && t && (
        <>
          <KpiRow
            kpis={[
              kpi(
                {
                  key: "lots",
                  label: tr("Lô sản xuất trong kỳ"),
                  value: fmtNum(t.lots),
                  definition: trf("Lô có ngày sản xuất trong {0} ngày gần nhất (mọi trạng thái).", [days]),
                },
                at,
              ),
              kpi(
                {
                  key: "hold",
                  label: tr("Lô đang giữ"),
                  value: fmtNum(t.lots_on_hold),
                  delta: t.lots_on_hold
                    ? { dir: "dot", tone: "bad", text: tr("chưa được xuất") }
                    : { dir: "dot", tone: "good", text: tr("không có") },
                  definition: tr("Lô ở trạng thái ON_HOLD (chờ kiểm tra chất lượng), không dùng được cho đơn nội bộ."),
                },
                at,
              ),
              kpi(
                {
                  key: "scrap",
                  label: tr("Lô hủy trong kỳ"),
                  value: fmtNum(t.lots_scrapped),
                  definition: tr("Lô sản xuất trong kỳ ở trạng thái SCRAPPED."),
                },
                at,
              ),
              kpi(
                {
                  key: "ic_pending",
                  label: tr("Đơn nội bộ chờ xác nhận"),
                  value: fmtNum(t.ic_pending),
                  definition: tr("Đơn hàng nội bộ bên bán chưa xác nhận hay từ chối (bạn được xem)."),
                },
                at,
              ),
              kpi(
                {
                  key: "ic_value",
                  label: tr("Đơn nội bộ đã xác nhận"),
                  value: fmtMoneyShort(t.ic_confirmed_value),
                  delta: {
                    dir: "none",
                    tone: "neutral",
                    text: trf("xác nhận TB sau {0}", [fmtHours(t.ic_confirm_hours)]),
                  },
                  definition: tr("Giá trị đơn nội bộ được bên bán xác nhận trong kỳ."),
                },
                at,
              ),
              kpi(
                {
                  key: "po",
                  label: tr("Đơn mua phát hành"),
                  value: fmtNum(t.po_orders),
                  delta: { dir: "none", tone: "neutral", text: fmtMoneyShort(t.po_value) },
                  definition: tr("Đơn mua (PO) sinh từ đề nghị mua sắm đã duyệt trong kỳ."),
                },
                at,
              ),
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartWidget title={tr("Lô sản xuất theo thời gian")} meta={days <= 31 ? tr("Theo ngày") : tr("Theo tuần")}>
              <div
                className="h-[230px]"
                role="img"
                aria-label={trend.map((p) => trf("{0}: {1} lô", [p.label, p.lots])).join("; ")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(47,122,62,0.06)" }}
                      content={(p) => (
                        <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => STATUS_NAME[k] ?? k} />
                      )}
                    />
                    <Legend formatter={(k: string) => STATUS_NAME[k] ?? k} wrapperStyle={{ fontSize: 11.5 }} />
                    <Bar dataKey="lots" fill={BAMBOO_DARK} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="on_hold" fill={HOLD} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartWidget>

            <ChartWidget title={tr("Lô theo công ty và trạng thái")} meta={tr("Hiện tại")}>
              <div
                className="h-[230px]"
                role="img"
                aria-label={data.by_company
                  .map((c) =>
                    trf("{0}: {1} đã xuất, {2} đang giữ, {3} hủy", [c.company, c.RELEASED, c.ON_HOLD, c.SCRAPPED]),
                  )
                  .join("; ")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.by_company}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                    maxBarSize={28}
                  >
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="company"
                      width={130}
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(47,122,62,0.06)" }}
                      content={(p) => (
                        <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => STATUS_NAME[k] ?? k} />
                      )}
                    />
                    <Legend formatter={(k: string) => STATUS_NAME[k] ?? k} wrapperStyle={{ fontSize: 11.5 }} />
                    <Bar dataKey="RELEASED" stackId="s" fill={BAMBOO_LIGHT} isAnimationActive={false} />
                    <Bar dataKey="ON_HOLD" stackId="s" fill={HOLD} isAnimationActive={false} />
                    <Bar dataKey="SCRAPPED" stackId="s" fill={SCRAP} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartWidget>

            <ChartWidget title={tr("Mặt hàng")} meta={tr("Theo số lô")}>
              <NumTable
                rows={data.items}
                rowKey={(r) => `${r.item}-${r.uom}`}
                empty={tr("Chưa có lô sản xuất.")}
                columns={[
                  { title: tr("Mặt hàng"), render: (r) => r.item },
                  { title: tr("Số lô"), render: (r) => fmtNum(r.lots) },
                  { title: tr("Đã xuất xưởng"), render: (r) => `${fmtNum(r.released)} ${r.uom}` },
                  { title: tr("Đang giữ"), render: (r) => (r.on_hold ? `${fmtNum(r.on_hold)} ${r.uom}` : "—") },
                ]}
              />
            </ChartWidget>

            <ChartWidget
              title={tr("Đơn hàng nội bộ giữa các công ty")}
              meta={trf("{0} ngày", [days])}
              footer={
                <DefinitionButton
                  text={tr(
                    "Bên mua đặt qua đề nghị mua sắm chọn nhà cung cấp nội bộ; bên bán xác nhận kèm lô xuất (ADR #42). Số đơn: tạo trong kỳ hoặc đang chờ.",
                  )}
                />
              }
            >
              <NumTable
                rows={data.flows}
                rowKey={(r) => `${r.buyer}-${r.seller}`}
                empty={tr("Chưa có đơn hàng nội bộ bạn được xem.")}
                columns={[
                  { title: tr("Bên mua → bên bán"), render: (r) => `${r.buyer} → ${r.seller}` },
                  { title: tr("Đơn"), render: (r) => fmtNum(r.orders) },
                  {
                    title: tr("Chờ xác nhận"),
                    render: (r) => (
                      <span className={r.pending ? "font-semibold text-amber-700" : ""}>{fmtNum(r.pending)}</span>
                    ),
                  },
                  { title: tr("Đã xác nhận"), render: (r) => formatMoney(r.confirmed_value) },
                ]}
              />
            </ChartWidget>
          </div>

          <ChartWidget title={tr("Lô đang giữ")} meta={tr("Chờ kết luận chất lượng")}>
            <NumTable
              rows={data.held}
              rowKey={(r) => r.lot_no}
              empty={tr("Không có lô nào đang giữ.")}
              columns={[
                { title: tr("Số lô"), render: (r) => <span className="font-mono">{r.lot_no}</span> },
                { title: tr("Mặt hàng"), render: (r) => r.item, align: "left" },
                { title: tr("Công ty"), render: (r) => r.company, align: "left" },
                { title: tr("Số lượng"), render: (r) => `${fmtNum(r.quantity)} ${r.uom}` },
                { title: tr("Ngày sản xuất"), render: (r) => formatDay(r.produced_on) },
                {
                  title: tr("Ghi chú"),
                  align: "left",
                  render: (r) => (r.note ? <Tag color="gold">{r.note}</Tag> : "—"),
                },
              ]}
            />
          </ChartWidget>
        </>
      )}
    </BoardState>
  );
};
