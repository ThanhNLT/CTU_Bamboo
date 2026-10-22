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
};

export type AiModel = { name: string; size_bytes: number | null; family: string | null };

export type AgentInput = {
  name: string;
  model: string;
  status: AgentStatus;
  tool_list: string[];
  guardrail_config: Record<GuardKey, boolean>;
};
