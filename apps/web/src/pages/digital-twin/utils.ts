// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Tone } from "../../components/ui";
import { fold } from "../../utils/text";
import type { CategoryFilter, EntityCategory, EntityStatus, MetricStatus, Threshold, TwinEntity } from "./types";
import { tr, trf } from "../../i18n";

export const CATEGORY_TABS: Array<{ key: CategoryFilter; label: string }> = [
  { key: "all", label: tr("Tất cả") },
  { key: "smt", label: tr("Dây chuyền SMT") },
  { key: "cleanroom", label: tr("Phòng sạch") },
  { key: "medical", label: tr("Thiết bị y tế") },
];

export const ENTITY_STATUS: Record<EntityStatus, { label: string; tone: Tone }> = {
  critical: { label: tr("Nguy cấp"), tone: "danger" },
  warning: { label: tr("Cảnh báo"), tone: "warning" },
  ok: { label: tr("Bình thường"), tone: "success" },
  offline: { label: tr("Mất tín hiệu"), tone: "neutral" },
};

export const METRIC_TONE: Record<MetricStatus, Tone> = {
  critical: "danger",
  warning: "warning",
  ok: "success",
  stale: "neutral",
};

export const formatNumber = (n: number, decimals?: number) =>
  new Intl.NumberFormat(
    "vi-VN",
    decimals == null
      ? { maximumFractionDigits: 2 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals },
  ).format(n);

const VN_OFFSET = 7 * 3_600_000;

const pad2 = (n: number) => String(n).padStart(2, "0");
const vn = (t: number) => new Date(t + VN_OFFSET);

export const formatTime = (t: number) => `${pad2(vn(t).getUTCHours())}:${pad2(vn(t).getUTCMinutes())}`;
export const formatClock = (t: number) => `${formatTime(t)}:${pad2(vn(t).getUTCSeconds())}`;
export const formatDay = (t: number) => `${pad2(vn(t).getUTCDate())}/${pad2(vn(t).getUTCMonth() + 1)}`;
export const formatDayTime = (t: number) => `${formatDay(t)} ${formatTime(t)}`;

export const formatDuration = (minutes: number) => {
  if (minutes < 60) return trf("{0} phút", [minutes]);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return h > 0 ? trf("{0} ngày {1} giờ", [d, h]) : trf("{0} ngày", [d]);
  return m > 0 ? trf("{0} giờ {1} phút", [h, m]) : trf("{0} giờ", [h]);
};

export const thresholdText = (th: Threshold) => {
  if (th.min != null && th.max != null) return `${formatNumber(th.min)}–${formatNumber(th.max)}`;
  if (th.max != null) return trf("ngưỡng {0}", [formatNumber(th.max)]);
  if (th.min != null) return trf("tối thiểu {0}", [formatNumber(th.min)]);
  return "";
};

const SEVERITY: Record<MetricStatus, number> = { stale: 0, ok: 1, warning: 2, critical: 3 };

export const worstStatus = (list: MetricStatus[]) =>
  list.reduce<MetricStatus>((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), "ok");

export const sortEntities = (list: TwinEntity[]) =>
  [...list].sort(
    (a, b) =>
      Number(b.status === "critical") - Number(a.status === "critical") ||
      a.id.localeCompare(b.id, "vi", { numeric: true }),
  );

export const filterEntities = (list: TwinEntity[], category: CategoryFilter, query: string) => {
  const q = fold(query.trim());
  return list.filter(
    (e) =>
      (category === "all" || e.category === category) &&
      (!q || fold(`${e.id} ${e.name} ${e.site} ${e.province} ${e.type} ${e.urn} ${e.subtitle}`).includes(q)),
  );
};

export const countByCategory = (list: TwinEntity[]) => {
  const counts: Record<CategoryFilter, number> = { all: list.length, smt: 0, cleanroom: 0, medical: 0 };
  for (const e of list) counts[e.category as EntityCategory] += 1;
  return counts;
};

const ENTITY_RANK: Record<EntityStatus, number> = { critical: 3, warning: 2, offline: 1, ok: 0 };

export const pickFromParams = (list: TwinEntity[], entityId: string | null, siteId: string | null) => {
  const byId = entityId ? list.find((e) => e.id.toLowerCase() === entityId.toLowerCase()) : undefined;
  const atSite = siteId ? sortEntities(list.filter((e) => e.siteId === siteId)) : [];
  const hit = byId ?? [...atSite].sort((a, b) => ENTITY_RANK[b.status] - ENTITY_RANK[a.status])[0];
  return hit ? { category: hit.category, id: hit.id } : undefined;
};
