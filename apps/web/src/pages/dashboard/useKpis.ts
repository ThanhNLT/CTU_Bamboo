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

import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";
import type { PinnedKpi, Tone } from "./types";
import { tr, trf } from "../../i18n";

const KPIS = `query Kpis {
  kpi_definition(order_by: {label: asc}) {
    key label unit good_direction threshold grain definition
    values(order_by: {period_start: desc}, limit: 14) { period_start value }
  }
  kpi_pin(order_by: {position: asc}) { kpi_key position }
}`;

const SAVE = `mutation SavePins($pins: [kpi_pin_insert_input!]!) {
  delete_kpi_pin(where: {}) { affected_rows }
  insert_kpi_pin(objects: $pins) { affected_rows }
}`;

type DefRow = {
  key: string;
  label: string;
  unit: string;
  good_direction: "up" | "down" | "neutral";
  threshold: number | null;
  grain: "hour" | "day" | "week" | "month";
  definition: string;
  values: { period_start: string; value: number }[];
};

export type KpiOption = { key: string; label: string; definition: string; grain: DefRow["grain"] };

export const MAX_PINS = 6;
const PERIOD: Record<DefRow["grain"], string> = {
  hour: tr("giờ"),
  day: tr("ngày"),
  week: tr("tuần"),
  month: tr("tháng"),
};

const num = (v: number, unit: string) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: unit === "%" || unit === "tỷ đồng" ? 1 : 0 }).format(v);

const withUnit = (v: number, unit: string) =>
  unit === "%" ? `${num(v, unit)}%` : unit === "hạt/m³" ? `${num(v, unit)}/m³` : `${num(v, unit)} ${unit}`;

export const toPinned = (d: DefRow): PinnedKpi | null => {
  const series = [...d.values].reverse().slice(-12);
  const last = series.at(-1);
  if (!last) return null;
  const prev = series.at(-2);
  const breach =
    d.threshold != null &&
    ((d.good_direction === "up" && last.value < d.threshold) ||
      (d.good_direction === "down" && last.value > d.threshold));
  const diff = prev ? last.value - prev.value : 0;
  const better = d.good_direction === "neutral" || diff === 0 ? null : diff > 0 === (d.good_direction === "up");
  const tone: Tone = breach ? "danger" : better === false ? "warning" : better ? "success" : "neutral";
  const delta = prev
    ? trf("{0}{1} so với {2} trước", [
        diff >= 0 ? "+" : "−",
        d.unit === "%" ? trf("{0} điểm", [num(Math.abs(diff), "%")]) : withUnit(Math.abs(diff), d.unit),
        PERIOD[d.grain],
      ])
    : tr("Kỳ đầu tiên");
  return {
    key: d.key,
    label: d.label,
    value: withUnit(last.value, d.unit),
    note: d.threshold != null ? trf("{0} · ngưỡng {1}", [delta, withUnit(d.threshold, d.unit)]) : delta,
    noteTone: tone,
    noteMarker: breach ? "dot" : diff < 0 ? "down" : diff > 0 ? "up" : "dot",
    series: series.map((p) => p.value),
    threshold: d.threshold ?? undefined,
  };
};

export const useKpis = () => {
  const [state, setState] = useState<{
    pinned: PinnedKpi[];
    options: KpiOption[];
    pinnedKeys: string[];
    loading: boolean;
    error?: string;
  }>({ pinned: [], options: [], pinnedKeys: [], loading: true });

  const load = useCallback(async () => {
    try {
      const r = await request<{ kpi_definition: DefRow[]; kpi_pin: { kpi_key: string; position: number }[] }>(KPIS);
      const byKey = new Map(r.kpi_definition.map((d) => [d.key, d]));
      const pinnedKeys = r.kpi_pin.map((p) => p.kpi_key).filter((k) => byKey.has(k));
      setState({
        pinned: pinnedKeys.map((k) => toPinned(byKey.get(k)!)).filter((k): k is PinnedKpi => k != null),
        options: r.kpi_definition.map((d) => ({
          key: d.key,
          label: d.label,
          definition: d.definition,
          grain: d.grain,
        })),
        pinnedKeys,
        loading: false,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (keys: string[]) => {
    await request(SAVE, { pins: keys.slice(0, MAX_PINS).map((k, i) => ({ kpi_key: k, position: i + 1 })) });
    await load();
  };

  return { ...state, reload: load, save };
};
