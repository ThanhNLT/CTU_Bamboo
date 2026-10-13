// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu thật cho Trung tâm điều hành, trong phạm vi tenant đang chọn và quyền xem của người dùng (Hasura lọc
// can_read). "Công ty" = đơn vị cấp 1 dưới gốc tenant (Công ty Chip X, Khối Tài chính...); 4 đơn vị nhiều hồ sơ nhất
// có màu riêng, còn lại gộp "Khác". Việc đang chờ tự cập nhật qua subscription; lịch sử duyệt tải theo kỳ.
import { useList } from "@refinedev/core";
import dayjs from "dayjs";
import gql from "graphql-tag";
import { useMemo } from "react";
import { SLA_HOURS } from "../inbox/useInboxTasks";
import type { Company, CompanyKey, DailyPoint, Kpi, MonthlyPoint, OverdueRow, PendingRow, Period } from "./types";

/** 4 ô đầu của bảng màu phân loại đã kiểm định (thứ tự cố định) + xám cho "Khác". */
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const OTHER_COLOR = "#8a948e";
export const OTHER_COMPANY = "__other__";

export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, quarter: 90 };
const HOUR = 3_600_000;

const UNITS = gql`
  query OpsUnits($limit: Int, $offset: Int, $order_by: [core_org_unit_order_by!], $where: core_org_unit_bool_exp) {
    core_org_unit(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      name
      path
    }
    core_org_unit_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const DOC = `purchase_request { id doc_no title org_unit_id } onboarding_request { id doc_no full_name org_unit_id }`;

const OPEN_TASKS = gql`
  query OpsOpen($limit: Int, $offset: Int, $order_by: [wf_task_order_by!], $where: wf_task_bool_exp) {
    wf_task(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id created_at step { step_order ${DOC} }
    }
    wf_task_aggregate(where: $where) { aggregate { count } }
  }
`;

const DONE_TASKS = gql`
  query OpsDone($limit: Int, $offset: Int, $order_by: [wf_task_order_by!], $where: wf_task_bool_exp) {
    wf_task(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      created_at
      closed_at
    }
    wf_task_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const COMPLETED = gql`
  query OpsCompleted(
    $limit: Int
    $offset: Int
    $order_by: [wf_approval_history_order_by!]
    $where: wf_approval_history_bool_exp
  ) {
    wf_approval_history(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      created_at
      purchase_request {
        org_unit_id
      }
      onboarding_request {
        org_unit_id
      }
    }
    wf_approval_history_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const COUNT_IC = gql`
  query OpsIc($limit: Int, $offset: Int, $order_by: [ic_ic_order_order_by!], $where: ic_ic_order_bool_exp) {
    ic_ic_order(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
    }
    ic_ic_order_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const COUNT_FILES = gql`
  query OpsFiles($limit: Int, $offset: Int, $order_by: [core_attachment_order_by!], $where: core_attachment_bool_exp) {
    core_attachment(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
    }
    core_attachment_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

type Unit = { id: string; name: string; path: string };
type DocRef = {
  purchase_request: { id: string; doc_no: string; title: string; org_unit_id: string } | null;
  onboarding_request: { id: string; doc_no: string; full_name: string; org_unit_id: string } | null;
};
type OpenTask = { id: string; created_at: string; step: DocRef & { step_order: number } };
type DoneTask = { id: string; created_at: string; closed_at: string | null };
type Completed = {
  id: string;
  created_at: string;
  purchase_request: { org_unit_id: string } | null;
  onboarding_request: { org_unit_id: string } | null;
};

const unitOf = (d: {
  purchase_request: { org_unit_id: string } | null;
  onboarding_request: { org_unit_id: string } | null;
}) => d.purchase_request?.org_unit_id ?? d.onboarding_request?.org_unit_id;

/** "1 ngày 3 giờ" / "5 giờ" / "20 phút". */
const span = (ms: number) => {
  const d = Math.floor(ms / (24 * HOUR));
  const h = Math.floor((ms % (24 * HOUR)) / HOUR);
  if (d) return `${d} ngày${h ? ` ${h} giờ` : ""}`;
  return h ? `${h} giờ` : `${Math.max(1, Math.floor(ms / 60_000))} phút`;
};

const pct = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const useOpsData = (period: Period) => {
  const days = PERIOD_DAYS[period];
  // Mốc thời gian chốt theo ngày để khóa truy vấn không đổi mỗi lần render.
  const today = dayjs().startOf("day");
  const since = today.subtract(days - 1, "day");
  const yearStart = today.startOf("year").subtract(1, "year");
  const weekAgo = today.subtract(6, "day");

  const units = useList<Unit>({ resource: "core_org_unit", pagination: { pageSize: 1000 }, meta: { gqlQuery: UNITS } });
  const open = useList<OpenTask>({
    resource: "wf_task",
    filters: [{ field: "status", operator: "eq", value: "OPEN" }],
    sorters: [{ field: "created_at", order: "asc" }],
    pagination: { pageSize: 1000 },
    meta: { gqlQuery: OPEN_TASKS },
    liveMode: "auto",
  });
  const done = useList<DoneTask>({
    resource: "wf_task",
    filters: [
      { field: "status", operator: "eq", value: "DONE" },
      { field: "closed_at", operator: "gte", value: since.toISOString() },
    ],
    pagination: { pageSize: 5000 },
    meta: { gqlQuery: DONE_TASKS },
  });
  const completed = useList<Completed>({
    resource: "wf_approval_history",
    filters: [
      { field: "event", operator: "eq", value: "COMPLETED" },
      { field: "created_at", operator: "gte", value: yearStart.toISOString() },
    ],
    sorters: [{ field: "created_at", order: "asc" }],
    pagination: { pageSize: 10000 },
    meta: { gqlQuery: COMPLETED },
  });
  const icPending = useList({
    resource: "ic_ic_order",
    filters: [{ field: "status", operator: "eq", value: "PENDING" }],
    pagination: { pageSize: 1 },
    meta: { gqlQuery: COUNT_IC },
    liveMode: "auto",
  });
  const blockedFiles = useList({
    resource: "core_attachment",
    filters: [
      { field: "status", operator: "in", value: ["INFECTED", "REJECTED"] },
      { field: "created_at", operator: "gte", value: weekAgo.toISOString() },
    ],
    pagination: { pageSize: 1 },
    meta: { gqlQuery: COUNT_FILES },
  });

  const unitRows = units.result.data;
  const openRows = open.result.data;
  const doneRows = done.result.data;
  const completedRows = completed.result.data;

  const data = useMemo(() => {
    const now = Date.now();
    const at = dayjs().format("HH:mm");

    // Đơn vị cấp 1 của một đơn vị bất kỳ: hai nhãn đầu của ltree path.
    const byPath = new Map(unitRows.map((u) => [u.path, u]));
    const byId = new Map(unitRows.map((u) => [u.id, u]));
    const top = (unitId?: string) => {
      const u = unitId ? byId.get(unitId) : undefined;
      if (!u) return undefined;
      return byPath.get(u.path.split(".").slice(0, 2).join(".")) ?? u;
    };

    // Xếp hạng theo khối lượng (đang chờ + đã duyệt xong); 4 đơn vị đầu có màu riêng.
    const volume = new Map<string, number>();
    for (const id of [...openRows.map((t) => unitOf(t.step)), ...completedRows.map(unitOf)]) {
      const t = top(id);
      if (t) volume.set(t.id, (volume.get(t.id) ?? 0) + 1);
    }
    const ranked = [...volume.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id)!);
    const named = ranked.slice(0, PALETTE.length);
    const companies: Company[] = named.map((u, i) => ({
      key: u.id,
      name: u.name,
      short: u.name.replace(/^(Công ty|Khối|Phòng|Văn phòng)\s+/i, ""),
      color: PALETTE[i],
    }));
    if (ranked.length > named.length) {
      companies.push({ key: OTHER_COMPANY, name: "Đơn vị khác", short: "Khác", color: OTHER_COLOR });
    }
    const keyOf = (unitId?: string): CompanyKey => {
      const t = top(unitId);
      return t && named.some((u) => u.id === t.id) ? t.id : OTHER_COMPANY;
    };
    const company = Object.fromEntries(companies.map((c) => [c.key, c])) as Record<CompanyKey, Company>;

    // Duyệt xong mỗi ngày trong kỳ.
    const daily: DailyPoint[] = Array.from({ length: days }, (_, i) => {
      const point: DailyPoint = { day: since.add(i, "day").format("DD/MM") };
      for (const c of companies) point[c.key] = 0;
      return point;
    });
    for (const h of completedRows) {
      const i = dayjs(h.created_at).startOf("day").diff(since, "day");
      if (i >= 0 && i < days) {
        const k = keyOf(unitOf(h));
        daily[i][k] = Number(daily[i][k] ?? 0) + 1;
      }
    }

    // Đang chờ theo công ty, tách cấp 1 / cấp 2 trở lên.
    const pendingMap = new Map<CompanyKey, PendingRow>();
    for (const t of openRows) {
      const k = keyOf(unitOf(t.step));
      const row = pendingMap.get(k) ?? { company: k, l1: 0, l2: 0 };
      if (t.step.step_order <= 1) row.l1 += 1;
      else row.l2 += 1;
      pendingMap.set(k, row);
    }
    const pending = companies.map((c) => pendingMap.get(c.key)).filter((r): r is PendingRow => Boolean(r));

    // Theo tháng: năm nay (cột, các tháng chưa tới để trống) so với năm trước (đường).
    const year = today.year();
    const monthly: MonthlyPoint[] = Array.from({ length: 12 }, (_, m) => ({
      month: `T${m + 1}`,
      current: m <= today.month() ? 0 : null,
      previous: 0,
    }));
    for (const h of completedRows) {
      const d = dayjs(h.created_at);
      const row = monthly[d.month()];
      if (d.year() === year && row.current != null) row.current += 1;
      else if (d.year() === year - 1) row.previous += 1;
    }

    // Quá hạn: việc đang mở lâu hơn SLA_HOURS, lâu nhất trước.
    const overdueAll: OverdueRow[] = openRows
      .map((t) => ({ t, late: now - (Date.parse(t.created_at) + SLA_HOURS * HOUR) }))
      .filter((x) => x.late > 0)
      .sort((a, b) => b.late - a.late)
      .map(({ t, late }) => {
        const pr = t.step.purchase_request;
        const ob = t.step.onboarding_request;
        return {
          code: pr?.doc_no ?? ob?.doc_no ?? t.id,
          to: pr ? `/p/documents/show/${pr.id}` : ob ? `/h/onboarding/show/${ob.id}` : "/p/tasks",
          company: keyOf(unitOf(t.step)),
          type: pr ? `Mua sắm: ${pr.title}` : ob ? `Tiếp nhận ${ob.full_name}` : "—",
          step: `Cấp ${t.step.step_order}`,
          overdueMinutes: Math.round(late / 60_000),
          overdueLabel: span(late),
        };
      });

    // KPI.
    const onTime = doneRows.filter(
      (t) => t.closed_at && Date.parse(t.closed_at) - Date.parse(t.created_at) <= SLA_HOURS * HOUR,
    ).length;
    const inPeriod = completedRows.filter((h) => !dayjs(h.created_at).isBefore(since)).length;
    const prevSince = since.subtract(days, "day");
    const prevPeriod = completedRows.filter((h) => {
      const d = dayjs(h.created_at);
      return !d.isBefore(prevSince) && d.isBefore(since);
    }).length;
    const change = prevPeriod ? Math.round(((inPeriod - prevPeriod) / prevPeriod) * 100) : null;
    const hot = { tier: "Nóng" as const, at };
    const kpis: Kpi[] = [
      {
        key: "pending",
        label: "Hồ sơ chờ duyệt",
        value: String(openRows.length),
        delta: overdueAll.length
          ? { dir: "dot", tone: "bad", text: `${overdueAll.length} quá hạn SLA` }
          : { dir: "dot", tone: "good", text: "Không có việc quá hạn" },
        freshness: hot,
        definition: "Số bước duyệt đang mở (wf.task OPEN) bạn được xem, tại thời điểm cập nhật.",
      },
      {
        key: "ontime",
        label: "Duyệt đúng hạn",
        value: doneRows.length ? `${pct.format((onTime / doneRows.length) * 100)}%` : "—",
        delta: { dir: "none", tone: "neutral", text: `${doneRows.length} bước duyệt trong kỳ` },
        freshness: hot,
        definition: `Tỷ lệ bước duyệt hoàn tất trong vòng ${SLA_HOURS} giờ kể từ lúc giao, trong kỳ đang chọn.`,
      },
      {
        key: "completed",
        label: "Duyệt xong trong kỳ",
        value: String(inPeriod),
        delta:
          change == null
            ? { dir: "none", tone: "neutral", text: "Kỳ trước không có" }
            : {
                dir: change >= 0 ? "up" : "down",
                tone: change >= 0 ? "good" : "bad",
                text: `${Math.abs(change)}% so với kỳ trước`,
              },
        freshness: hot,
        definition: "Số hồ sơ hoàn tất toàn bộ chuỗi duyệt (sự kiện COMPLETED) trong kỳ đang chọn.",
      },
      {
        key: "ic",
        label: "Đơn nội bộ chờ xác nhận",
        value: String(icPending.result.total ?? 0),
        delta: { dir: "none", tone: "neutral", text: "Bên bán chưa xác nhận" },
        freshness: hot,
        definition: "Đơn hàng nội bộ (ic.ic_order) ở trạng thái chờ bên bán xác nhận.",
      },
      {
        key: "blocked",
        label: "Tệp bị chặn · 7 ngày",
        value: String(blockedFiles.result.total ?? 0),
        delta: { dir: "none", tone: "neutral", text: "Kiểm dịch ClamAV" },
        freshness: hot,
        definition: "Tệp tải lên bị loại (sai định dạng) hoặc nhiễm mã độc trong 7 ngày gần nhất.",
      },
    ];

    return {
      companies,
      company,
      daily,
      pending,
      monthly,
      overdue: overdueAll.slice(0, 5),
      kpis,
      updatedAt: at,
      rangeLabel: `${since.format("DD/MM")} – ${today.format("DD/MM")}`,
    };
    // since/today/yearStart suy ra từ `days` và ngày hiện tại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitRows, openRows, doneRows, completedRows, icPending.result.total, blockedFiles.result.total, days]);

  const queries = [units, open, done, completed, icPending, blockedFiles].map((q) => q.query);
  return {
    ...data,
    loading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error?.message,
  };
};

export type OpsData = ReturnType<typeof useOpsData>;
