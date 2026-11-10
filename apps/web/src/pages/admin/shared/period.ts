import dayjs from "dayjs";

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
  const from = p.from ? dayjs(p.from).format("DD/MM/YYYY") : "…";
  const to = p.to ? dayjs(p.to).subtract(1, "second").format("DD/MM/YYYY") : "nay";
  return `${from} – ${to}`;
};

export const toDate = (d?: dayjs.Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);
