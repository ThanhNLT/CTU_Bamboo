/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

export type Named = { name: string; label: string };
export type Measure = Named & { unit: string };
export type Source = Named & { dimensions: Named[]; measures: Measure[] };
export type Catalog = { sources: Source[]; grains: Named[] };

export type ChartType = "bar" | "stacked" | "line" | "area" | "pie" | "table";

export type Filter = { dimension: string; values: string[] };

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

export type Pivot = {
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string; unit: string }>;
  categoryLabel: string;
  truncated: boolean;
};
