// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
export type DocCategory = "regulation" | "sop" | "guide" | "faq";

/** Phạm vi đọc: cả tập đoàn (tenant) hay chỉ công ty của đơn vị ban hành. */
export type DocScope = "group" | "company";

export type ScopeFilter = "all" | DocScope;

export type CategoryFilter = "all" | DocCategory;

/** Trạng thái tài liệu trong chỉ mục tìm kiếm toàn văn (search-sync). */
export type IndexState =
  | { status: "indexed"; at: string | null }
  | { status: "indexing" }
  | { status: "missing" }
  | { status: "error"; reason: string };

export type LibraryFile = { id: string; file_name: string; content_type: string; size_bytes: number };

/** Một tài liệu đang hiệu lực trong thư viện. */
export type LibraryDoc = {
  id: string;
  code: string;
  title: string;
  category: DocCategory;
  scope: DocScope;
  /** Công ty (pháp nhân) ban hành. */
  issuer: string;
  /** Đơn vị ban hành. */
  unit: string;
  requester: string;
  version: number;
  summary: string | null;
  toc: string[];
  effectiveDate: string | null;
  publishedAt: string | null;
  myCompany: boolean;
  canManage: boolean;
  index: IndexState;
  files: LibraryFile[];
  previous: { id: string; version: number; doc_no: string }[];
};
