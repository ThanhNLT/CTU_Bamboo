/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";
import { usePolling } from "../../live/usePolling";
import { useOpsLiveTick } from "./live";

export type OpsTab = "process" | "production" | "hospital" | "quality" | "sites";

export type ProcessType = {
  entity_type: string;
  label: string;
  submitted: number;
  completed: number;
  rejected: number;
  returned: number;
  cancelled: number;
  open: number;
  overdue: number;
  avg_hours: number | null;
  p90_hours: number | null;
};

export type ProcessData = {
  totals: {
    submitted: number;
    completed: number;
    rejected: number;
    returned: number;
    cancelled: number;
    open: number;
    overdue: number;
    approval_rate: number | null;
    avg_hours: number | null;
    p50_hours: number | null;
    p90_hours: number | null;
  };
  by_type: ProcessType[];
  trend: { at: string; submitted: number; completed: number; other: number }[];
  bottlenecks: {
    position: string;
    unit: string;
    closed: number;
    avg_hours: number | null;
    open: number;
    overdue: number;
    oldest_open_hours: number | null;
  }[];
};

export type ProductionData = {
  totals: {
    lots: number;
    lots_on_hold: number;
    lots_scrapped: number;
    ic_pending: number;
    ic_confirmed_value: number;
    ic_confirm_hours: number | null;
    po_orders: number;
    po_value: number;
  };
  by_company: { company: string; RELEASED: number; ON_HOLD: number; SCRAPPED: number }[];
  trend: { at: string; lots: number; on_hold: number }[];
  items: { item: string; uom: string; released: number; on_hold: number; lots: number }[];
  flows: { buyer: string; seller: string; orders: number; pending: number; confirmed_value: number }[];
  held: {
    lot_no: string;
    item: string;
    company: string;
    quantity: number;
    uom: string;
    produced_on: string;
    note: string | null;
  }[];
};

export type HospitalUnit = {
  unit: string;
  headcount: number;
  positions: number;
  vacant: number;
  pr_submitted: number;
  pr_approved_value: number;
  pr_pending: number;
  open_tasks: number;
  overdue_tasks: number;
};

export type HospitalTenant = Omit<HospitalUnit, "unit"> & {
  tenant: string;
  onboarding_created: number;
  onboarding_approved: number;
  units: HospitalUnit[];
  monthly: { month: string; pr_approved: number; pr_approved_value: number }[];
};

export type HospitalData = { allowed: boolean; scope?: "children" | "self"; tenants: HospitalTenant[] };

export type QualityCheck = {
  key: string;
  label: string;
  severity: "info" | "warning" | "critical";
  link: string;
  count: number;
  samples: string[];
};

export type QualityData = { admin: boolean; score: number; checks: QualityCheck[] };

export type OpsSite = {
  id: string;
  name: string;
  province: string | null;
  lat: number;
  lng: number;
  company: string;
  subsidiary: boolean;
  open_tasks: number;
  overdue_tasks: number;
  held_lots: number;
  alerts: string[];
  status: "ok" | "warning" | "critical";
};

export type SitesData = { sites: OpsSite[] };

type DataOf = {
  process: ProcessData;
  production: ProductionData;
  hospital: HospitalData;
  quality: QualityData;
  sites: SitesData;
};

const REFRESH_MS = 60_000;

export const useOpsTab = <T extends OpsTab>(tab: T | null, days: number) => {
  const tick = useOpsLiveTick();
  const [state, setState] = useState<{ data?: DataOf[T]; error?: string; loading: boolean; at?: Date }>({
    loading: true,
  });

  const load = useCallback(async () => {
    if (!tab) return;
    try {
      const r = await request<{ ops_dashboard: { data: DataOf[T] } }>(
        `query Ops($t: String!, $d: Int) { ops_dashboard(tab: $t, days: $d) { data } }`,
        { t: tab, d: days },
      );
      setState({ data: r.ops_dashboard.data, loading: false, at: new Date() });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [tab, days]);

  useEffect(() => {
    if (!tab) return;
    setState({ loading: true });
    void load();
  }, [tab, load]);
  usePolling(() => void load(), REFRESH_MS, Boolean(tab));

  useEffect(() => {
    if (tick) void load();
  }, [tick, load]);

  return { ...state, reload: load };
};
