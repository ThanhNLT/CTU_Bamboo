// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

/** Mức hạn SLA: quá hạn · sắp đến hạn (< 1 ngày) · còn thời gian. */
export type SlaLevel = "overdue" | "urgent" | "ok";

export type InboxScope = "mine" | "team";

export type Attachment = {
  /** core.attachment.id — dùng để xin đường dẫn tải (get_download_url). */
  id: string;
  name: string;
  kind: "pdf" | "image" | "file";
  /** Số trang chưa biết (máy chủ chưa dựng ảnh trang) thì là 1. */
  pages: number;
  sha256: string | null;
  /** clean = ClamAV sạch · blocked = nhiễm/bị từ chối · pending = đang kiểm dịch. */
  scan: "clean" | "blocked" | "pending";
};

export type TaskInfo = {
  submitter: string;
  unit: string;
  device?: { label: string; to: string };
  /** Đã che bớt số ở máy chủ. */
  phone?: string;
  dataTier?: string;
  /** Số tiền / lương hiển thị sẵn. */
  amount?: string;
};

export type AiSuggestion = {
  bullets: string[];
  citation?: { label: string; to: string };
};

/** Nội dung trang đầu dùng để dựng bản xem trước (minh họa). */
export type DocPreview = { org: string; heading: string; subline: string };

export type InboxTask = {
  /** wf.task.id (việc nhận qua ủy quyền thêm hậu tố để không trùng khóa). */
  id: string;
  taskId: string;
  code: string;
  title: string;
  level: number;
  assignee: string;
  /** Người dùng được quyết định việc này (của mình hoặc duyệt thay theo ủy quyền). */
  actionable: boolean;
  viaDelegation: boolean;
  /** Trang chi tiết chứng từ. */
  to: string;
  /** ISO 8601 — sắp xếp theo hạn SLA tăng dần. */
  dueAt: string;
  sla: { level: SlaLevel; label: string };
  attachments: Attachment[];
  info: TaskInfo;
  ai?: AiSuggestion;
  preview: DocPreview;
};

export type Decision = "approve" | "return" | "reject";
