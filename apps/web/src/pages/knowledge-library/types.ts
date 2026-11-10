/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

export type DocCategory = "regulation" | "sop" | "guide" | "faq";

export type DocScope = "group" | "company";

export type ScopeFilter = "all" | DocScope;

export type CategoryFilter = "all" | DocCategory;

export type IndexState =
  | { status: "indexed"; at: string | null }
  | { status: "indexing" }
  | { status: "missing" }
  | { status: "error"; reason: string };

export type LibraryFile = { id: string; file_name: string; content_type: string; size_bytes: number };

export type LibraryDoc = {
  id: string;
  code: string;
  title: string;
  category: DocCategory;
  scope: DocScope;
  issuer: string;
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
