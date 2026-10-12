// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type CompanyKey = "phone" | "chip" | "appliance" | "hospital";

export type Company = { key: CompanyKey; name: string; short: string; color: string };

/** Độ tươi dữ liệu: nóng (gần thời gian thực) · ấm (theo lô) · lạnh. */
export type Freshness = { tier: "Nóng" | "Ấm" | "Lạnh"; at: string };

export type Kpi = {
  key: string;
  label: string;
  value: string;
  /** Chú thích dưới số: mũi tên/chấm + chữ. */
  delta?: { dir: "up" | "down" | "dot" | "none"; tone: "good" | "bad" | "neutral"; text: string };
  freshness: Freshness;
  definition: string;
};

export type DashTab = "overview" | "process" | "production" | "hospital" | "quality";

export type Period = "week" | "month" | "quarter";

export type SiteStatus = "ok" | "warning" | "critical";

export type Site = {
  id: string;
  company: CompanyKey;
  name: string;
  province: string;
  /** Vị trí trên bản đồ, % theo chiều ngang/dọc. */
  x: number;
  y: number;
  status: SiteStatus;
  alert?: string;
};

export type OverdueRow = {
  code: string;
  company: CompanyKey;
  type: string;
  step: string;
  overdueMinutes: number;
  overdueLabel: string;
};
