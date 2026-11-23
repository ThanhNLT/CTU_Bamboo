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

import { request } from "../../api/client";
import type { ApiKey, Catalog, CreatedKey, KeyInput } from "./types";

export const fetchCatalog = async () => {
  const { api_catalog } = await request<{ api_catalog: Catalog }>(`query { api_catalog { scopes endpoints } }`);
  return api_catalog;
};

export const fetchIsAdmin = async () => {
  const { core_v_admin } = await request<{ core_v_admin: { person_id: string }[] }>(
    `query { core_v_admin(limit: 1) { person_id } }`,
  );
  return core_v_admin.length > 0;
};

export const fetchKeys = async () => {
  const since = dayjs().subtract(29, "day").format("YYYY-MM-DD");
  const { api_api_key } = await request<{ api_api_key: ApiKey[] }>(
    `query($since: date!) { api_api_key(order_by: {created_at: desc}) {
      id name prefix scopes allowed_ips created_at expires_at revoked_at last_used_at last_ip
      created_by_person { full_name }
      usages(where: {day: {_gte: $since}}, order_by: {day: asc}) { day calls errors } } }`,
    { since },
  );
  return api_api_key;
};

export const createKey = async (input: KeyInput) => {
  const { api_key_create } = await request<{ api_key_create: CreatedKey }>(
    `mutation($name: String!, $scopes: [String!]!, $days: Int!, $ips: [String!]) {
      api_key_create(name: $name, scopes: $scopes, expires_days: $days, allowed_ips: $ips) { id key prefix expires_at } }`,
    { name: input.name, scopes: input.scopes, days: input.expires_days, ips: input.allowed_ips },
  );
  return api_key_create;
};

export const revokeKey = async (id: string) => {
  await request(`mutation($id: uuid!) { api_key_revoke(id: $id) { id revoked } }`, { id });
};

export type KeyStatus = "active" | "expired" | "revoked";

export const statusOf = (k: ApiKey, now = Date.now()): KeyStatus =>
  k.revoked_at ? "revoked" : new Date(k.expires_at).getTime() <= now ? "expired" : "active";

export const baseUrl = () => `${window.location.origin}/api/v1`;

export const curlOf = (e: {
  method: string;
  path: string;
  params: { name: string; type: string }[];
  body: boolean;
}) => {
  const origin = window.location.origin;
  const path = e.path.replace(/{(\w+)}/g, (_, n: string) =>
    n === "tab" ? "process" : n === "kpi_key" ? "on-time" : `<${n}>`,
  );
  const lines = [
    `curl -s${e.method === "POST" ? " -X POST" : ""} "${origin}${path}" \\`,
    `  -H "Authorization: Bearer $BAMBOO_API_KEY"`,
  ];
  if (e.body) {
    lines[1] += " \\";
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '{"metrics": ["request_count"], "dimensions": ["status"], "time_grain": "month"}'`);
  }
  return lines.join("\n");
};

export type MqttAccount = {
  username: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
  created_by_person: { full_name: string } | null;
};
export type CreatedMqttAccount = { username: string; password: string; topic: string; message: string };

export const fetchMqttAccounts = async () => {
  const { iot_mqtt_account } = await request<{ iot_mqtt_account: MqttAccount[] }>(
    `query { iot_mqtt_account(order_by: {created_at: desc}) {
      username label created_at revoked_at created_by_person { full_name } } }`,
  );
  return iot_mqtt_account;
};

export const createMqttAccount = async (label: string) => {
  const { iot_mqtt_account_create } = await request<{ iot_mqtt_account_create: CreatedMqttAccount }>(
    `mutation($l: String!) { iot_mqtt_account_create(label: $l) { username password topic message } }`,
    { l: label },
  );
  return iot_mqtt_account_create;
};

export const revokeMqttAccount = (username: string) =>
  request(`mutation($u: String!) { iot_mqtt_account_revoke(username: $u) { revoked } }`, { u: username });
