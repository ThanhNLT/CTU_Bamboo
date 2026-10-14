// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// KPI ghim Trang chủ (ADR #50): định nghĩa và chuỗi giá trị KPI của tenant (kpi.definition, kpi.value), KPI người
// dùng đã ghim (kpi.pin, chỉ của chính mình). Ghi chú dưới số so với kỳ trước, tô màu theo hướng tốt và ngưỡng.

// ===== Thư viện =====
import { useCallback, useEffect, useState } from "react"; // React

// ===== Module nội bộ =====
import { request } from "../../api/client";
import type { PinnedKpi, Tone } from "./types";

// ===== Truy vấn GraphQL =====
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

// ===== Kiểu dữ liệu =====
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

// ===== Hằng số =====
export const MAX_PINS = 6;
const PERIOD: Record<DefRow["grain"], string> = { hour: "giờ", day: "ngày", week: "tuần", month: "tháng" };

// ===== Hàm tiện ích =====
const num = (v: number, unit: string) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: unit === "%" || unit === "tỷ đồng" ? 1 : 0 }).format(v);

const withUnit = (v: number, unit: string) =>
  unit === "%" ? `${num(v, unit)}%` : unit === "hạt/m³" ? `${num(v, unit)}/m³` : `${num(v, unit)} ${unit}`;

/** KPI → thẻ trên Trang chủ: giá trị kỳ mới nhất, chênh lệch với kỳ trước, chuỗi tối đa 12 kỳ. */
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
    ? `${diff >= 0 ? "+" : "−"}${d.unit === "%" ? `${num(Math.abs(diff), "%")} điểm` : withUnit(Math.abs(diff), d.unit)} so với ${PERIOD[d.grain]} trước`
    : `Kỳ đầu tiên`;
  return {
    key: d.key,
    label: d.label,
    value: withUnit(last.value, d.unit),
    note: d.threshold != null ? `${delta} · ngưỡng ${withUnit(d.threshold, d.unit)}` : delta,
    noteTone: tone,
    noteMarker: breach ? "dot" : diff < 0 ? "down" : diff > 0 ? "up" : "dot",
    series: series.map((p) => p.value),
    threshold: d.threshold ?? undefined,
  };
};

// ===== Hook =====
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

  /** Lưu danh sách ghim theo thứ tự chọn (thay toàn bộ ghim cũ trong một giao dịch). */
  const save = async (keys: string[]) => {
    await request(SAVE, { pins: keys.slice(0, MAX_PINS).map((k, i) => ({ kpi_key: k, position: i + 1 })) });
    await load();
  };

  return { ...state, reload: load, save };
};
