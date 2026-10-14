// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Phép tính trên chuỗi đo của Bản sao số (iot.measurement, ADR #50): gộp theo khung thời gian, tìm đoạn vượt ngưỡng,
// chọn miền trục Y, vạch chia trục X. Chuỗi đo không đều (mặc định mỗi 5 phút, có thể mất tín hiệu).

// ===== Module nội bộ =====
import type { BreachSpan, SeriesPoint, Threshold, TimeRange } from "./types";

// ===== Hằng số =====
export const MINUTE = 60_000;

export const RANGES: Record<
  TimeRange,
  { minutes: number; bucket: number; tickEvery: number; label: string; short: string }
> = {
  "1h": { minutes: 60, bucket: 1, tickEvery: 10, label: "1 giờ qua", short: "1 giờ" },
  "24h": { minutes: 24 * 60, bucket: 15, tickEvery: 4 * 60, label: "24 giờ qua", short: "24 giờ" },
  "7d": { minutes: 7 * 24 * 60, bucket: 120, tickEvery: 24 * 60, label: "7 ngày qua", short: "7 ngày" },
};

// ===== Hàm tiện ích =====
const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** Khoảng cách thường gặp giữa hai điểm đo (phút), để tính độ dài đoạn vượt ngưỡng. */
export const stepMinutes = (points: SeriesPoint[]) => {
  const gaps = points
    .slice(1)
    .map((p, i) => (p.t - points[i].t) / MINUTE)
    .filter((g) => g > 0);
  if (!gaps.length) return 1;
  return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
};

const isOutside = (v: number, th: Threshold): "above" | "below" | null => {
  if (th.max != null && v > th.max) return "above";
  if (th.min != null && v < th.min) return "below";
  return null;
};

/** Các đoạn liên tục nằm ngoài ngưỡng; mỗi điểm đo tính bằng một chu kỳ đo. */
export const breachSpans = (points: SeriesPoint[], th: Threshold): BreachSpan[] => {
  const step = stepMinutes(points);
  const spans: BreachSpan[] = [];
  let open: BreachSpan | null = null;
  for (const p of points) {
    const side = p.v == null ? null : isOutside(p.v, th);
    if (side && open && open.side === side) {
      open.end = p.t;
      open.minutes += step;
    } else {
      if (open) spans.push(open);
      open = side ? { start: p.t, end: p.t, minutes: step, side } : null;
    }
  }
  if (open) spans.push(open);
  return spans;
};

/** Cách gộp một khung: chỉ có ngưỡng trên → lấy đỉnh; chỉ có ngưỡng dưới → lấy đáy; có cả hai → trung bình. */
export const aggregationOf = (th: Threshold): "max" | "min" | "mean" =>
  th.max != null && th.min == null ? "max" : th.min != null && th.max == null ? "min" : "mean";

/** Gộp chuỗi thành các khung `bucket` phút tính từ điểm cuối về trước; mốc của khung là thời điểm cuối khung.
 * Khung không có điểm đo nào thì để trống (đường biểu đồ đứt quãng). */
export const bucketize = (points: SeriesPoint[], bucket: number, agg: "max" | "min" | "mean", decimals: number) => {
  if (bucket <= 1 || points.length === 0) return points;
  const size = bucket * MINUTE;
  const last = points[points.length - 1].t;
  const groups = new Map<number, number[]>();
  for (const p of points) {
    const end = last - Math.floor((last - p.t) / size) * size;
    if (p.v != null) groups.set(end, [...(groups.get(end) ?? []), p.v]);
    else if (!groups.has(end)) groups.set(end, []);
  }
  return [...groups.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([t, vals]) => ({
      t,
      v: !vals.length
        ? null
        : agg === "max"
          ? Math.max(...vals)
          : agg === "min"
            ? Math.min(...vals)
            : round(vals.reduce((s2, x) => s2 + x, 0) / vals.length, decimals),
    }));
};

/** Bước "đẹp" (1, 2, 2,5, 5 × 10^k) gần nhất lớn hơn hoặc bằng x. */
const niceStep = (x: number) => {
  const k = 10 ** Math.floor(Math.log10(x));
  const f = x / k;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * k;
};

/** Miền trục Y + vạch chia: bao cả dữ liệu lẫn ngưỡng, chừa lề, khoảng 4 khoảng chia. */
export const yAxisOf = (points: SeriesPoint[], th: Threshold) => {
  const vals = points.map((p) => p.v).filter((v): v is number => v != null);
  if (th.min != null) vals.push(th.min);
  if (th.max != null) vals.push(th.max);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.25, Math.abs(hi) * 0.02, 1e-6);
  const step = niceStep((hi - lo + 2 * pad) / 4);
  const min = Math.floor((lo - pad) / step) * step;
  const max = Math.ceil((hi + pad) / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { domain: [min, max] as [number, number], ticks };
};

/** Mốc vạch chia trục X: tròn theo `every` phút (giờ Việt Nam = UTC+7). */
export const xTicksOf = (start: number, end: number, every: number) => {
  const tz = 7 * 60 * MINUTE;
  const stepMs = every * MINUTE;
  const ticks: number[] = [];
  for (let t = Math.ceil((start + tz) / stepMs) * stepMs - tz; t <= end; t += stepMs) ticks.push(t);
  return ticks;
};
