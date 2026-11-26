/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import { request } from "../../api/client";

export type Channel = "EMAIL" | "SMS" | "WEBHOOK";
export type ChannelPref = {
  channel: Channel;
  configured: boolean;
  enabled: boolean;
  address: string;
  kinds: string[] | null;
};
export type Kind = { code: string; label: string };
export type Delivery = {
  id: string;
  channel: Channel;
  status: string;
  attempts: number;
  last_error: string | null;
  title: string | null;
  address: string | null;
  created_at: string | null;
  delivered_at: string | null;
};
export type QueueMessage = Delivery & { topic: string; max_attempts: number; alg: string | null };
export type QueueCount = { topic: string; status: string; n: number };

export const loadPrefs = async () =>
  (
    await request<{ notification_prefs: { channels: ChannelPref[]; kinds: Kind[] } }>(
      `query { notification_prefs { channels kinds } }`,
    )
  ).notification_prefs;

export const savePref = async (p: { channel: Channel; address: string; enabled: boolean; kinds: string[] | null }) => {
  await request(
    `mutation Save($c: String!, $a: String!, $e: Boolean, $k: [String!]) {
      save_notification_pref(channel: $c, address: $a, enabled: $e, kinds: $k) { channel } }`,
    { c: p.channel, a: p.address, e: p.enabled, k: p.kinds },
  );
};

export const deletePref = async (channel: Channel) => {
  await request(`mutation Del($c: String!) { delete_notification_pref(channel: $c) { channel } }`, { c: channel });
};

export const sendTest = async (channel: Channel) => {
  await request(`mutation Test($c: String!) { send_test_notification(channel: $c) { id status } }`, { c: channel });
};

export const myDeliveries = async () =>
  (
    await request<{ my_deliveries: Delivery[] }>(
      `query { my_deliveries { id channel status attempts last_error title address created_at delivered_at } }`,
    )
  ).my_deliveries;

export const queueOverview = async () =>
  (
    await request<{ queue_overview: { counts: QueueCount[]; messages: QueueMessage[] } }>(
      `query { queue_overview { counts messages } }`,
    )
  ).queue_overview;

export const retryMessage = async (id: string) => {
  await request(`mutation Retry($id: uuid!) { queue_retry(id: $id) { id status } }`, { id });
};

export const verifyMessage = async (id: string) =>
  (
    await request<{
      queue_verify: { valid: boolean; reason: string | null; alg: string | null; delivered_at: string | null };
    }>(`query Verify($id: uuid!) { queue_verify(id: $id) { valid reason alg delivered_at } }`, { id })
  ).queue_verify;
