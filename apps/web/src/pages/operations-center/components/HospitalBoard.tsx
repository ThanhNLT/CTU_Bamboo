// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert } from "antd";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney } from "../../../utils/format";
import { useOpsTab, type HospitalTenant } from "../api";
import { AXIS_TICK, BAMBOO_DARK, BAMBOO_LIGHT, GRID_STROKE } from "./chartTheme";
import { ChartTooltip, type TipProps } from "./ChartTooltip";
import { ChartWidget, DefinitionButton } from "./ChartWidget";
import { fmtMoneyShort, fmtNum, kpi } from "../boardFormat";
import { BoardState, KpiRow, NumTable } from "./BoardParts";
import { tr, trf } from "../../../i18n";

const SERIES: Record<string, string> = {
  headcount: tr("Nhân sự"),
  vacant: tr("Vị trí trống"),
  pr_approved: tr("Đề nghị duyệt xong"),
};

const TenantBoard = ({ t, days, at }: { t: HospitalTenant; days: number; at?: Date }) => (
  <section className="flex flex-col gap-4" aria-label={t.tenant}>
    <h2 className="m-0 text-[17px] font-semibold text-ink">{t.tenant}</h2>
    <KpiRow
      kpis={[
        kpi(
          {
            key: "headcount",
            label: tr("Nhân sự đang làm"),
            value: fmtNum(t.headcount),
            definition: tr("Số người đang giữ ít nhất một vị trí."),
          },
          at,
        ),
        kpi(
          {
            key: "vacant",
            label: tr("Vị trí trống"),
            value: fmtNum(t.vacant),
            delta: { dir: "none", tone: "neutral", text: trf("trên {0} vị trí", [fmtNum(t.positions)]) },
            definition: tr("Vị trí còn hiệu lực chưa có người giữ."),
          },
          at,
        ),
        kpi(
          {
            key: "onboarding",
            label: tr("Tiếp nhận nhân sự"),
            value: fmtNum(t.onboarding_approved),
            delta: { dir: "none", tone: "neutral", text: trf("{0} đề nghị mới", [fmtNum(t.onboarding_created)]) },
            definition: trf("Đề nghị tiếp nhận được duyệt trong {0} ngày (và số đề nghị lập mới).", [days]),
          },
          at,
        ),
        kpi(
          {
            key: "pr",
            label: tr("Đề nghị mua sắm gửi duyệt"),
            value: fmtNum(t.pr_submitted),
            delta: { dir: "none", tone: "neutral", text: trf("{0} đang chờ", [fmtNum(t.pr_pending)]) },
            definition: trf("Đề nghị mua sắm được gửi duyệt trong {0} ngày.", [days]),
          },
          at,
        ),
        kpi(
          {
            key: "pr_value",
            label: tr("Giá trị mua sắm đã duyệt"),
            value: fmtMoneyShort(t.pr_approved_value),
            definition: trf("Tổng tiền đề nghị mua sắm duyệt xong trong {0} ngày.", [days]),
          },
          at,
        ),
        kpi(
          {
            key: "tasks",
            label: tr("Việc duyệt đang chờ"),
            value: fmtNum(t.open_tasks),
            delta: t.overdue_tasks
              ? { dir: "dot", tone: "bad", text: trf("{0} quá hạn", [fmtNum(t.overdue_tasks)]) }
              : { dir: "dot", tone: "good", text: tr("không quá hạn") },
            definition: tr("Bước duyệt đang mở của chứng từ thuộc bệnh viện."),
          },
          at,
        ),
      ]}
    />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartWidget title={tr("Nhân sự và vị trí trống theo khối / khoa")}>
        <div
          className="h-[240px]"
          role="img"
          aria-label={t.units
            .map((u) => trf("{0}: {1} người, {2} vị trí trống", [u.unit, u.headcount, u.vacant]))
            .join("; ")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={t.units}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
              maxBarSize={14}
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="unit" width={150} tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(47,122,62,0.06)" }}
                content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => SERIES[k] ?? k} />}
              />
              <Legend formatter={(k: string) => SERIES[k] ?? k} wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="headcount" fill={BAMBOO_DARK} isAnimationActive={false} />
              <Bar dataKey="vacant" fill="#eda100" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>
      <ChartWidget title={tr("Mua sắm duyệt xong 6 tháng gần nhất")}>
        <div
          className="h-[240px]"
          role="img"
          aria-label={t.monthly.map((m) => trf("{0}: {1} đề nghị", [m.month, m.pr_approved])).join("; ")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={t.monthly} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(47,122,62,0.06)" }}
                content={(p) => <ChartTooltip {...(p as unknown as TipProps)} nameOf={(k) => SERIES[k] ?? k} />}
              />
              <Bar dataKey="pr_approved" fill={BAMBOO_LIGHT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWidget>
    </div>
    <ChartWidget
      title={tr("Theo khối / khoa")}
      meta={trf("{0} ngày", [days])}
      footer={
        <DefinitionButton
          text={tr(
            "Số tổng hợp theo đơn vị cấp 1 của bệnh viện. Không hiện chứng từ hay tên người: công ty mẹ chỉ nhận số tổng hợp (ADR #22).",
          )}
        />
      }
    >
      <NumTable
        rows={t.units}
        rowKey={(u) => u.unit}
        empty={tr("Bệnh viện chưa có khối / khoa.")}
        columns={[
          { title: tr("Khối / khoa"), render: (u) => u.unit },
          { title: tr("Nhân sự"), render: (u) => fmtNum(u.headcount) },
          { title: tr("Vị trí trống"), render: (u) => fmtNum(u.vacant) },
          { title: tr("Đề nghị gửi"), render: (u) => fmtNum(u.pr_submitted) },
          { title: tr("Đang chờ"), render: (u) => fmtNum(u.pr_pending) },
          { title: tr("Đã duyệt"), render: (u) => formatMoney(u.pr_approved_value) },
          {
            title: tr("Việc quá hạn"),
            render: (u) => (
              <span className={u.overdue_tasks ? "font-semibold text-red-600" : ""}>{fmtNum(u.overdue_tasks)}</span>
            ),
          },
        ]}
      />
    </ChartWidget>
  </section>
);

export const HospitalBoard = ({ days }: { days: number }) => {
  const { data, error, loading, at } = useOpsTab("hospital", days);
  return (
    <BoardState loading={loading} error={error} ready={Boolean(data)}>
      {data && !data.allowed && (
        <Alert
          type="info"
          showIcon
          message={tr("Bạn chưa được xem số liệu bệnh viện")}
          description={tr(
            "Cần quyền ops.group.read (vai trò Điều hành tập đoàn). Quản trị cấp ở trang Vai trò & phân quyền.",
          )}
        />
      )}
      {data?.allowed && data.tenants.length === 0 && (
        <Alert type="info" showIcon message={tr("Không có bệnh viện nào trong tập đoàn.")} />
      )}
      {data?.allowed && data.tenants.map((t) => <TenantBoard key={t.tenant} t={t} days={days} at={at} />)}
    </BoardState>
  );
};
