// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Sinh chuỗi dữ liệu cảm biến mẫu (cố định, không ngẫu nhiên) và các phép tính trên chuỗi:
// gộp theo khung thời gian, tìm đoạn vượt ngưỡng, chọn miền trục Y. Khi nối Scorpio Temporal API thật,
// chỉ cần thay `minuteSeries` bằng dữ liệu trả về; phần còn lại giữ nguyên.
import type { BreachSpan, SeriesPoint, SignalSpec, Threshold, TimeRange } from "./types";

/** Mốc "bây giờ" của dữ liệu mẫu: 10:42 ngày 10/10/2026 (giờ Việt Nam). */
export const MOCK_NOW = Date.UTC(2026, 9, 10, 3, 42, 0);
export const MINUTE = 60_000;

export const RANGES: Record<TimeRange, { minutes: number; bucket: number; tickEvery: number; label: string; short: string }> = {
  "1h": { minutes: 60, bucket: 1, tickEvery: 10, label: "1 giờ qua", short: "1 giờ" },
  "24h": { minutes: 24 * 60, bucket: 15, tickEvery: 4 * 60, label: "24 giờ qua", short: "24 giờ" },
  "7d": { minutes: 7 * 24 * 60, bucket: 120, tickEvery: 24 * 60, label: "7 ngày qua", short: "7 ngày" },
};

/** Băm chuỗi thành số trong [0, 1) để có pha dao động khác nhau cho từng thực thể/chỉ số. */
const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/**
 * Mức ảnh hưởng (0..1) của một lần lệch tại phút m (m ≤ 0, 0 = bây giờ): dốc lên trong 4 phút,
 * kết thúc thì tụt nhanh một nấc rồi hồi dần theo hàm mũ (giống phòng sạch lọc lại không khí sau sự cố).
 */
const excursionWeight = (m: number, from: number, to: number | undefined) => {
  const start = -from;
  const end = to == null ? 0 : -to;
  if (m >= start && m <= end) return 1;
  if (m < start) return Math.max(0, 1 - (start - m) / 4);
  return 0.7 * Math.exp(-(m - end) / 10);
};

/** Giá trị thô tại phút m (chưa làm tròn, chưa ghim). */
const rawAt = (s: SignalSpec, m: number) => {
  const p = hash01(s.seed) * Math.PI * 2;
  const wave =
    0.5 * Math.sin(m / 7.3 + p) + 0.3 * Math.sin(m / 2.9 + p * 1.7) + 0.15 * Math.sin(m / 1.3 + p * 2.3) +
    0.35 * Math.sin((m / 1440) * Math.PI * 2 + p * 0.5);
  const natural = s.base + s.noise * wave;
  let w = 0;
  let level = 0;
  for (const e of s.excursions) {
    const we = excursionWeight(m, e.from, e.to);
    if (we > w) {
      w = we;
      level = e.level;
    }
  }
  // Trong lúc lệch vẫn giữ một phần dao động tự nhiên để đường không phẳng.
  return w === 0 ? natural : (1 - w) * natural + w * (level + (natural - s.base) * 0.6);
};

/** Chuỗi từng phút trong `minutes` phút gần nhất. Điểm cuối có dữ liệu được ghim vào `pin` (nắn dần trong 5 phút). */
export const minuteSeries = (s: SignalSpec, minutes: number): SeriesPoint[] => {
  const last = -s.gapMinutes;
  const correction = s.pin == null ? 0 : s.pin - rawAt(s, last);
  const out: SeriesPoint[] = [];
  for (let m = -minutes; m <= 0; m++) {
    const t = MOCK_NOW + m * MINUTE;
    if (m > last) {
      out.push({ t, v: null });
      continue;
    }
    const nudge = correction * Math.max(0, 1 + (m - last) / 5);
    out.push({ t, v: round(rawAt(s, m) + nudge, s.decimals) });
  }
  return out;
};

/** Giá trị đọc gần nhất (điểm cuối có dữ liệu). */
export const latestValue = (s: SignalSpec) => {
  const pts = minuteSeries(s, s.gapMinutes);
  return pts[0]?.v ?? s.base;
};

const isOutside = (v: number, th: Threshold): "above" | "below" | null => {
  if (th.max != null && v > th.max) return "above";
  if (th.min != null && v < th.min) return "below";
  return null;
};

/** Các đoạn liên tục nằm ngoài ngưỡng, tính trên dữ liệu từng phút. */
export const breachSpans = (points: SeriesPoint[], th: Threshold): BreachSpan[] => {
  const spans: BreachSpan[] = [];
  let open: BreachSpan | null = null;
  for (const p of points) {
    const side = p.v == null ? null : isOutside(p.v, th);
    if (side && open && open.side === side) {
      open.end = p.t;
      open.minutes += 1;
    } else {
      if (open) spans.push(open);
      open = side ? { start: p.t, end: p.t, minutes: 1, side } : null;
    }
  }
  if (open) spans.push(open);
  return spans;
};

/** Cách gộp một khung: chỉ có ngưỡng trên → lấy đỉnh; chỉ có ngưỡng dưới → lấy đáy; có cả hai → trung bình. */
export const aggregationOf = (th: Threshold): "max" | "min" | "mean" =>
  th.max != null && th.min == null ? "max" : th.min != null && th.max == null ? "min" : "mean";

/** Gộp chuỗi từng phút thành các khung `bucket` phút; mốc của khung là phút cuối của khung. */
export const bucketize = (points: SeriesPoint[], bucket: number, agg: "max" | "min" | "mean", decimals: number) => {
  if (bucket <= 1) return points;
  const out: SeriesPoint[] = [];
  // points[0] ứng với -minutes; mỗi khung gồm `bucket` phút kết thúc tại mốc của nó.
  for (let end = points.length - 1; end >= 0; end -= bucket) {
    const vals = points
      .slice(Math.max(0, end - bucket + 1), end + 1)
      .map((p) => p.v)
      .filter((v): v is number => v != null);
    const t = points[end]?.t ?? 0;
    if (!vals.length) out.push({ t, v: null });
    else if (agg === "max") out.push({ t, v: Math.max(...vals) });
    else if (agg === "min") out.push({ t, v: Math.min(...vals) });
    else out.push({ t, v: round(vals.reduce((a, b) => a + b, 0) / vals.length, decimals) });
  }
  return out.reverse();
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
