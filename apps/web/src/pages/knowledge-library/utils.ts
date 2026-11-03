// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { fold } from "../../utils/text";
import { CATEGORY_SHORT } from "./labels";
import type { CategoryFilter, LibraryDoc, ScopeFilter } from "./types";
import { trf } from "../../i18n";

export const docMeta = (d: LibraryDoc) =>
  [
    CATEGORY_SHORT[d.category],
    d.issuer,
    `v${d.version}`,
    d.effectiveDate ? trf("hiệu lực {0}", [d.effectiveDate]) : null,
  ]
    .filter(Boolean)
    .join(" · ");

export const filterDocs = (
  docs: LibraryDoc[],
  { query, scope, category }: { query: string; scope: ScopeFilter; category: CategoryFilter },
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
