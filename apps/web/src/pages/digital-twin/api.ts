import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";
import { useLiveTopics } from "../../live/useLive";
import type { EntityCategory, EntityStatus, Incident, Metric, MetricStatus, SeriesPoint, TwinEntity } from "./types";
import { ENTITY_STATUS, formatDuration, formatNumber, thresholdText, worstStatus } from "./utils";
import { tr, trf } from "../../i18n";

const REFRESH_MS = 60_000;
const MINUTE = 60_000;
const RECENT_MINUTES = 60;

const ENTITIES = `query TwinEntities {
  iot_entity(order_by: {code: asc}) {
    id code urn type name site_code connection_state last_seen_at live_source state
    site { name province }
    type_model { kind category grade attributes }
    incidents(order_by: {started_at: desc}, limit: 20) {
      id code attribute side threshold started_at ended_at minutes peak severity status acknowledged_at ack_note
      acknowledged_by_person { full_name }
    }
  }
}`;

const SERIES = `query TwinSeries($e: uuid!, $a: String!, $since: timestamptz!) {
  iot_measurement(where: {entity_id: {_eq: $e}, attribute: {_eq: $a}, observed_at: {_gte: $since}},
                  order_by: {observed_at: asc}) { observed_at value }
}`;

type Attr = {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  min: number | null;
  max: number | null;
  limit_label: string | null;
};
type IncidentRow = {
  id: string;
  code: string;
  attribute: string;
  side: "above" | "below";
  threshold: number;
  started_at: string;
  ended_at: string | null;
  minutes: number;
  peak: number;
  severity: "critical" | "warning";
  status: "open" | "closed";
  acknowledged_at: string | null;
  ack_note: string | null;
  acknowledged_by_person: { full_name: string } | null;
};
type EntityRow = {
  id: string;
  code: string;
  urn: string;
  type: string;
  name: string;
  site_code: string;
  connection_state: "online" | "offline";
  last_seen_at: string | null;
  live_source: "mqtt" | "api" | null;
  state: Record<string, { value: number; observed_at: string }>;
  site: { name: string; province: string | null } | null;
  type_model: { kind: string; category: EntityCategory; grade: string; attributes: Attr[] };
  incidents: IncidentRow[];
};

const toIncident = (r: IncidentRow): Incident => ({
  id: r.id,
  code: r.code,
  attribute: r.attribute,
  side: r.side,
  threshold: r.threshold,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  minutes: r.minutes,
  peak: r.peak,
  severity: r.severity,
  open: r.status === "open",
  acknowledgedAt: r.acknowledged_at,
  acknowledgedBy: r.acknowledged_by_person?.full_name ?? null,
  ackNote: r.ack_note,
});

const pressing = (i: Incident, now: number) =>
  i.severity === "critical" &&
  !i.acknowledgedAt &&
  (i.open || (i.endedAt != null && now - Date.parse(i.endedAt) <= RECENT_MINUTES * MINUTE));

export const toEntity = (r: EntityRow, now: number): TwinEntity => {
  const incidents = r.incidents.map(toIncident);
  const offlineMinutes =
    r.connection_state === "offline" && r.last_seen_at
      ? Math.max(1, Math.round((now - Date.parse(r.last_seen_at)) / MINUTE))
      : undefined;
  const metrics: Metric[] = r.type_model.attributes.map((a) => {
    const threshold = { ...(a.min != null ? { min: a.min } : {}), ...(a.max != null ? { max: a.max } : {}) };
    const latest = r.state[a.key];
    const value = latest?.value ?? NaN;
    const incident = incidents.find((i) => i.attribute === a.key && pressing(i, now));
    let status: MetricStatus = "ok";
    let note = trf("Bình thường · {0}", [thresholdText(threshold)]);
    if (offlineMinutes) {
      status = "stale";
      note = trf("Giá trị cuối · {0} phút trước", [offlineMinutes]);
    } else if (incident) {
      status = "critical";
      note = trf("{0} {1} · ngưỡng {2}", [
        incident.side === "below" ? tr("Dưới") : tr("Vượt"),
        formatDuration(incident.minutes),
        formatNumber(incident.threshold),
      ]);
    } else if (threshold.max != null && value > threshold.max) {
      status = "warning";
      note = trf("Cao · tối đa {0}", [formatNumber(threshold.max)]);
    } else if (threshold.min != null && value < threshold.min) {
      status = "warning";
      note = trf("Thấp · tối thiểu {0}", [formatNumber(threshold.min)]);
    }
    return {
      key: a.key,
      label: a.label,
      unit: a.unit === "hạt/m³" ? "/m³" : a.unit,
      unitLong: a.unit,
      decimals: a.decimals,
      threshold,
      limitLabel: a.limit_label ?? undefined,
      value,
      observedAt: latest?.observed_at ?? null,
      status,
      note,
      incident,
    };
  });
  const worst = offlineMinutes ? "offline" : worstStatus(metrics.map((m) => m.status));
  const status: EntityStatus = worst === "stale" ? "offline" : worst;
  const province = r.site?.province ?? "";
  return {
    id: r.code,
    uuid: r.id,
    category: r.type_model.category,
    type: r.type,
    urn: r.urn,
    kind: r.type_model.kind,
    name: r.name,
    site: r.site?.name ?? r.site_code,
    siteId: r.site_code,
    province,
    grade: r.type_model.grade,
    offlineMinutes,
    lastSeenAt: r.last_seen_at,
    liveSource: r.live_source,
    status,
    subtitle: offlineMinutes
      ? trf("Mất tín hiệu {0} phút", [offlineMinutes])
      : `${ENTITY_STATUS[status].label} · ${province}`,
    metrics,
    incidents,
  };
};

export const useTwinEntities = () => {
  const [state, setState] = useState<{ entities: TwinEntity[]; loading: boolean; error?: string; at: number }>({
    entities: [],
    loading: true,
    at: Date.now(),
  });
  const load = useCallback(async () => {
    try {
      const r = await request<{ iot_entity: EntityRow[] }>(ENTITIES);
      const now = Date.now();
      setState({ entities: r.iot_entity.map((e) => toEntity(e, now)), loading: false, at: now });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);
  const live = useLiveTopics(["iot"], load);
  return { ...state, reload: load, live };
};

export const useSeries = (entityUuid: string | undefined, attribute: string | undefined, minutes: number) => {
  const [state, setState] = useState<{ key: string; points: SeriesPoint[]; loading: boolean }>({
    key: "",
    points: [],
    loading: true,
  });
  const key = `${entityUuid}|${attribute}|${minutes}`;
  useEffect(() => {
    if (!entityUuid || !attribute) return;
    let live = true;
    const since = new Date(Date.now() - minutes * MINUTE).toISOString();
    request<{ iot_measurement: { observed_at: string; value: number }[] }>(SERIES, {
      e: entityUuid,
      a: attribute,
      since,
    })
      .then((r) => {
        if (!live) return;
        setState({
          key,
          points: r.iot_measurement.map((m) => ({ t: Date.parse(m.observed_at), v: m.value })),
          loading: false,
        });
      })
      .catch(() => live && setState({ key, points: [], loading: false }));
    return () => {
      live = false;
    };
  }, [entityUuid, attribute, minutes, key]);
  return state.key === key ? state : { key, points: [], loading: true };
};

export const acknowledgeIncident = (id: string, note: string) =>
  request(`mutation Ack($id: uuid!, $note: String!) { iot_acknowledge(id: $id, note: $note) { id acknowledged_at } }`, {
    id,
    note,
  });
