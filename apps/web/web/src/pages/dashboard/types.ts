// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import type { Tone } from "../../components/ui";

// ===== Xuất lại =====
export type { Tone };

// ===== Kiểu dữ liệu =====
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
  /** Trang mở khi bấm (Hộp việc chọn sẵn việc này). */
  to: string;
  title: string;
  dueLabel: string;
  dueLevel: DueLevel;
  /** Nhóm ngày cho chế độ xem Lịch. */
  dueDay: string;
};

export type RecentRecord = {
  code: string;
  title: string;
  /** Loại chứng từ ("Đề nghị mua sắm", ...). */
  kind: string;
  statusLabel: string;
  tone: Tone;
  /** Đã kết thúc (từ chối / hủy): hiện ổ khóa thay cho chấm màu. */
  locked?: boolean;
  updatedAt: string;
  to: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  /** Trang chứng từ liên quan (nếu có). */
  to?: string;
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
