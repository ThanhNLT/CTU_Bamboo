// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useOpsTab } from "../api";
import { BAMBOO_DARK, BAMBOO_LIGHT, AXIS_TICK, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, DefinitionButton } from "./ChartWidget";
import { fmtBucket, fmtHours, fmtNum, kpi } from "../boardFormat";
import { BoardState, KpiRow, NumTable } from "./BoardParts";

const SERIES: Record<string, string> = {
  submitted: "Gửi duyệt",
  completed: "Duyệt xong",
  other: "Trả về / từ chối / hủy",
};
const OTHER_COLOR = "#eb6834";

export const ProcessBoard = ({ days, sla }: { days: number; sla: number }) => {
  const { data, error, loading, at } = useOpsTab("process", days);
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
                  key: "submitted",
                  label: "Hồ sơ gửi duyệt",
                  value: fmtNum(t.submitted),
                  definition: `Số lần gửi duyệt (kể cả gửi lại sau khi bị trả về) trong ${days} ngày.`,
                },
                at,
              ),
              kpi(
                {
                  key: "completed",
                  label: "Duyệt xong",
                  value: fmtNum(t.completed),
                  delta: { dir: "none", tone: "neutral", text: `${fmtNum(t.returned)} lần trả về` },
                  definition: "Chứng từ đi hết chuỗi duyệt trong kỳ.",
                },
                at,
              ),
              kpi(
                {
                  key: "rate",
                  label: "Tỉ lệ duyệt",
                  value: t.approval_rate == null ? "—" : `${fmtNum(t.approval_rate)}%`,
                  definition: "Duyệt xong / (duyệt xong + từ chối + hủy) trong kỳ.",
                },
                at,
              ),
              kpi(
                {
                  key: "cycle",
                  label: "Thời gian duyệt trung bình",
                  value: fmtHours(t.avg_hours),
                  delta: { dir: "none", tone: "neutral", text: `90% xong trong ${fmtHours(t.p90_hours)}` },
                  definition: "Từ lần gửi duyệt cuối tới khi duyệt xong, với chứng từ duyệt xong trong kỳ.",
                },
                at,
              ),
              kpi(
                {
                  key: "open",
                  label: "Việc đang chờ",
                  value: fmtNum(t.open),
                  definition: "Bước duyệt đang mở (tính tại thời điểm xem).",
                },
                at,
              ),
              kpi(
                {
                  key: "overdue",
                  label: `Quá hạn ${sla} giờ`,
                  value: fmtNum(t.overdue),
                  delta: t.overdue
                    ? { dir: "dot", tone: "bad", text: "cần đôn đốc" }
                    : { dir: "dot", tone: "good", text: "không có" },
                  definition: `Bước duyệt đang mở lâu hơn ${sla} giờ (hạn tạm, backend chưa có hạn theo bước).`,
                },
                at,
              ),
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartWidget
              title="Gửi duyệt và duyệt xong theo thời gian"
              meta={days <= 31 ? "Theo ngày" : "Theo tuần"}
              footer={
                <DefinitionButton text="Nguồn: wf.approval_history (sự kiện SUBMITTED, COMPLETED, REJECTED, RETURNED, CANCELLED) của chứng từ bạn được xem." />
              }
            >
              <div
                className="h-[240px]"
                role="img"
                aria-label={trend.map((p) => `${p.label}: gửi ${p.submitted}, xong ${p.completed}`).join("; ")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={2}>
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
                      content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => SERIES[k] ?? k} />}
                    />
                    <Legend formatter={(k: string) => SERIES[k] ?? k} wrapperStyle={{ fontSize: 11.5 }} />
                    <Bar dataKey="submitted" fill={BAMBOO_LIGHT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="completed" fill={BAMBOO_DARK} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="other" fill={OTHER_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartWidget>

            <ChartWidget title="Theo loại chứng từ" meta={`${days} ngày`}>
              <NumTable
                rows={data.by_type}
                rowKey={(r) => r.entity_type}
                empty="Chưa có chứng từ."
                columns={[
                  { title: "Loại", render: (r) => r.label },
                  { title: "Gửi", render: (r) => fmtNum(r.submitted) },
                  { title: "Xong", render: (r) => fmtNum(r.completed) },
                  { title: "Trả về", render: (r) => fmtNum(r.returned) },
                  { title: "Từ chối / hủy", render: (r) => fmtNum(r.rejected + r.cancelled) },
                  { title: "Đang chờ", render: (r) => fmtNum(r.open) },
                  {
                    title: "Quá hạn",
                    render: (r) => (
                      <span className={r.overdue ? "font-semibold text-red-600" : ""}>{fmtNum(r.overdue)}</span>
                    ),
                  },
                  { title: "TB duyệt", render: (r) => fmtHours(r.avg_hours) },
                ]}
              />
            </ChartWidget>
          </div>

          <ChartWidget
            title="Điểm nghẽn theo vị trí duyệt"
            meta="Xếp theo việc quá hạn, rồi thời gian xử lý"
            footer={
              <DefinitionButton
                text={`Mỗi dòng là một vị trí nhận việc duyệt: số việc đã xử lý trong kỳ và thời gian trung bình, số việc đang chờ, quá hạn ${sla} giờ, việc chờ lâu nhất.`}
              />
            }
          >
            <NumTable
              rows={data.bottlenecks}
              rowKey={(r, i) => `${r.position}-${r.unit}-${i}`}
              empty="Không có việc duyệt nào trong kỳ."
              columns={[
                { title: "Vị trí", render: (r) => r.position },
                { title: "Đơn vị", render: (r) => r.unit, align: "left" },
                { title: "Đã xử lý", render: (r) => fmtNum(r.closed) },
                { title: "TB xử lý", render: (r) => fmtHours(r.avg_hours) },
                { title: "Đang chờ", render: (r) => fmtNum(r.open) },
                {
                  title: "Quá hạn",
                  render: (r) => (
                    <span className={r.overdue ? "font-semibold text-red-600" : ""}>{fmtNum(r.overdue)}</span>
                  ),
                },
                { title: "Chờ lâu nhất", render: (r) => fmtHours(r.oldest_open_hours) },
              ]}
            />
          </ChartWidget>
        </>
      )}
    </BoardState>
  );
};
