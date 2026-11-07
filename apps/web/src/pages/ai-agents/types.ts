// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

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

/** Tự hành động khi có sự kiện (ADR #72) */
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

/** Mô hình đang nạp trong Ollama: tổng dung lượng bộ nhớ và phần nằm trên VRAM (byte). */
export type LoadedModel = { name: string; size: number; size_vram: number };

export type AgentInput = {
  name: string;
  model: string;
  status: AgentStatus;
  tool_list: string[];
  guardrail_config: Record<GuardKey, boolean>;
};
