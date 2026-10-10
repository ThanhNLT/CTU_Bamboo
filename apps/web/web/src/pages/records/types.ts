// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type RecordStatus = "draft" | "pending_l1" | "pending_l2" | "returned" | "approved" | "archived";

/** Tab trạng thái ở đầu trang ("Đang duyệt" gộp chờ duyệt cấp 1 và cấp 2). */
export type StatusTab = "all" | "draft" | "reviewing" | "returned" | "approved" | "archived";

export type RecordType = "incident" | "release" | "calibration" | "purchase" | "operation";

export type TimeRange = "7d" | "30d" | "90d" | "all";

export type Sla =
  | { kind: "remaining"; label: string }
  | { kind: "overdue"; label: string }
  | { kind: "ontime" }
  | { kind: "none" };

export type RecordVersion = { version: number; note: string; at: string };

export type EofficeRecord = {
  id: string;
  code: string;
  title: string;
  type: RecordType;
  status: RecordStatus;
  submitter: string;
  /** Thời điểm nộp hiển thị trong quy trình ("06/10 07:12"). */
  submittedLabel?: string;
  approverL1: string;
  approverL2: string;
  sla: Sla;
  /** ISO 8601, dùng để lọc thời gian. */
  updatedAt: string;
  updatedLabel: string;
  /** Lần hoạt động gần nhất (ISO), nếu khác updatedAt — ví dụ thời điểm đưa vào lưu trữ. Bộ lọc "Thời gian" dùng trường này. */
  activityAt?: string;
  versions: RecordVersion[];
  /** Mã băm niêm phong sổ cái (không có với bản nháp). */
  ledgerHash?: string;
};

export type StepState = "done" | "current" | "returned" | "pending";

export type WorkflowStep = { key: string; label: string; state: StepState; meta?: string };

export type RecordFilters = {
  tab: StatusTab;
  query: string;
  type: RecordType | "all";
  range: TimeRange;
  mineOnly: boolean;
};
