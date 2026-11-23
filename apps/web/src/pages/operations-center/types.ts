/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

export type CompanyKey = string;

export type Company = { key: CompanyKey; name: string; short: string; color: string };

export type Freshness = { tier: "hot" | "warm" | "cold"; at: string };

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
