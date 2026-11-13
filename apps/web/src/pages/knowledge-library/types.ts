/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
