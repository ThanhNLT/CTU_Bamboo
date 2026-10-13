// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Khoảng hiệu lực (tstzrange của PostgreSQL, Hasura trả dạng chuỗi) → ngày bắt đầu / kết thúc.
import dayjs from "dayjs";
import { parsePgTimestamp } from "../../../utils/format";

export type Period = { from?: string; to?: string; active: boolean; ended: boolean };

/** '["2026-10-01 05:00:00+00","2026-12-31 17:00:00+00")' → { from, to, active }. Cận trên là "hết ngày trước đó". */
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

/** "01/10/2026 – nay", "01/10/2026 – 31/12/2026" (cận trên lùi 1 giây để ra ngày cuối cùng còn hiệu lực). */
export const periodLabel = (p: Period) => {
  const from = p.from ? dayjs(p.from).format("DD/MM/YYYY") : "…";
  const to = p.to ? dayjs(p.to).subtract(1, "second").format("DD/MM/YYYY") : "nay";
  return `${from} – ${to}`;
};

/** dayjs → "YYYY-MM-DD" cho tham số ngày của Action. */
export const toDate = (d?: dayjs.Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);
