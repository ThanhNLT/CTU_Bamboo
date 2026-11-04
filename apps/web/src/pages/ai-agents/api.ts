// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request } from "../../api/client";
import type { Agent, AgentInput, AgentStats, AiModel, LoadedModel } from "./types";

const AGENT = "id name model status guardrail_config tool_list";

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
