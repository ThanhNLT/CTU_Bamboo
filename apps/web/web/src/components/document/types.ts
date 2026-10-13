// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Phần chung của mọi loại chứng từ (đề nghị mua sắm, đề nghị tiếp nhận nhân sự): tệp đính kèm, trao đổi,
// chuỗi duyệt và lịch sử đều là bảng đa hình (entity_type, entity_id).
type Person = { full_name: string } | null;

export type Attachment = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  scan_result: string | null;
  created_at: string;
  uploaded_by: string;
  uploaded_by_person: Person;
};

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  parent_id: string | null;
  author_id: string;
  author: Person;
};

export type ApprovalStep = {
  id: string;
  round: number;
  step_order: number;
  status: string;
  acted_at: string | null;
  note: string | null;
  position: { name: string; org_unit: { name: string } } | null;
  acted_by_person: Person;
  on_behalf_of_person: Person;
  tasks: { id: string; assignee_id: string | null; escalated: boolean; escalation_reason: string | null }[];
};

export type ApprovalHistory = {
  id: number;
  event: string;
  detail: Record<string, unknown>;
  created_at: string;
  person: Person;
  on_behalf_of_person: Person;
};

export type DocumentFiles = { id: string; status: string; attachments: Attachment[] };
export type DocumentComments = { id: string; comments: Comment[] };
