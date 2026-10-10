// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

/** Mức hạn SLA: quá hạn · sắp đến hạn (< 1 ngày) · còn thời gian. */
export type SlaLevel = "overdue" | "urgent" | "ok";

export type InboxScope = "mine" | "team";

export type Attachment = {
  name: string;
  kind: "pdf" | "image";
  pages: number;
  sha256: string;
  scan: "clean" | "blocked";
};

export type TaskInfo = {
  submitter: string;
  unit: string;
  device?: { label: string; to: string };
  /** Đã che bớt số ở máy chủ. */
  phone: string;
  dataTier: string;
};

export type AiSuggestion = {
  bullets: string[];
  citation?: { label: string; to: string };
};

/** Nội dung trang đầu dùng để dựng bản xem trước (minh họa). */
export type DocPreview = { org: string; heading: string; subline: string };

export type InboxTask = {
  id: string;
  code: string;
  title: string;
  level: 1 | 2;
  assignee: string;
  /** ISO 8601 — sắp xếp theo hạn SLA tăng dần. */
  dueAt: string;
  sla: { level: SlaLevel; label: string };
  attachments: Attachment[];
  info: TaskInfo;
  ai?: AiSuggestion;
  preview: DocPreview;
};

export type Decision = "approve" | "return" | "reject";
