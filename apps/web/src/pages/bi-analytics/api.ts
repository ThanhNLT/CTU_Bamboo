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

import { request } from "../../api/client";
import type { Catalog, ChartSpec, ChartType, QueryResult, SavedChart } from "./types";

export const fetchCatalog = async () => {
  const { semantic_catalog } = await request<{ semantic_catalog: Catalog }>(
    `query { semantic_catalog { sources grains } }`,
  );
  return semantic_catalog;
};

export const runQuery = async (spec: ChartSpec) => {
  const { semantic_query } = await request<{ semantic_query: QueryResult }>(
    `query($metrics: [String!], $dimensions: [String!], $grain: String, $from: String, $to: String, $filters: jsonb,
           $limit: Int) {
      semantic_query(metrics: $metrics, dimensions: $dimensions, time_grain: $grain, from: $from, to: $to,
                     filters: $filters, limit: $limit) { source measures columns rows sql } }`,
    {
      metrics: spec.metrics,
      dimensions: spec.dimensions,
      grain: spec.time_grain || null,
      from: spec.from || null,
      to: spec.to || null,
      filters: spec.filters?.length ? spec.filters : null,
      limit: spec.limit ?? 500,
    },
  );
  return semantic_query;
};

const CHART = "id name chart_type spec shared is_mine updated_at";

export const fetchCharts = async () => {
  const { kpi_chart } = await request<{ kpi_chart: SavedChart[] }>(
    `query { kpi_chart(order_by: {updated_at: desc}, limit: 100) { ${CHART} } }`,
  );
  return kpi_chart;
};

export type ChartInput = { name: string; chart_type: ChartType; spec: ChartSpec; shared: boolean };

export const saveChart = async (input: ChartInput, id?: string) => {
  if (id) {
    const { update_kpi_chart_by_pk } = await request<{ update_kpi_chart_by_pk: SavedChart | null }>(
      `mutation($id: uuid!, $set: kpi_chart_set_input!) {
        update_kpi_chart_by_pk(pk_columns: {id: $id}, _set: $set) { ${CHART} } }`,
      { id, set: input },
    );
    if (!update_kpi_chart_by_pk) throw new Error("not-found");
    return update_kpi_chart_by_pk;
  }
  const { insert_kpi_chart_one } = await request<{ insert_kpi_chart_one: SavedChart }>(
    `mutation($o: kpi_chart_insert_input!) { insert_kpi_chart_one(object: $o) { ${CHART} } }`,
    { o: input },
  );
  return insert_kpi_chart_one;
};

export const deleteChart = async (id: string) => {
  await request(`mutation($id: uuid!) { delete_kpi_chart_by_pk(id: $id) { id } }`, { id });
};
