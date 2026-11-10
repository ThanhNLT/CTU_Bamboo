import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useOpsTab } from "../api";
import { BAMBOO_DARK, BAMBOO_LIGHT, AXIS_TICK, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, DefinitionButton } from "./ChartWidget";
import { fmtBucket, fmtHours, fmtNum, kpi } from "../boardFormat";
import { BoardState, KpiRow, NumTable } from "./BoardParts";
import { tr, trf } from "../../../i18n";

const SERIES: Record<string, string> = {
  submitted: tr("Gửi duyệt"),
  completed: tr("Duyệt xong"),
  other: tr("Trả về / từ chối / hủy"),
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
                  label: tr("Hồ sơ gửi duyệt"),
                  value: fmtNum(t.submitted),
                  definition: trf("Số lần gửi duyệt (kể cả gửi lại sau khi bị trả về) trong {0} ngày.", [days]),
                },
                at,
              ),
              kpi(
                {
                  key: "completed",
                  label: tr("Duyệt xong"),
                  value: fmtNum(t.completed),
                  delta: { dir: "none", tone: "neutral", text: trf("{0} lần trả về", [fmtNum(t.returned)]) },
                  definition: tr("Chứng từ đi hết chuỗi duyệt trong kỳ."),
                },
                at,
              ),
              kpi(
                {
                  key: "rate",
                  label: tr("Tỉ lệ duyệt"),
                  value: t.approval_rate == null ? "—" : `${fmtNum(t.approval_rate)}%`,
                  definition: tr("Duyệt xong / (duyệt xong + từ chối + hủy) trong kỳ."),
                },
                at,
              ),
              kpi(
                {
                  key: "cycle",
                  label: tr("Thời gian duyệt trung bình"),
                  value: fmtHours(t.avg_hours),
                  delta: { dir: "none", tone: "neutral", text: `90% xong trong ${fmtHours(t.p90_hours)}` },
                  definition: tr("Từ lần gửi duyệt cuối tới khi duyệt xong, với chứng từ duyệt xong trong kỳ."),
                },
                at,
              ),
              kpi(
                {
                  key: "open",
                  label: tr("Việc đang chờ"),
                  value: fmtNum(t.open),
                  definition: tr("Bước duyệt đang mở (tính tại thời điểm xem)."),
                },
                at,
              ),
              kpi(
                {
                  key: "overdue",
                  label: trf("Quá hạn {0} giờ", [sla]),
                  value: fmtNum(t.overdue),
                  delta: t.overdue
                    ? { dir: "dot", tone: "bad", text: tr("cần đôn đốc") }
                    : { dir: "dot", tone: "good", text: tr("không có") },
                  definition: trf("Bước duyệt đang mở lâu hơn {0} giờ (hạn tạm, backend chưa có hạn theo bước).", [
                    sla,
                  ]),
                },
                at,
              ),
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartWidget
              title={tr("Gửi duyệt và duyệt xong theo thời gian")}
              meta={days <= 31 ? tr("Theo ngày") : tr("Theo tuần")}
              footer={
                <DefinitionButton
                  text={tr(
                    "Nguồn: wf.approval_history (sự kiện SUBMITTED, COMPLETED, REJECTED, RETURNED, CANCELLED) của chứng từ bạn được xem.",
                  )}
                />
              }
            >
              <div
                className="h-[240px]"
                role="img"
                aria-label={trend
                  .map((p) => trf("{0}: gửi {1}, xong {2}", [p.label, p.submitted, p.completed]))
                  .join("; ")}
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

            <ChartWidget title={tr("Theo loại chứng từ")} meta={trf("{0} ngày", [days])}>
              <NumTable
                rows={data.by_type}
                rowKey={(r) => r.entity_type}
                empty={tr("Chưa có chứng từ.")}
                columns={[
                  { title: tr("Loại"), render: (r) => r.label },
                  { title: tr("Gửi"), render: (r) => fmtNum(r.submitted) },
                  { title: "Xong", render: (r) => fmtNum(r.completed) },
                  { title: tr("Trả về"), render: (r) => fmtNum(r.returned) },
                  { title: tr("Từ chối / hủy"), render: (r) => fmtNum(r.rejected + r.cancelled) },
                  { title: tr("Đang chờ"), render: (r) => fmtNum(r.open) },
                  {
                    title: tr("Quá hạn"),
                    render: (r) => (
                      <span className={r.overdue ? "font-semibold text-red-600" : ""}>{fmtNum(r.overdue)}</span>
                    ),
                  },
                  { title: tr("TB duyệt"), render: (r) => fmtHours(r.avg_hours) },
                ]}
              />
            </ChartWidget>
          </div>

          <ChartWidget
            title={tr("Điểm nghẽn theo vị trí duyệt")}
            meta={tr("Xếp theo việc quá hạn, rồi thời gian xử lý")}
            footer={
              <DefinitionButton
                text={trf(
                  "Mỗi dòng là một vị trí nhận việc duyệt: số việc đã xử lý trong kỳ và thời gian trung bình, số việc đang chờ, quá hạn {0} giờ, việc chờ lâu nhất.",
                  [sla],
                )}
              />
            }
          >
            <NumTable
              rows={data.bottlenecks}
              rowKey={(r, i) => `${r.position}-${r.unit}-${i}`}
              empty={tr("Không có việc duyệt nào trong kỳ.")}
              columns={[
                { title: tr("Vị trí"), render: (r) => r.position },
                { title: tr("Đơn vị"), render: (r) => r.unit, align: "left" },
                { title: tr("Đã xử lý"), render: (r) => fmtNum(r.closed) },
                { title: tr("TB xử lý"), render: (r) => fmtHours(r.avg_hours) },
                { title: tr("Đang chờ"), render: (r) => fmtNum(r.open) },
                {
                  title: tr("Quá hạn"),
                  render: (r) => (
                    <span className={r.overdue ? "font-semibold text-red-600" : ""}>{fmtNum(r.overdue)}</span>
                  ),
                },
                { title: tr("Chờ lâu nhất"), render: (r) => fmtHours(r.oldest_open_hours) },
              ]}
            />
          </ChartWidget>
        </>
      )}
    </BoardState>
  );
};
