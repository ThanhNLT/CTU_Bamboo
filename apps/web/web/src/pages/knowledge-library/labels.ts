// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { DocCategory, ScopeFilter } from "./types";

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  regulation: "Quy chế",
  sop: "Quy trình chuẩn (SOP)",
  guide: "Hướng dẫn",
  faq: "Hỏi đáp",
};

export const CATEGORY_SHORT: Record<DocCategory, string> = {
  regulation: "Quy chế",
  sop: "Quy trình chuẩn",
  guide: "Hướng dẫn",
  faq: "Hỏi đáp",
};

export const SCOPE_OPTIONS: Array<{ label: string; value: ScopeFilter }> = [
  { label: "Tất cả", value: "all" },
  { label: "Tập đoàn", value: "group" },
  { label: "Công ty của tôi", value: "company" },
];

export const SCOPE_LABEL = { group: "Cả tập đoàn", company: "Trong công ty ban hành" } as const;

export const PROPOSAL_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Nháp", color: "default" },
  PENDING: { label: "Chờ duyệt", color: "processing" },
  RETURNED: { label: "Bị trả về", color: "warning" },
  APPROVED: { label: "Đã xuất bản", color: "success" },
  REJECTED: { label: "Từ chối", color: "error" },
  CANCELLED: { label: "Đã hủy", color: "default" },
  RETIRED: { label: "Ngừng hiệu lực", color: "default" },
};
