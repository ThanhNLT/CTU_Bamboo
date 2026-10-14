// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Định dạng số liệu và dựng thẻ KPI cho các bảng tính ở máy chủ (Action ops_dashboard).

// ===== Thư viện =====
import dayjs from "dayjs"; // Day.js

// ===== Module nội bộ =====
import type { Kpi } from "./types";

// ===== Hàm tiện ích =====
const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const fmtNum = (v?: number | null) => (v == null ? "—" : num.format(v));

/** Giờ → "13,7 giờ" / "2,1 ngày". */
export const fmtHours = (h?: number | null) =>
  h == null ? "—" : h >= 48 ? `${num.format(h / 24)} ngày` : `${num.format(h)} giờ`;

/** Tiền gọn: 1,2 tỷ / 350 tr (đồng). */
export const fmtMoneyShort = (v?: number | null) =>
  v == null
    ? "—"
    : v >= 1e9
      ? `${num.format(v / 1e9)} tỷ`
      : v >= 1e6
        ? `${num.format(v / 1e6)} tr`
        : `${num.format(v)} đ`;

/** Nhãn trục thời gian: "14/10" (ngày) hoặc "T 06/10" (tuần bắt đầu ngày đó). */
export const fmtBucket = (iso: string, days: number) =>
  days <= 31 ? dayjs(iso).format("DD/MM") : `T ${dayjs(iso).format("DD/MM")}`;

export const kpi = (k: Omit<Kpi, "freshness">, at?: Date): Kpi => ({
  ...k,
  freshness: { tier: "Nóng", at: at ? dayjs(at).format("HH:mm") : "—" },
});
