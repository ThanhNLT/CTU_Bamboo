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

import dayjs from "dayjs";

import type { Kpi } from "./types";
import { trf } from "../../i18n";

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

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
  days <= 31 ? dayjs(iso).format("DD-MMM") : `T ${dayjs(iso).format("DD-MMM")}`;

export const kpi = (k: Omit<Kpi, "freshness">, at?: Date): Kpi => ({
  ...k,
  freshness: { tier: "hot", at: at ? dayjs(at).format("HH:mm") : "—" },
});
