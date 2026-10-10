// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { fold } from "../../utils/text";
import type { ColumnDef, Dataset, DomainFilter } from "./types";

const num = new Intl.NumberFormat("vi-VN");
export const formatInt = (n: number) => num.format(n);

export const filterDatasets = (list: Dataset[], query: string, domain: DomainFilter) => {
  const q = fold(query.trim());
  return list.filter(
    (d) =>
      (domain === "all" || d.domain === domain) &&
      (!q || fold(`${d.title} ${d.table} ${d.description} ${d.columns.map((c) => c.name).join(" ")}`).includes(q)),
  );
};

/** Dòng mẫu: dùng mẫu có sẵn, nếu không thì sinh giá trị minh họa theo kiểu cột (cố định, không ngẫu nhiên). */
export const sampleRows = (d: Dataset, count = 5) => {
  if (d.sample?.length) return d.sample;
  const value = (c: ColumnDef, i: number, j: number): string | number => {
    if (c.pii) return "••••••";
    if (c.type === "date") return `2026-10-0${6 - i}`;
    if (c.type === "timestamptz") return `2026-10-06 ${String(8 + i).padStart(2, "0")}:00`;
    if (c.type === "int") return 10 + ((i * 7 + j * 3) % 13);
    if (c.type === "numeric") return (0.72 + ((i * 3 + j * 5) % 25) / 100).toFixed(3);
    return `${c.name.toUpperCase().slice(0, 3)}-${String(i + 1).padStart(2, "0")}`;
  };
  return Array.from({ length: count }, (_, i) => Object.fromEntries(d.columns.map((c, j) => [c.name, value(c, i, j)])));
};

/** Ghi vào bộ nhớ tạm; trình duyệt cũ / không phải HTTPS thì dùng cách dự phòng. */
export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
};
