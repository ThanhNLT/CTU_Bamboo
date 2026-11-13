/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { fold } from "../../utils/text";
import type { Dataset, DomainFilter } from "./types";

const num = new Intl.NumberFormat("en-US");

export const formatInt = (n: number) => num.format(n);

export const filterDatasets = (list: Dataset[], query: string, domain: DomainFilter) => {
  const q = fold(query.trim());
  return list.filter(
    (d) =>
      (domain === "all" || d.domain === domain) &&
      (!q || fold(`${d.title} ${d.table} ${d.description} ${d.columns.map((c) => c.name).join(" ")}`).includes(q)),
  );
};

export const domainCounts = (list: Dataset[]) => {
  const counts = new Map<string, number>();
  for (const d of list) counts.set(d.domain, (counts.get(d.domain) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
    .map(([key, count]) => ({ key, count }));
};

export const cellText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export { copyText } from "../../utils/clipboard";
