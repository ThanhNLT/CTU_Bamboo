// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type Named = { name: string; label: string };
export type Measure = Named & { unit: string };
export type Source = Named & { dimensions: Named[]; measures: Measure[] };
export type Catalog = { sources: Source[]; grains: Named[] };

export type ChartType = "bar" | "stacked" | "line" | "area" | "pie" | "table";

export type Filter = { dimension: string; values: string[] };

/** Định nghĩa biểu đồ theo tên nghiệp vụ của lớp ngữ nghĩa; lưu nguyên vào kpi.chart.spec. */
export type ChartSpec = {
  source: string;
  metrics: string[];
  dimensions: string[];
  time_grain?: string | null;
  from?: string | null;
  to?: string | null;
  filters?: Filter[];
  limit?: number;
};

export type QueryResult = {
  source: string;
  measures: Measure[];
  columns: string[];
  rows: Array<Array<string | number | null>>;
  sql: string;
};

export type SavedChart = {
  id: string;
  name: string;
  chart_type: ChartType;
  spec: ChartSpec;
  shared: boolean;
  is_mine: boolean;
  updated_at: string;
};

/** Dữ liệu đã xoay cho recharts: mỗi điểm một nhãn trục, mỗi chuỗi một khóa. */
export type Pivot = {
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string; unit: string }>;
  categoryLabel: string;
  truncated: boolean;
};
