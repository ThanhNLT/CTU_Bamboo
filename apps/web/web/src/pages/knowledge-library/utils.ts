// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { CATEGORY_SHORT } from "./mock";
import type { CategoryFilter, LibraryDoc, ScopeFilter } from "./types";

/** Bỏ dấu tiếng Việt để tìm "phong sach" vẫn ra "phòng sạch". */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** "Quy chế · Công ty Chip & Linh kiện · v3 · hiệu lực 01/09/2026" */
export const docMeta = (d: LibraryDoc) =>
  [CATEGORY_SHORT[d.category], d.issuer, d.version != null ? `v${d.version}` : null, d.note]
    .filter(Boolean)
    .join(" · ");

export const filterDocs = (
  docs: LibraryDoc[],
  { query, scope, category }: { query: string; scope: ScopeFilter; category: CategoryFilter },
) => {
  const q = fold(query.trim());
  return docs.filter(
    (d) =>
      (scope === "all" || d.scope === scope) &&
      (category === "all" || d.category === category) &&
      (!q || fold(`${d.title} ${docMeta(d)} ${d.toc.join(" ")}`).includes(q)),
  );
};
