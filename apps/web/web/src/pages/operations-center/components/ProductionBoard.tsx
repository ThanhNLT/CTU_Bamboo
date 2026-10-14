// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Bảng "Sản xuất": lô sản xuất (mfg.lot) theo công ty và trạng thái, sản lượng theo kỳ, mặt hàng, lô đang giữ;
// đơn hàng nội bộ giữa các công ty và đơn mua (Action ops_dashboard, chỉ phần người dùng được xem).

// ===== Thư viện =====
import { Tag } from "antd"; // Ant Design
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"; // Recharts

// ===== Module nội bộ =====
import { formatDay, formatMoney } from "../../../utils/format";
import { useOpsTab } from "../api";
import { AXIS_TICK, BAMBOO_DARK, BAMBOO_LIGHT, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, DefinitionButton } from "./ChartWidget";
import { fmtBucket, fmtHours, fmtMoneyShort, fmtNum, kpi } from "../boardFormat";
import { BoardState, KpiRow, NumTable } from "./BoardParts";

// ===== Hằng số =====
const STATUS_NAME: Record<string, string> = {
  RELEASED: "Đã xuất xưởng",
  ON_HOLD: "Đang giữ",
  SCRAPPED: "Hủy",
  lots: "Lô sản xuất",
  on_hold: "Trong đó đang giữ",
};
const HOLD = "#eda100";
const SCRAP = "#c2410c";

// ===== Component =====
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
                  label: "Lô sản xuất trong kỳ",
                  value: fmtNum(t.lots),
                  definition: `Lô có ngày sản xuất trong ${days} ngày gần nhất (mọi trạng thái).`,
                },
                at,
              ),
              kpi(
                {
                  key: "hold",
                  label: "Lô đang giữ",
                  value: fmtNum(t.lots_on_hold),
                  delta: t.lots_on_hold
                    ? { dir: "dot", tone: "bad", text: "chưa được xuất" }
                    : { dir: "dot", tone: "good", text: "không có" },
                  definition: "Lô ở trạng thái ON_HOLD (chờ kiểm tra chất lượng), không dùng được cho đơn nội bộ.",
                },
                at,
              ),
              kpi(
                {
                  key: "scrap",
                  label: "Lô hủy trong kỳ",
                  value: fmtNum(t.lots_scrapped),
                  definition: "Lô sản xuất trong kỳ ở trạng thái SCRAPPED.",
                },
                at,
              ),
              kpi(
                {
                  key: "ic_pending",
                  label: "Đơn nội bộ chờ xác nhận",
                  value: fmtNum(t.ic_pending),
                  definition: "Đơn hàng nội bộ bên bán chưa xác nhận hay từ chối (bạn được xem).",
                },
                at,
              ),
              kpi(
                {
                  key: "ic_value",
                  label: "Đơn nội bộ đã xác nhận",
                  value: fmtMoneyShort(t.ic_confirmed_value),
                  delta: {
                    dir: "none",
                    tone: "neutral",
                    text: `xác nhận TB sau ${fmtHours(t.ic_confirm_hours)}`,
                  },
                  definition: "Giá trị đơn nội bộ được bên bán xác nhận trong kỳ.",
                },
                at,
              ),
              kpi(
                {
                  key: "po",
                  label: "Đơn mua phát hành",
                  value: fmtNum(t.po_orders),
                  delta: { dir: "none", tone: "neutral", text: fmtMoneyShort(t.po_value) },
                  definition: "Đơn mua (PO) sinh từ đề nghị mua sắm đã duyệt trong kỳ.",
                },
                at,
              ),
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartWidget title="Lô sản xuất theo thời gian" meta={days <= 31 ? "Theo ngày" : "Theo tuần"}>
              <div
                className="h-[230px]"
                role="img"
                aria-label={trend.map((p) => `${p.label}: ${p.lots} lô`).join("; ")}
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

            <ChartWidget title="Lô theo công ty và trạng thái" meta="Hiện tại">
              <div
                className="h-[230px]"
                role="img"
                aria-label={data.by_company
                  .map((c) => `${c.company}: ${c.RELEASED} đã xuất, ${c.ON_HOLD} đang giữ, ${c.SCRAPPED} hủy`)
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

            <ChartWidget title="Mặt hàng" meta="Theo số lô">
              <NumTable
                rows={data.items}
                rowKey={(r) => `${r.item}-${r.uom}`}
                empty="Chưa có lô sản xuất."
                columns={[
                  { title: "Mặt hàng", render: (r) => r.item },
                  { title: "Số lô", render: (r) => fmtNum(r.lots) },
                  { title: "Đã xuất xưởng", render: (r) => `${fmtNum(r.released)} ${r.uom}` },
                  { title: "Đang giữ", render: (r) => (r.on_hold ? `${fmtNum(r.on_hold)} ${r.uom}` : "—") },
                ]}
              />
            </ChartWidget>

            <ChartWidget
              title="Đơn hàng nội bộ giữa các công ty"
              meta={`${days} ngày`}
              footer={
                <DefinitionButton text="Bên mua đặt qua đề nghị mua sắm chọn nhà cung cấp nội bộ; bên bán xác nhận kèm lô xuất (ADR #42). Số đơn: tạo trong kỳ hoặc đang chờ." />
              }
            >
              <NumTable
                rows={data.flows}
                rowKey={(r) => `${r.buyer}-${r.seller}`}
                empty="Chưa có đơn hàng nội bộ bạn được xem."
                columns={[
                  { title: "Bên mua → bên bán", render: (r) => `${r.buyer} → ${r.seller}` },
                  { title: "Đơn", render: (r) => fmtNum(r.orders) },
                  {
                    title: "Chờ xác nhận",
                    render: (r) => (
                      <span className={r.pending ? "font-semibold text-amber-700" : ""}>{fmtNum(r.pending)}</span>
                    ),
                  },
                  { title: "Đã xác nhận", render: (r) => formatMoney(r.confirmed_value) },
                ]}
              />
            </ChartWidget>
          </div>

          <ChartWidget title="Lô đang giữ" meta="Chờ kết luận chất lượng">
            <NumTable
              rows={data.held}
              rowKey={(r) => r.lot_no}
              empty="Không có lô nào đang giữ."
              columns={[
                { title: "Số lô", render: (r) => <span className="font-mono">{r.lot_no}</span> },
                { title: "Mặt hàng", render: (r) => r.item, align: "left" },
                { title: "Công ty", render: (r) => r.company, align: "left" },
                { title: "Số lượng", render: (r) => `${fmtNum(r.quantity)} ${r.uom}` },
                { title: "Ngày sản xuất", render: (r) => formatDay(r.produced_on) },
                {
                  title: "Ghi chú",
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
