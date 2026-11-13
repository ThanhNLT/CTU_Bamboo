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

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "DONE" | "CANCELLED";
export type Role = "MANAGER" | "MEMBER" | "VIEWER";
export type Health = "GREEN" | "AMBER" | "RED";

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  progress: number | null;
  planned: number | null;
  late_tasks: number | null;
  can_manage: boolean;
  manager: { full_name: string };
  org_unit: { name: string };
};

export type Project = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  org_unit_id: string;
  org_unit_name: string;
  manager_id: string;
  manager_name: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  budget: number | null;
  objective: string | null;
  scope: string | null;
  deliverables: string | null;
  approach: string | null;
  risks: string | null;
  stakeholders: string | null;
  conversation_id: string | null;
  baseline_at: string | null;
  updated_at: string;
};

export type Task = {
  id: string;
  parent_id: string | null;
  seq: number;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  milestone: boolean;
  progress: number;
  assignee_id: string | null;
  assignee_name: string | null;
  baseline_start: string | null;
  baseline_end: string | null;
  wbs: string;
  level: number;
  has_children: boolean;
  slack_days: number;
  critical: boolean;
  late: boolean;
  slip_days: number | null;
};

export type Dependency = { predecessor_id: string; successor_id: string; lag_days: number };

export type Member = { person_id: string; full_name: string; role: Role };

export type Stats = {
  actual_pct: number;
  planned_pct: number;
  spi: number | null;
  late_tasks: number;
  total_tasks: number;
  done_tasks: number;
  suggested_health: Health;
  today: string;
};

export type Report = {
  id: string;
  period_from: string;
  period_to: string;
  health: Health;
  summary: string;
  accomplishments: string | null;
  next_steps: string | null;
  issues: string | null;
  planned_pct: number;
  actual_pct: number;
  spi: number | null;
  late_tasks: number;
  created_at: string;
  created_by_name: string;
};

export type Detail = {
  project: Project;
  members: Member[];
  tasks: Task[];
  dependencies: Dependency[];
  stats: Stats;
  reports: Report[];
  can_manage: boolean;
  my_role: Role | null;
  warnings: string[];
};
