// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import { KPI_STATIC } from "./mock";
import type { Agent, AgentStatus } from "./types";

// ===== Hàm tiện ích =====
export const pct = (n: number, decimals = 1) =>
  `${(n * 100).toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;

export const num = (n: number, decimals = 0) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const errorRate = (a: Pick<Agent, "calls24h" | "errors24h">) => (a.calls24h ? a.errors24h / a.calls24h : 0);

// ===== Hằng số =====
export const STATUS: Record<AgentStatus, { label: string; dot: string; badge?: string }> = {
  active: { label: "Hoạt động", dot: "bg-bamboo-500" },
  paused: { label: "Tạm dừng", dot: "bg-yellow-500", badge: "bg-yellow-50 text-amber-800" },
  pending: { label: "Chờ duyệt", dot: "bg-gray-400", badge: "bg-canvas text-body" },
};

// ===== Hàm tiện ích =====
/** Thẻ KPI tính từ danh sách tác tử (trừ p95 toàn hệ thống — không cộng được từ p95 từng tác tử). */
export const computeKpis = (agents: Agent[]) => {
  const active = agents.filter((a) => a.status === "active").length;
  const paused = agents.filter((a) => a.status === "paused").length;
  const sessions = agents.reduce((s, a) => s + a.sessions24h, 0);
  const calls = agents.reduce((s, a) => s + a.calls24h, 0);
  const errors = agents.reduce((s, a) => s + a.errors24h, 0);
  const up = agents.reduce((s, a) => s + a.ratingsUp, 0);
  const total = agents.reduce((s, a) => s + a.ratingsTotal, 0);
  return {
    active,
    paused,
    sessions,
    errorRate: calls ? errors / calls : 0,
    errorThreshold: KPI_STATIC.errorThreshold / 100,
    p95: KPI_STATIC.p95,
    p95Target: KPI_STATIC.p95Target,
    helpful: total ? up / total : 0,
    ratings: total,
  };
};

/** Tỉ lệ dùng từng công cụ trong 24 giờ, giảm dần. */
export const toolShares = (a: Agent) => {
  const total = a.toolStats.reduce((s, t) => s + t.calls, 0) || 1;
  return [...a.toolStats].sort((x, y) => y.calls - x.calls).map((t) => ({ ...t, share: t.calls / total }));
};

export const weekTotals = (a: Agent) => ({
  total: a.week.reduce((s, d) => s + d.success + d.errors, 0),
  errors: a.week.reduce((s, d) => s + d.errors, 0),
});
