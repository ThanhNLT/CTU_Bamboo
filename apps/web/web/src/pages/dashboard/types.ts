// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Tone } from "../../components/ui";

export type { Tone };

export type DashboardUser = { name: string; title: string; company: string };

export type SummaryStat = {
  key: string;
  label: string;
  value: number;
  hint: string;
  /** Tô đỏ số liệu và gắn chấm cảnh báo (ví dụ Quá hạn SLA). */
  tone?: Tone;
  to?: string;
};

/** Mức hạn của việc: quá hạn · sắp đến hạn · còn trong hạn. */
export type DueLevel = "overdue" | "urgent" | "ok";

export type TaskItem = {
  code: string;
  title: string;
  dueLabel: string;
  dueLevel: DueLevel;
  /** Nhóm ngày cho chế độ xem Lịch. */
  dueDay: string;
};

export type RecordStatus = "pending_l1" | "returned" | "draft" | "approved" | "archived";

/** Tầng lưu trữ dữ liệu của hồ sơ. */
export type DataTier = "hot" | "warm" | "cold";

export type RecentRecord = {
  code: string;
  title: string;
  status: RecordStatus;
  updatedAt: string;
  tier: DataTier;
};

export type NotificationItem = {
  id: string;
  title: string;
  time: string;
  source?: string;
  tone: Tone;
  read: boolean;
};

export type PinnedKpi = {
  key: string;
  label: string;
  value: string;
  note: string;
  noteTone: Tone;
  /** Ký hiệu đầu dòng ghi chú: mũi tên xu hướng hoặc chấm. */
  noteMarker: "down" | "up" | "dot";
  series: number[];
  /** Ngưỡng vẽ nét đứt trên sparkline. */
  threshold?: number;
};
