// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { DocKind, DocStep } from "../../api/documents";

/** Trạng thái hiển thị, gộp từ trạng thái gốc của từng loại chứng từ. */
export type RecordStatus = "draft" | "pending" | "returned" | "approved" | "closed";

/** Tab trạng thái ở đầu trang. "Đã đóng" = từ chối hoặc hủy. */
export type StatusTab = "all" | "draft" | "reviewing" | "returned" | "approved" | "closed";

export type RecordType = DocKind;

export type TimeRange = "7d" | "30d" | "90d" | "all";

export type EofficeRecord = {
  id: string;
  code: string;
  title: string;
  type: RecordType;
  status: RecordStatus;
  /** Nhãn trạng thái ("Chờ duyệt cấp 2", "Chờ xác nhận"...). */
  statusLabel: string;
  submitter: string;
  submitterId?: string;
  unit: string;
  amount: string;
  /** ISO 8601 — lúc lập. */
  createdAt: string;
  /** ISO 8601, dùng để lọc thời gian và sắp xếp. */
  updatedAt: string;
  steps: DocStep[];
  /** Trang chi tiết. */
  to: string;
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
