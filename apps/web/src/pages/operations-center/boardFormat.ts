// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import dayjs from "dayjs";

import type { Kpi } from "./types";
import { trf } from "../../i18n";

const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const fmtNum = (v?: number | null) => (v == null ? "—" : num.format(v));

export const fmtHours = (h?: number | null) =>
  h == null ? "—" : h >= 48 ? trf("{0} ngày", [num.format(h / 24)]) : trf("{0} giờ", [num.format(h)]);

export const fmtMoneyShort = (v?: number | null) =>
  v == null
    ? "—"
    : v >= 1e9
      ? trf("{0} tỷ", [num.format(v / 1e9)])
      : v >= 1e6
        ? `${num.format(v / 1e6)} tr`
        : trf("{0} đ", [num.format(v)]);

export const fmtBucket = (iso: string, days: number) =>
  days <= 31 ? dayjs(iso).format("DD/MM") : `T ${dayjs(iso).format("DD/MM")}`;

export const kpi = (k: Omit<Kpi, "freshness">, at?: Date): Kpi => ({
  ...k,
  // i18n-ignore: mức độ tươi là giá trị dữ liệu (kiểu literal), dịch lúc hiển thị (KpiCard)
  freshness: { tier: "Nóng", at: at ? dayjs(at).format("HH:mm") : "—" },
});
