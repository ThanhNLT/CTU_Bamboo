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

export type DomainFilter = "all" | string;

export type PiiLevel = "none" | "masked" | "raw";

export type StorageTier = "hot" | "warm" | "cold";

export type ColumnDef = { name: string; type: string; description: string; pii?: boolean };

export type QualityCheck = { name: string; passed: boolean; detail: string };

export type Dataset = {
  id: string;
  table: string;
  title: string;
  description: string;
  domain: string;
  owner: string;
  refresh: string;
  rows?: number;
  access: string;
  updatedLabel: string;
  certified: boolean;
  pii: PiiLevel;
  piiNote?: string;
  tier: StorageTier;
  columns: ColumnDef[];
  checks: QualityCheck[];
  upstream: string[];
  downstream: string[];
  graphql: string;
  sql: string;
};

export type DatasetPreview = {
  totalRows: number;
  rows: Array<Record<string, unknown>>;
  masked: string[];
};

export type DetailTab = "schema" | "sample" | "usage" | "quality" | "lineage";
