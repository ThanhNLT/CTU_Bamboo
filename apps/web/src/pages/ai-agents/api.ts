/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { request } from "../../api/client";
import type {
  Agent,
  AgentInput,
  AgentRun,
  AgentStats,
  AiModel,
  AutomationInput,
  LoadedModel,
  TriggerOptions,
} from "./types";

const AGENT =
  "id name model status guardrail_config tool_list triggers instructions allowed_actions autonomy webhook_url";

export const fetchAgents = async () => {
  const { core_ai_agent } = await request<{ core_ai_agent: Agent[] }>(
    `query { core_ai_agent(order_by: {created_at: asc}) { ${AGENT} created_at } }`,
  );
  return core_ai_agent;
};

export const fetchStats = async (days: number) => {
  const { ai_agent_stats } = await request<{ ai_agent_stats: AgentStats[] }>(
    `query($d: Int) { ai_agent_stats(days: $d) { agent_id questions answered avg_seconds p90_seconds first_token_seconds cold_starts scope_refused
      prompt_refused errors pending prompt_tokens completion_tokens reused retried tokens_per_second
      avg_context_tokens } }`,
    { d: days },
  );
  return ai_agent_stats;
};

export const fetchModels = async () => {
  const { ai_models } = await request<{
    ai_models: { ai_enabled: boolean; models: AiModel[]; loaded: LoadedModel[] };
  }>(`query { ai_models { ai_enabled models { name size_bytes family } loaded } }`);
  return ai_models;
};

export const registerAgent = (v: AgentInput) =>
  request(
    `mutation($n: String!, $m: String!, $s: String, $g: jsonb, $t: jsonb) {
      ai_agent_register(name: $n, model: $m, status: $s, guardrail_config: $g, tool_list: $t) { id } }`,
    { n: v.name, m: v.model, s: v.status, g: v.guardrail_config, t: v.tool_list },
  );

export const updateAgent = (id: string, v: Partial<AgentInput>) =>
  request(
    `mutation($id: uuid!, $n: String, $m: String, $s: String, $g: jsonb, $t: jsonb) {
      ai_agent_update(id: $id, name: $n, model: $m, status: $s, guardrail_config: $g, tool_list: $t) { id } }`,
    { id, n: v.name, m: v.model, s: v.status, g: v.guardrail_config, t: v.tool_list },
  );

export const removeAgent = async (id: string) => {
  const { ai_agent_unregister } = await request<{ ai_agent_unregister: { deleted: boolean; message: string } }>(
    `mutation($id: uuid!) { ai_agent_unregister(id: $id) { deleted message } }`,
    { id },
  );
  return ai_agent_unregister;
};

export const fetchTriggerOptions = async () => {
  const { ai_agent_trigger_options } = await request<{ ai_agent_trigger_options: TriggerOptions }>(
    `query { ai_agent_trigger_options { events actions autonomy } }`,
  );
  return ai_agent_trigger_options;
};

export const setAutomation = (id: string, v: AutomationInput) =>
  request(
    `mutation($id: uuid!, $t: jsonb!, $i: String, $a: jsonb!, $m: String, $w: String) {
      ai_agent_automation(id: $id, triggers: $t, instructions: $i, allowed_actions: $a, autonomy: $m, webhook_url: $w)
      { id } }`,
    { id, t: v.triggers, i: v.instructions, a: v.allowed_actions, m: v.autonomy, w: v.webhook_url || null },
  );

export const fetchRuns = async (limit = 30) => {
  const { core_ai_agent_run } = await request<{ core_ai_agent_run: AgentRun[] }>(
    `query($l: Int!) { core_ai_agent_run(order_by: {created_at: desc}, limit: $l) {
       id agent_id event entity_type entity_id payload status assessment risk plan actions error created_at finished_at } }`,
    { l: limit },
  );
  return core_ai_agent_run;
};
