// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useInvalidate, useList } from "@refinedev/core";
import dayjs from "dayjs";
import gql from "graphql-tag";
import { useMemo } from "react";

import { request } from "../../api/client";
import { DOC_KIND_LABEL, useDocuments, type DocSummary } from "../../api/documents";
import { useSession } from "../../auth/useSession";
import { formatAgo as ago } from "../../utils/format";
import { useInboxTasks } from "../inbox/useInboxTasks";
import type { DashboardUser, NotificationItem, RecentRecord, SummaryStat, TaskItem, Tone } from "./types";
import { tr, trf } from "../../i18n";

const NOTIFICATIONS = gql`
  query HomeNotifications(
    $limit: Int
    $offset: Int
    $order_by: [collab_notification_order_by!]
    $where: collab_notification_bool_exp
  ) {
    collab_notification(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      kind
      title
      entity_type
      entity_id
      created_at
      read_at
      actor {
        full_name
      }
    }
    collab_notification_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const MY_POSITION = gql`
  query MyPosition(
    $limit: Int
    $offset: Int
    $order_by: [core_assignment_order_by!]
    $where: core_assignment_bool_exp
  ) {
    core_assignment(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      assignment_type
      position {
        name
        org_unit {
          name
        }
      }
    }
    core_assignment_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

type Note = {
  id: string;
  kind: string;
  title: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
  actor: { full_name: string } | null;
};

const DETAIL: Record<string, string> = {
  "proc.purchase_request": "/p/documents/show/",
  "hr.onboarding_request": "/h/onboarding/show/",
  "ic.ic_order": "/p/ic-orders/show/",
  "collab.kb_document": "/h/library/proposals/",
};

const NOTE_TONE: Record<string, Tone> = {
  REQUEST_APPROVED: "success",
  IC_ORDER_CONFIRMED: "success",
  REQUEST_RETURNED: "warning",
  REQUEST_REJECTED: "danger",
  IC_ORDER_REJECTED: "danger",
  TASK_ASSIGNED: "warning",
  IC_ORDER_NEW: "warning",
  SECURITY: "danger",
};

const recordTone = (d: DocSummary): { tone: Tone; locked?: boolean } => {
  switch (d.status) {
    case "PENDING":
      return { tone: "warning" };
    case "RETURNED":
      return { tone: "danger" };
    case "APPROVED":
    case "CONFIRMED":
    case "SETTLED":
      return { tone: "success" };
    case "REJECTED":
    case "CANCELLED":
      return { tone: "neutral", locked: true };
    default:
      return { tone: "neutral" };
  }
};

const dueDay = (iso: string, now = dayjs()) => {
  const diff = dayjs(iso).startOf("day").diff(now.startOf("day"), "day");
  if (diff <= 0) return diff < 0 ? tr("Đã quá hạn") : tr("Hôm nay");
  if (diff === 1) return tr("Ngày mai");
  return dayjs(iso)
    .format("dddd, DD/MM")
    .replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase());
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const useDashboard = () => {
  const { tenant } = useSession();
  const invalidate = useInvalidate();
  const inbox = useInboxTasks({ team: false });
  const docs = useDocuments({ mine: tenant.person_id, limit: 20 });
  const notes = useList<Note>({
    resource: "collab_notification",
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { pageSize: 5 },
    meta: { gqlQuery: NOTIFICATIONS },
    liveMode: "auto",
  });
  const unreadQ = useList<Note>({
    resource: "collab_notification",
    filters: [{ field: "read_at", operator: "null", value: true }],
    pagination: { pageSize: 1 },
    meta: { gqlQuery: NOTIFICATIONS },
    liveMode: "auto",
  });
  const position = useList<{
    id: string;
    assignment_type: string;
    position: { name: string; org_unit: { name: string } } | null;
  }>({
    resource: "core_assignment",
    filters: [{ field: "person_id", operator: "eq", value: tenant.person_id }],
    pagination: { pageSize: 1 },
    meta: { gqlQuery: MY_POSITION },
  });

  const user: DashboardUser = {
    name: tenant.full_name,
    title: position.result.data[0]?.position?.name ?? "",
    company: tenant.tenant_name,
  };

  const tasks: TaskItem[] = useMemo(
    () =>
      [...inbox.mine]
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .map((t) => ({
          code: t.code,
          title: t.title,
          to: `/p/tasks?doc=${encodeURIComponent(t.code)}`,
          dueLabel: capitalize(t.sla.label),
          dueLevel: t.sla.level,
          dueDay: dueDay(t.dueAt),
        })),
    [inbox.mine],
  );

  const recent: RecentRecord[] = useMemo(
    () =>
      docs.documents.slice(0, 6).map((d) => ({
        code: d.code,
        title: d.title,
        kind: DOC_KIND_LABEL[d.kind],
        statusLabel: d.statusLabel,
        ...recordTone(d),
        updatedAt: ago(d.updatedAt),
        to: d.to,
      })),
    [docs.documents],
  );

  const notifications: NotificationItem[] = notes.result.data.map((n) => ({
    id: n.id,
    title: n.title,
    time: ago(n.created_at),
    source: n.actor?.full_name,
    tone: NOTE_TONE[n.kind] ?? "neutral",
    read: n.read_at != null,
    to:
      n.entity_type === "core.tenant"
        ? "/admin/company"
        : n.entity_type?.startsWith("x_")
          ? `/x/${n.entity_type}`
          : n.entity_type && n.entity_id && DETAIL[n.entity_type]
            ? DETAIL[n.entity_type] + n.entity_id
            : undefined,
  }));
  const unread = unreadQ.result.total ?? 0;

  const overdue = tasks.filter((t) => t.dueLevel === "overdue");
  const today = tasks.filter((t) => t.dueDay === tr("Hôm nay")).length;
  const processing = docs.documents.filter((d) => d.status === "PENDING");
  const newestUnread = notifications.find((n) => !n.read);
  const summary: SummaryStat[] = [
    {
      key: "waiting",
      label: tr("Việc chờ tôi"),
      value: tasks.length,
      hint: today ? trf("{0} việc đến hạn hôm nay", [today]) : tr("Không có việc đến hạn hôm nay"),
      to: "/p/tasks",
    },
    {
      key: "processing",
      label: tr("Hồ sơ của tôi đang xử lý"),
      value: processing.length,
      hint: processing[0] ? trf("Mới nhất: {0}", [processing[0].code]) : tr("Không có hồ sơ chờ duyệt"),
      to: "/p/records",
    },
    overdue.length
      ? {
          key: "sla",
          label: tr("Quá hạn SLA"),
          value: overdue.length,
          hint: trf("Gấp nhất · {0}", [overdue[0].code]),
          tone: "danger",
          to: overdue[0].to,
        }
      : { key: "sla", label: tr("Quá hạn SLA"), value: 0, hint: tr("Không có việc quá hạn") },
    {
      key: "unread",
      label: tr("Thông báo chưa đọc"),
      value: unread,
      hint: newestUnread ? trf("Mới nhất {0}", [newestUnread.time]) : tr("Đã đọc hết"),
    },
  ];

  const markRead = async (ids?: string[]) => {
    await request(`mutation Read($ids: _uuid) { collab_mark_notifications_read(args: {ids: $ids}) { id } }`, {
      ids: ids ? `{${ids.join(",")}}` : null,
    });
    invalidate({ resource: "collab_notification", invalidates: ["list"] });
  };

  return {
    user,
    summary,
    tasks,
    recent,
    notifications,
    unread,
    markRead,
    error: inbox.error ?? docs.error ?? notes.query.error?.message,
  };
};
