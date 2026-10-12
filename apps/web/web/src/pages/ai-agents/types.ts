// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type AgentStatus = "active" | "paused" | "pending";

export type GuardKey = "scope-guard" | "pii-guard" | "prompt-guard";

export type DayStat = { day: string; success: number; errors: number };

export type ToolStat = { name: string; calls: number; errors: number; p95: number; scope: string };

export type GuardEvent = {
  id: string;
  title: string;
  at: string;
  /** Người dùng (đã rút gọn) hoặc tên rào chắn phát hiện. */
  source: string;
  guard: GuardKey;
  action: "blocked" | "masked";
};

export type SessionRow = {
  id: string;
  at: string;
  user: string;
  question: string;
  tools: string[];
  seconds: number;
  ok: boolean;
  rating?: "up" | "down";
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
  status: AgentStatus;
  /** Phiên trong 24 giờ. */
  sessions24h: number;
  /** Lượt gọi công cụ / lỗi trong 24 giờ: "Lỗi" = errors / calls. */
  calls24h: number;
  errors24h: number;
  p95: number;
  ratingsUp: number;
  ratingsTotal: number;
  week: DayStat[];
  toolStats: ToolStat[];
  events: GuardEvent[];
  sessions: SessionRow[];
  guards: Record<GuardKey, boolean>;
  config: { temperature: number; maxTokens: number; scopes: string[]; retentionDays: number; systemPrompt: string };
};

export type AnalyticsTab = "overview" | "sessions" | "tools" | "guards" | "config";
