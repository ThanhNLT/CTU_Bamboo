/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import type { Agent, AgentStats, AgentStatus, GuardKey } from "./types";
import { tr, trf } from "../../i18n";

export const STATS_DAYS = 7;

export const TOOLS: { key: string; label: string }[] = [
  { key: "search_docs", label: tr("search_docs · tìm trong Thư viện tri thức") },
  { key: "cite", label: tr("cite · trích dẫn nguồn") },
];

export const GUARD_INFO: Record<GuardKey, { label: string; description: string }> = {
  scope_guard: {
    label: "scope_guard",
    description: tr("Không tìm thấy tài liệu người hỏi được xem thì từ chối, không gọi mô hình"),
  },
  pii_guard: {
    label: "pii_guard",
    description: tr("Che số điện thoại, CCCD, số tài khoản trong câu hỏi và câu trả lời"),
  },
  prompt_guard: {
    label: "prompt_guard",
    description: tr("Chặn câu hỏi có dấu hiệu tiêm lệnh, bọc tài liệu làm dữ liệu"),
  },
  think: { label: "think", description: tr("Cho mô hình suy nghĩ trước khi trả lời (chậm hơn nhiều)") },
};

export const GUARDS = Object.keys(GUARD_INFO) as GuardKey[];

export const guardOn = (a: Agent, g: GuardKey) => a.guardrail_config[g] ?? g !== "think";

export const num = (n: number, decimals = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const seconds = (n: number | null) => (n == null ? "—" : trf("{0} giây", [num(n, 1)]));

export const STATUS: Record<AgentStatus, { label: string; dot: string; badge?: string }> = {
  active: { label: tr("Hoạt động"), dot: "bg-bamboo-500" },
  inactive: { label: tr("Ngừng"), dot: "bg-gray-400", badge: "bg-canvas text-body" },
};

const EMPTY: Omit<AgentStats, "agent_id"> = {
  questions: 0,
  answered: 0,
  avg_seconds: null,
  p90_seconds: null,
  first_token_seconds: null,
  cold_starts: 0,
  scope_refused: 0,
  prompt_refused: 0,
  errors: 0,
  pending: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  reused: 0,
  retried: 0,
  tokens_per_second: null,
  avg_context_tokens: null,
};

export const statsOf = (stats: AgentStats[], id: string): AgentStats =>
  stats.find((s) => s.agent_id === id) ?? { agent_id: id, ...EMPTY };

const weightedBy = (
  rows: AgentStats[],
  key: "tokens_per_second" | "avg_context_tokens",
  weight: "completion_tokens" | "answered",
) => {
  const has = rows.filter((r) => r[key] != null && r[weight] > 0);
  const total = has.reduce((s, r) => s + r[weight], 0);
  return total ? has.reduce((s, r) => s + (r[key] ?? 0) * r[weight], 0) / total : null;
};

export const totals = (agents: Agent[], stats: AgentStats[]) => {
  const rows = agents.map((a) => statsOf(stats, a.id));
  const sum = (k: keyof typeof EMPTY) => rows.reduce((s, r) => s + ((r[k] as number | null) ?? 0), 0);
  const answered = sum("answered");
  const weighted = rows.reduce((s, r) => s + (r.avg_seconds ?? 0) * r.answered, 0);
  return {
    active: agents.filter((a) => a.status === "active").length,
    inactive: agents.filter((a) => a.status === "inactive").length,
    questions: sum("questions"),
    answered,
    avg: answered ? weighted / answered : null,
    p90: rows.reduce<number | null>((m, r) => (r.p90_seconds == null ? m : Math.max(m ?? 0, r.p90_seconds)), null),
    firstToken: rows.reduce<number | null>(
      (m, r) => (r.first_token_seconds == null ? m : Math.max(m ?? 0, r.first_token_seconds)),
      null,
    ),
    coldStarts: sum("cold_starts"),
    refused: sum("scope_refused") + sum("prompt_refused"),
    prompt: sum("prompt_refused"),
    errors: sum("errors"),
    reused: sum("reused"),
    retried: sum("retried"),
    tokensPerSecond: weightedBy(rows, "tokens_per_second", "completion_tokens"),
    contextTokens: weightedBy(rows, "avg_context_tokens", "answered"),
  };
};

export const gigabytes = (bytes: number) => trf("{0} GB", [num(bytes / 1e9, 1)]);
