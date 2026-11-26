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

export type EntityCategory = "smt" | "cleanroom" | "medical";
export type CategoryFilter = "all" | EntityCategory;

export type EntityStatus = "critical" | "warning" | "ok" | "offline";
export type MetricStatus = "critical" | "warning" | "ok" | "stale";

export type TimeRange = "1h" | "24h" | "7d";

export type Threshold = { min?: number; max?: number };

export type MetricDef = {
  key: string;
  label: string;
  unit: string;
  unitLong?: string;
  decimals: number;
  threshold: Threshold;
  limitLabel?: string;
};

export type Incident = {
  id: string;
  code: string;
  attribute: string;
  side: "above" | "below";
  threshold: number;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  peak: number;
  severity: "critical" | "warning";
  open: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ackNote: string | null;
};

export type Metric = MetricDef & {
  value: number;
  observedAt: string | null;
  status: MetricStatus;
  note: string;
  incident?: Incident;
};

export type TwinEntity = {
  id: string;
  uuid: string;
  category: EntityCategory;
  type: string;
  urn: string;
  kind: string;
  name: string;
  site: string;
  siteId: string;
  province: string;
  grade: string;
  offlineMinutes?: number;
  lastSeenAt: string | null;
  liveSource: "mqtt" | "api" | null;
  status: EntityStatus;
  subtitle: string;
  metrics: Metric[];
  incidents: Incident[];
};

export type SeriesPoint = { t: number; v: number | null };

export type BreachSpan = { start: number; end: number; minutes: number; side: "above" | "below" };
