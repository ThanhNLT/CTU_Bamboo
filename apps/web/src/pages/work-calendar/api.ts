/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import type { Dayjs } from "dayjs";

import { request } from "../../api/client";
import type { CalEvent, Kind, Recurrence, Response, View } from "./model";

export const fetchEvents = async (from: Dayjs, to: Dayjs, view: View, unit?: string) => {
  const { calendar_events } = await request<{ calendar_events: { events: CalEvent[] } }>(
    `query($f: String!, $t: String!, $v: String, $u: uuid) {
       calendar_events(from: $f, to: $t, view: $v, unit_id: $u) { events } }`,
    { f: from.format(), t: to.format(), v: view, u: view === "unit" ? unit : null },
  );
  return calendar_events.events;
};

export type EventInput = {
  id?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  kind: Kind;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  recurrence: Recurrence;
  recur_until?: string | null;
  scope: "PERSONAL" | "UNIT";
  org_unit_id?: string | null;
  reminder_minutes?: number | null;
  attendee_ids: string[];
};

export type Conflict = { person_id: string; name: string; event_id: string; title: string; starts_at: string };

export const saveEvent = async (event: EventInput) => {
  const { calendar_save } = await request<{
    calendar_save: { id: string; created: boolean; invited: number; conflicts: Conflict[] };
  }>(`mutation($e: jsonb!) { calendar_save(event: $e) { id created invited conflicts } }`, { e: event });
  return calendar_save;
};

export const cancelEvent = async (id: string) => {
  await request(`mutation($id: uuid!) { calendar_cancel(id: $id) { cancelled } }`, { id });
};

export const respond = async (id: string, response: Exclude<Response, "PENDING">) => {
  await request(`mutation($id: uuid!, $r: String!) { calendar_respond(id: $id, response: $r) { response } }`, {
    id,
    r: response,
  });
};

export type Unit = { id: string; name: string; path: string };

export const fetchUnits = async () => {
  const { core_org_unit } = await request<{ core_org_unit: Unit[] }>(
    `query { core_org_unit(order_by: {path: asc}) { id name path } }`,
  );
  return core_org_unit;
};
