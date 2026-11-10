/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import dayjs from "dayjs";

import { getLocale, tr, trf } from "../../i18n";
import { IC_STATUS_LABEL, PR_STATUS_LABEL } from "../../utils/status";
import type { Catalog, ChartSpec, Pivot, QueryResult, Source } from "./types";

export const MAX_SERIES = 12;

export const PALETTE = [
  "#2f7a3e",
  "#e07b39",
  "#3b7dd8",
  "#98c9a0",
  "#c9a227",
  "#8a5cc2",
  "#2aa198",
  "#d0567a",
  "#7a8a99",
  "#5fae6e",
  "#b5651d",
  "#4a6fa5",
];

const numberFormat = () =>
  new Intl.NumberFormat(getLocale() === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: 2 });
const compactFormat = () =>
  new Intl.NumberFormat(getLocale() === "en" ? "en-US" : "vi-VN", { notation: "compact", maximumFractionDigits: 1 });

export const fmt = (v: number) => numberFormat().format(v);
export const fmtCompact = (v: number) => compactFormat().format(v);

export const sourceOf = (catalog: Catalog | null, name?: string): Source | undefined =>
  catalog?.sources.find((s) => s.name === name);

const GRAIN_FORMAT: Record<string, string> = { day: "DD/MM/YYYY", week: "DD/MM/YYYY", month: "MM/YYYY" };

/** Nhãn hiển thị của một giá trị chiều: mã trạng thái thành chữ, kỳ thời gian theo chu kỳ đã chọn. */
export const valueLabel = (column: string, value: unknown, grain?: string | null): string => {
  if (value == null || value === "") return tr("(trống)");
  const text = String(value);
  if (column === "period") {
    const d = dayjs(text);
    if (!d.isValid()) return text;
    return grain === "week" ? trf("Tuần {0}", [d.format(GRAIN_FORMAT.week)]) : d.format(GRAIN_FORMAT[grain ?? "day"]);
  }
  if (column === "status") return PR_STATUS_LABEL[text] ?? IC_STATUS_LABEL[text] ?? text;
  return text;
};

const toNumber = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Xoay kết quả thành dữ liệu biểu đồ: trục là kỳ thời gian (nếu có) hoặc chiều đầu tiên; các chiều còn lại và
 * (khi chọn nhiều chỉ số) từng chỉ số thành chuỗi. Giữ MAX_SERIES chuỗi có tổng lớn nhất.
 */
export const pivot = (result: QueryResult, spec: ChartSpec, catalog: Catalog | null): Pivot => {
  const source = sourceOf(catalog, result.source);
  const dimLabel = (d: string) =>
    d === "period" ? tr("Kỳ") : (source?.dimensions.find((x) => x.name === d)?.label ?? d);
  const metricCols = result.measures.length > 1 ? result.measures.map((m) => m.name) : ["value"];
  const dimCols = result.columns.filter((c) => !metricCols.includes(c));
  const [category, ...rest] = dimCols;
  const points = new Map<string, Record<string, string | number>>();
  const series = new Map<string, { key: string; label: string; unit: string; total: number }>();

  for (const row of result.rows) {
    const cell = (c: string) => row[result.columns.indexOf(c)];
    const cat = category ? valueLabel(category, cell(category), spec.time_grain) : tr("Tổng");
    const restLabel = rest.map((c) => valueLabel(c, cell(c), spec.time_grain)).join(" · ");
    const point = points.get(cat) ?? { __category: cat };
    result.measures.forEach((m, i) => {
      const value = toNumber(cell(metricCols[i]));
      const label =
        result.measures.length > 1 ? (restLabel ? `${m.label} · ${restLabel}` : m.label) : restLabel || m.label;
      const s = series.get(label) ?? { key: `s${series.size}`, label, unit: m.unit, total: 0 };
      s.total += Math.abs(value);
      series.set(label, s);
      point[s.key] = ((point[s.key] as number | undefined) ?? 0) + value;
    });
    points.set(cat, point);
  }

  const all = [...series.values()];
  const kept = all.length > MAX_SERIES ? [...all].sort((a, b) => b.total - a.total).slice(0, MAX_SERIES) : all;
  const keep = new Set(kept.map((s) => s.key));
  const data = [...points.values()].map((p) =>
    Object.fromEntries(Object.entries(p).filter(([k]) => k === "__category" || keep.has(k))),
  );
  for (const p of data) for (const s of kept) p[s.key] ??= 0;
  return {
    data,
    series: all.filter((s) => keep.has(s.key)).map(({ key, label, unit }) => ({ key, label, unit })),
    categoryLabel: category ? dimLabel(category) : "",
    truncated: kept.length < all.length,
  };
};

const BOM = String.fromCharCode(0xfeff);

const csvCell = (v: unknown) => {
  const text = v == null ? "" : String(v);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Bảng CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt) theo đúng cột của kết quả, tiêu đề là tên nghiệp vụ. */
export const toCsv = (result: QueryResult, catalog: Catalog | null) => {
  const source = sourceOf(catalog, result.source);
  const header = result.columns.map((c) => {
    if (c === "period") return tr("Kỳ");
    if (c === "value") return result.measures[0]?.label ?? c;
    return result.measures.find((m) => m.name === c)?.label ?? source?.dimensions.find((d) => d.name === c)?.label ?? c;
  });
  const lines = [header, ...result.rows].map((r) => r.map(csvCell).join(","));
  return `${BOM}${lines.join("\r\n")}\r\n`;
};

export const download = (name: string, content: string, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const fileName = (title: string, ext: string) =>
  `${
    title
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "bieu-do"
  }.${ext}`;

/** Tên gợi ý cho biểu đồ mới: chỉ số theo chiều. */
export const suggestName = (spec: ChartSpec, catalog: Catalog | null) => {
  const source = sourceOf(catalog, spec.source);
  const metrics = spec.metrics.map((m) => source?.measures.find((x) => x.name === m)?.label ?? m).join(", ");
  const by = [
    ...(spec.time_grain ? [catalog?.grains.find((g) => g.name === spec.time_grain)?.label ?? spec.time_grain] : []),
    ...spec.dimensions.map((d) => source?.dimensions.find((x) => x.name === d)?.label.toLowerCase() ?? d),
  ];
  return by.length ? trf("{0} theo {1}", [metrics, by.join(", ")]) : metrics;
};
