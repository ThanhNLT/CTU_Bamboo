/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

export type CompanyKey = string;

export type Company = { key: CompanyKey; name: string; short: string; color: string };

export type Freshness = { tier: "Nóng" | "Ấm" | "Lạnh"; at: string };

export type Kpi = {
  key: string;
  label: string;
  value: string;
  delta?: { dir: "up" | "down" | "dot" | "none"; tone: "good" | "bad" | "neutral"; text: string };
  freshness: Freshness;
  definition: string;
};

export type DashTab = "overview" | "process" | "production" | "hospital" | "quality";

export type Period = "week" | "month" | "quarter";

export type OverdueRow = {
  code: string;
  to: string;
  company: CompanyKey;
  type: string;
  step: string;
  overdueMinutes: number;
  overdueLabel: string;
};

export type DailyPoint = { day: string } & Record<CompanyKey, number | string>;

export type PendingRow = { company: CompanyKey; l1: number; l2: number };

export type MonthlyPoint = { month: string; current: number | null; previous: number };
