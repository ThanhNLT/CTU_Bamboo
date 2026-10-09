// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type DocCategory = "regulation" | "sop" | "guide" | "faq";

/** Phạm vi ban hành: cấp tập đoàn hay công ty con. */
export type DocScope = "group" | "company";

export type ScopeFilter = "all" | DocScope;

export type CategoryFilter = "all" | DocCategory;

/** Trạng thái nạp tài liệu vào kho tri thức của Trợ lý đa năng. */
export type IndexState =
  | { status: "indexed"; chunks: number; at: string }
  | { status: "indexing"; progress: number }
  | { status: "failed"; reason: string };

export type LibraryDoc = {
  id: string;
  title: string;
  category: DocCategory;
  scope: DocScope;
  /** Đơn vị ban hành hiển thị ("Công ty Chip & Linh kiện", "Tập đoàn"). */
  issuer: string;
  version?: number;
  /** Ghi chú cuối dòng meta ("hiệu lực 01/09/2026", "cập nhật 10 phút trước"...). */
  note?: string;
  index: IndexState;
  owner: string;
  /** Mô tả phiên bản ("v3 (2 bản trước)"). */
  versionLabel: string;
  effectiveDate: string;
  pages: number;
  format: string;
  toc: string[];
  excerpt?: { heading: string; body: string };
};
