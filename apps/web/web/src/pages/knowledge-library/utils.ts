// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import { fold } from "../../utils/text";
import { CATEGORY_SHORT } from "./labels";
import type { CategoryFilter, LibraryDoc, ScopeFilter } from "./types";

// ===== Hàm tiện ích =====
/** "Quy chế · Công ty Chip X · v3 · hiệu lực 01/09/2026" */
export const docMeta = (d: LibraryDoc) =>
  [CATEGORY_SHORT[d.category], d.issuer, `v${d.version}`, d.effectiveDate ? `hiệu lực ${d.effectiveDate}` : null]
    .filter(Boolean)
    .join(" · ");

export const filterDocs = (
  docs: LibraryDoc[],
  { query, scope, category }: { query: string; scope: ScopeFilter; category: CategoryFilter },
  /** Tài liệu khớp tìm toàn văn ở máy chủ (nội dung tệp), ngoài phần khớp tiêu đề / mục lục. */
  fullText?: ReadonlySet<string>,
) => {
  const q = fold(query.trim());
  return docs.filter(
    (d) =>
      (scope === "all" || (scope === "group" ? d.scope === "group" : d.scope === "company" && d.myCompany)) &&
      (category === "all" || d.category === category) &&
      (!q ||
        fold(`${d.code} ${d.title} ${docMeta(d)} ${d.summary ?? ""} ${d.toc.join(" ")}`).includes(q) ||
        Boolean(fullText?.has(d.id))),
  );
};
