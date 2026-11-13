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

export type AgentStatus = "active" | "inactive";

export type GuardKey = "scope_guard" | "pii_guard" | "prompt_guard" | "think";

export type Agent = {
  id: string;
  name: string;
  model: string;
  status: AgentStatus;
  guardrail_config: Partial<Record<GuardKey, boolean>>;
  tool_list: string[];
  created_at: string;
  triggers: string[];
  instructions: string | null;
  allowed_actions: AgentAction[];
  autonomy: Autonomy;
  webhook_url: string | null;
};

export type AgentAction = "comment" | "notify" | "webhook";
export type Autonomy = "act" | "dry_run";
export type Option = { code: string; label: string };
export type TriggerOptions = { events: Option[]; actions: Option[]; autonomy: Option[] };

export type AutomationInput = {
  triggers: string[];
  instructions: string;
  allowed_actions: AgentAction[];
  autonomy: Autonomy;
  webhook_url?: string | null;
};

export type RunAction = {
  type: AgentAction;
  text?: string;
  to?: string;
  message?: string;
  ok: boolean | null;
  dry_run?: boolean;
  error?: string;
  recipients?: number;
};

export type AgentRun = {
  id: string;
  agent_id: string;
  event: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: { doc_no?: string; amount?: number } | null;
  status: "queued" | "running" | "done" | "error" | "skipped";
  assessment: string | null;
  risk: "low" | "medium" | "high" | null;
  plan: { rejected?: { action: string; reason: string }[]; sources?: string[] } | null;
  actions: RunAction[];
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type AgentStats = {
  agent_id: string;
  questions: number;
  answered: number;
  avg_seconds: number | null;
  p90_seconds: number | null;
  first_token_seconds: number | null;
  cold_starts: number;
  scope_refused: number;
  prompt_refused: number;
  errors: number;
  pending: number;
  prompt_tokens: number;
  completion_tokens: number;
  reused: number;
  retried: number;
  tokens_per_second: number | null;
  avg_context_tokens: number | null;
};

export type AiModel = { name: string; size_bytes: number | null; family: string | null };

export type LoadedModel = { name: string; size: number; size_vram: number };

export type AgentInput = {
  name: string;
  model: string;
  status: AgentStatus;
  tool_list: string[];
  guardrail_config: Record<GuardKey, boolean>;
};
