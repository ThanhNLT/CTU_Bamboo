// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Agent, AgentStats, AgentStatus, GuardKey } from "./types";

export const STATS_DAYS = 7;

export const TOOLS: { key: string; label: string }[] = [
  { key: "search_docs", label: "search_docs · tìm trong Thư viện tri thức" },
  { key: "cite", label: "cite · trích dẫn nguồn" },
];

export const GUARD_INFO: Record<GuardKey, { label: string; description: string }> = {
  scope_guard: {
    label: "scope_guard",
    description: "Không tìm thấy tài liệu người hỏi được xem thì từ chối, không gọi mô hình",
  },
  pii_guard: { label: "pii_guard", description: "Che số điện thoại, CCCD, số tài khoản trong câu hỏi và câu trả lời" },
  prompt_guard: { label: "prompt_guard", description: "Chặn câu hỏi có dấu hiệu tiêm lệnh, bọc tài liệu làm dữ liệu" },
  think: { label: "think", description: "Cho mô hình suy nghĩ trước khi trả lời (chậm hơn nhiều)" },
};

export const GUARDS = Object.keys(GUARD_INFO) as GuardKey[];

export const guardOn = (a: Agent, g: GuardKey) => a.guardrail_config[g] ?? g !== "think";

export const num = (n: number, decimals = 0) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const seconds = (n: number | null) => (n == null ? "—" : `${num(n, 1)} giây`);

export const STATUS: Record<AgentStatus, { label: string; dot: string; badge?: string }> = {
  active: { label: "Hoạt động", dot: "bg-bamboo-500" },
  inactive: { label: "Ngừng", dot: "bg-gray-400", badge: "bg-canvas text-body" },
};

const EMPTY: Omit<AgentStats, "agent_id"> = {
  questions: 0,
  answered: 0,
  avg_seconds: null,
  p90_seconds: null,
  scope_refused: 0,
  prompt_refused: 0,
  errors: 0,
  pending: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
};

export const statsOf = (stats: AgentStats[], id: string): AgentStats =>
  stats.find((s) => s.agent_id === id) ?? { agent_id: id, ...EMPTY };

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
    refused: sum("scope_refused") + sum("prompt_refused"),
    prompt: sum("prompt_refused"),
    errors: sum("errors"),
  };
};
