// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import dayjs from "dayjs";

import type { Kpi } from "./types";

const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const fmtNum = (v?: number | null) => (v == null ? "—" : num.format(v));

export const fmtHours = (h?: number | null) =>
  h == null ? "—" : h >= 48 ? `${num.format(h / 24)} ngày` : `${num.format(h)} giờ`;

export const fmtMoneyShort = (v?: number | null) =>
  v == null
    ? "—"
    : v >= 1e9
      ? `${num.format(v / 1e9)} tỷ`
      : v >= 1e6
        ? `${num.format(v / 1e6)} tr`
        : `${num.format(v)} đ`;

export const fmtBucket = (iso: string, days: number) =>
  days <= 31 ? dayjs(iso).format("DD/MM") : `T ${dayjs(iso).format("DD/MM")}`;

export const kpi = (k: Omit<Kpi, "freshness">, at?: Date): Kpi => ({
  ...k,
  freshness: { tier: "Nóng", at: at ? dayjs(at).format("HH:mm") : "—" },
});
