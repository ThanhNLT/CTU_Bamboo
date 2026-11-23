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

import { tr } from "../../../i18n";
import { parsePgTimestamp } from "../../../utils/format";

export type Period = { from?: string; to?: string; active: boolean; ended: boolean };

export const parsePeriod = (range?: string | null): Period => {
  const m = /^[[(]"?([^",]*)"?,"?([^",)\]]*)"?[)\]]$/.exec(range ?? "");
  if (!m) return { active: true, ended: false };
  const from = m[1] ? parsePgTimestamp(m[1]) : undefined;
  const to = m[2] ? parsePgTimestamp(m[2]) : undefined;
  const now = dayjs();
  return {
    from: from?.toISOString(),
    to: to?.toISOString(),
    active: (!from || !from.isAfter(now)) && (!to || to.isAfter(now)),
    ended: Boolean(to && !to.isAfter(now)),
  };
};

export const periodLabel = (p: Period) => {
  const from = p.from ? dayjs(p.from).format("DD-MMM-YYYY") : "…";
  const to = p.to ? dayjs(p.to).subtract(1, "second").format("DD-MMM-YYYY") : tr("nay");
  return `${from} – ${to}`;
};

export const toDate = (d?: dayjs.Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);
