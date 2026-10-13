// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu thật cho Hộp việc (ADR #20), tự cập nhật qua subscription:
// - "Của tôi": wf.v_inbox — việc của mình và việc nhận qua ủy quyền (được quyết định).
// - "Cả nhóm": wf.task đang mở mà mình được xem (can_read) — việc của người khác chỉ để xem.
import { useList } from "@refinedev/core";
import gql from "graphql-tag";
import { useMemo } from "react";
import { useSession } from "../../auth/useSession";
import { formatDate, formatMoney } from "../../utils/format";
import type { Attachment, InboxTask, SlaLevel } from "./types";

// Backend chưa có hạn SLA theo bước duyệt: tạm tính hạn = lúc giao việc + SLA_HOURS.
export const SLA_HOURS = 48;
const URGENT_HOURS = 8;

const DOC_FIELDS = `
  purchase_request {
    id doc_no title total_amount created_at
    requester { full_name } org_unit { name }
    attachments(order_by: { created_at: asc }) { id file_name content_type sha256 status }
  }
  onboarding_request {
    id doc_no full_name salary created_at
    requester { full_name } target_position { name org_unit { name } }
    attachments(order_by: { created_at: asc }) { id file_name content_type sha256 status }
  }
`;

const MINE = gql`
  query InboxMine($limit: Int, $offset: Int, $order_by: [wf_v_inbox_order_by!], $where: wf_v_inbox_bool_exp) {
    wf_v_inbox(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      task_id via_delegation created_at step_order
      task { assignee { full_name } }
      ${DOC_FIELDS}
    }
    wf_v_inbox_aggregate(where: $where) { aggregate { count } }
  }
`;

const TEAM = gql`
  query InboxTeam($limit: Int, $offset: Int, $order_by: [wf_task_order_by!], $where: wf_task_bool_exp) {
    wf_task(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id created_at
      assignee { full_name } assigned_position { name }
      step { step_order ${DOC_FIELDS} }
    }
    wf_task_aggregate(where: $where) { aggregate { count } }
  }
`;

type AttachmentRow = { id: string; file_name: string; content_type: string; sha256: string | null; status: string };
type Docs = {
  purchase_request: {
    id: string;
    doc_no: string;
    title: string;
    total_amount: number;
    created_at: string;
    requester: { full_name: string } | null;
    org_unit: { name: string } | null;
    attachments: AttachmentRow[];
  } | null;
  onboarding_request: {
    id: string;
    doc_no: string;
    full_name: string;
    salary: number | null;
    created_at: string;
    requester: { full_name: string } | null;
    target_position: { name: string; org_unit: { name: string } } | null;
    attachments: AttachmentRow[];
  } | null;
};
type MineRow = Docs & {
  task_id: string;
  via_delegation: boolean;
  created_at: string;
  step_order: number;
  task: { assignee: { full_name: string } | null } | null;
};
type TeamRow = {
  id: string;
  created_at: string;
  assignee: { full_name: string } | null;
  assigned_position: { name: string } | null;
  step: Docs & { step_order: number };
};

const toAttachment = (a: AttachmentRow): Attachment => ({
  id: a.id,
  name: a.file_name,
  kind: a.content_type === "application/pdf" ? "pdf" : a.content_type.startsWith("image/") ? "image" : "file",
  pages: 1,
  sha256: a.sha256,
  scan: a.status === "CLEAN" ? "clean" : a.status === "PENDING" ? "pending" : "blocked",
});

const HOUR = 3_600_000;

/** "quá hạn 3 giờ" / "còn 1 ngày 2 giờ" từ số mili-giây còn lại. */
const slaOf = (dueAt: number, now: number): { level: SlaLevel; label: string } => {
  const left = dueAt - now;
  const abs = Math.abs(left);
  const days = Math.floor(abs / (24 * HOUR));
  const hours = Math.floor((abs % (24 * HOUR)) / HOUR);
  const minutes = Math.floor((abs % HOUR) / 60_000);
  const span =
    days > 0
      ? `${days} ngày${hours ? ` ${hours} giờ` : ""}`
      : hours > 0
        ? `${hours} giờ${minutes ? ` ${minutes} phút` : ""}`
        : `${Math.max(minutes, 1)} phút`;
  if (left < 0) return { level: "overdue", label: `quá hạn ${span}` };
  return { level: left < URGENT_HOURS * HOUR ? "urgent" : "ok", label: `còn ${span}` };
};

type Base = {
  id: string;
  taskId: string;
  createdAt: string;
  level: number;
  assignee: string;
  actionable: boolean;
  viaDelegation: boolean;
};

const toTask = (b: Base, d: Docs, org: string, now: number): InboxTask | null => {
  const due = new Date(b.createdAt).getTime() + SLA_HOURS * HOUR;
  const common = {
    ...b,
    dueAt: new Date(due).toISOString(),
    sla: slaOf(due, now),
  };
  if (d.purchase_request) {
    const p = d.purchase_request;
    const unit = p.org_unit?.name ?? "";
    return {
      ...common,
      code: p.doc_no,
      title: p.title,
      to: `/p/documents/show/${p.id}`,
      attachments: p.attachments.map(toAttachment),
      info: { submitter: p.requester?.full_name ?? "—", unit: unit || "—", amount: formatMoney(p.total_amount) },
      preview: {
        org: [org, unit].filter(Boolean).join(" · "),
        heading: `ĐỀ NGHỊ MUA SẮM · ${p.title.toLocaleUpperCase("vi")}`,
        subline: `Số tiền: ${formatMoney(p.total_amount)} · ${formatDate(p.created_at)}`,
      },
    };
  }
  if (d.onboarding_request) {
    const o = d.onboarding_request;
    const unit = o.target_position?.org_unit.name ?? "";
    return {
      ...common,
      code: o.doc_no,
      title: `Tiếp nhận ${o.full_name}`,
      to: `/h/onboarding/show/${o.id}`,
      attachments: o.attachments.map(toAttachment),
      info: {
        submitter: o.requester?.full_name ?? "—",
        unit: unit || "—",
        amount: o.salary == null ? undefined : `${formatMoney(o.salary)}/tháng`,
      },
      preview: {
        org: [org, unit].filter(Boolean).join(" · "),
        heading: `ĐỀ NGHỊ TIẾP NHẬN NHÂN SỰ · ${o.full_name.toLocaleUpperCase("vi")}`,
        subline: `Vị trí: ${o.target_position?.name ?? "—"} · ${formatDate(o.created_at)}`,
      },
    };
  }
  return null; // Loại chứng từ chưa hỗ trợ trên trang này.
};

const PAGE = { pageSize: 200 };

/** `team: false` bỏ truy vấn "Cả nhóm" (Trang chủ chỉ cần việc của mình). */
export const useInboxTasks = ({ team: withTeam = true }: { team?: boolean } = {}) => {
  const { tenant } = useSession();
  const mineQ = useList<MineRow>({
    resource: "wf_v_inbox",
    sorters: [{ field: "created_at", order: "asc" }],
    pagination: PAGE,
    meta: { gqlQuery: MINE },
    liveMode: "auto",
  });
  const teamQ = useList<TeamRow>({
    resource: "wf_task",
    filters: [{ field: "status", operator: "eq", value: "OPEN" }],
    sorters: [{ field: "created_at", order: "asc" }],
    pagination: PAGE,
    meta: { gqlQuery: TEAM },
    liveMode: "auto",
    queryOptions: { enabled: withTeam },
  });

  const mineRows = mineQ.result.data;
  const teamRows = teamQ.result.data;
  const me = tenant.full_name;

  const { mine, team } = useMemo(() => {
    const now = Date.now();
    const org = tenant.tenant_name;
    const mine = mineRows
      .map((r) =>
        toTask(
          {
            id: `${r.task_id}${r.via_delegation ? ":uq" : ""}`,
            taskId: r.task_id,
            createdAt: r.created_at,
            level: r.step_order,
            assignee: r.via_delegation ? (r.task?.assignee?.full_name ?? "—") : me,
            actionable: true,
            viaDelegation: r.via_delegation,
          },
          r,
          org,
          now,
        ),
      )
      .filter((t): t is InboxTask => t !== null);
    const mineIds = new Set(mine.map((t) => t.taskId));
    const others = teamRows
      .filter((r) => !mineIds.has(r.id))
      .map((r) =>
        toTask(
          {
            id: r.id,
            taskId: r.id,
            createdAt: r.created_at,
            level: r.step.step_order,
            assignee: r.assignee?.full_name ?? r.assigned_position?.name ?? "—",
            actionable: false,
            viaDelegation: false,
          },
          r.step,
          org,
          now,
        ),
      )
      .filter((t): t is InboxTask => t !== null);
    return { mine, team: [...mine, ...others] };
  }, [mineRows, teamRows, me, tenant.tenant_name]);

  return {
    mine,
    team,
    loading: mineQ.query.isLoading || (withTeam && teamQ.query.isLoading),
    error: (mineQ.query.error ?? teamQ.query.error)?.message,
  };
};
