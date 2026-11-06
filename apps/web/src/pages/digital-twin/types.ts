// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

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
  /** Nguồn số đo trực tiếp (ADR #74); null = dữ liệu mẫu */
  liveSource: "mqtt" | "api" | null;
  status: EntityStatus;
  subtitle: string;
  metrics: Metric[];
  incidents: Incident[];
};

export type SeriesPoint = { t: number; v: number | null };

export type BreachSpan = { start: number; end: number; minutes: number; side: "above" | "below" };
