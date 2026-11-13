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

import { request } from "../../api/client";
import { tr } from "../../i18n";
import type { Detail, Health, ProjectRow, ProjectStatus, Role } from "./types";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: tr("Đang lập kế hoạch"),
  ACTIVE: tr("Đang thực hiện"),
  ON_HOLD: tr("Tạm dừng"),
  DONE: tr("Hoàn thành"),
  CANCELLED: tr("Đã hủy"),
};

export const ROLE_LABEL: Record<Role, string> = {
  MANAGER: tr("Quản lý dự án"),
  MEMBER: tr("Thành viên"),
  VIEWER: tr("Theo dõi"),
};

export const HEALTH_LABEL: Record<Health, string> = {
  GREEN: tr("Đúng tiến độ"),
  AMBER: tr("Có nguy cơ chậm"),
  RED: tr("Chậm tiến độ"),
};

export const HEALTH_STYLE: Record<Health, string> = {
  GREEN: "bg-bamboo-50 text-bamboo-800",
  AMBER: "bg-amber-50 text-amber-800",
  RED: "bg-red-50 text-red-700",
};

type ProjectStats = { actual_pct: number | null; planned_pct: number | null; late_tasks: number | null };

export const fetchProjects = async (): Promise<ProjectRow[]> => {
  const { pm_project } = await request<{
    pm_project: (Omit<ProjectRow, "progress" | "planned" | "late_tasks"> & { stats: ProjectStats | null })[];
  }>(
    `query { pm_project(order_by: [{status: asc}, {end_date: asc}]) {
       id code name status start_date end_date stats can_manage
       manager { full_name } org_unit { name } } }`,
  );
  return pm_project.map(({ stats, ...p }) => ({
    ...p,
    progress: stats?.actual_pct ?? null,
    planned: stats?.planned_pct ?? null,
    late_tasks: stats?.late_tasks ?? null,
  }));
};

export const fetchDetail = async (id: string) => {
  const { pm_project_detail } = await request<{ pm_project_detail: Detail }>(
    `query($id: uuid!) { pm_project_detail(id: $id) {
       project members tasks dependencies stats reports can_manage my_role warnings } }`,
    { id },
  );
  return pm_project_detail;
};

export type ProjectInput = {
  id?: string;
  code: string;
  name: string;
  org_unit_id: string;
  manager_id?: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  budget?: number | null;
  objective?: string | null;
  scope?: string | null;
  deliverables?: string | null;
  approach?: string | null;
  risks?: string | null;
  stakeholders?: string | null;
};

export const saveProject = async (project: ProjectInput) => {
  const { pm_project_save } = await request<{ pm_project_save: { id: string } }>(
    `mutation($p: jsonb!) { pm_project_save(project: $p) { id created } }`,
    { p: project },
  );
  return pm_project_save.id;
};

export const setMembers = async (project: string, members: { person_id: string; role: Role }[]) => {
  await request(`mutation($p: uuid!, $m: jsonb!) { pm_members_set(project_id: $p, members: $m) { members } }`, {
    p: project,
    m: members,
  });
};

export type TaskInput = {
  id?: string;
  project_id?: string;
  parent_id?: string | null;
  name?: string;
  description?: string | null;
  start_date?: string;
  end_date?: string;
  milestone?: boolean;
  progress?: number;
  assignee_id?: string | null;
  predecessors?: { id: string; lag_days: number }[];
};

export const saveTask = async (task: TaskInput) => {
  const { pm_task_save } = await request<{ pm_task_save: { id: string; shifted: number } }>(
    `mutation($t: jsonb!) { pm_task_save(task: $t) { id shifted } }`,
    { t: task },
  );
  return pm_task_save;
};

export const deleteTask = async (id: string) => {
  await request(`mutation($id: uuid!) { pm_task_delete(id: $id) { deleted } }`, { id });
};

export const reorderTask = async (id: string, direction: "up" | "down" | "indent" | "outdent") => {
  await request(`mutation($id: uuid!, $d: String!) { pm_task_reorder(id: $id, direction: $d) { id } }`, {
    id,
    d: direction,
  });
};

export const setBaseline = async (project: string) => {
  await request(`mutation($p: uuid!) { pm_baseline_set(project_id: $p) { tasks } }`, { p: project });
};

export type ReportInput = {
  project_id: string;
  period_from: string;
  period_to: string;
  health?: Health;
  summary: string;
  accomplishments?: string | null;
  next_steps?: string | null;
  issues?: string | null;
};

export const createReport = async (report: ReportInput) => {
  await request(`mutation($r: jsonb!) { pm_report_create(report: $r) { id } }`, { r: report });
};

export const planPdf = async (project: string) => {
  const { pm_plan_pdf } = await request<{ pm_plan_pdf: { url: string } }>(
    `query($p: uuid!) { pm_plan_pdf(project_id: $p) { url } }`,
    { p: project },
  );
  return pm_plan_pdf.url;
};

export const reportPdf = async (report: string) => {
  const { pm_report_pdf } = await request<{ pm_report_pdf: { url: string } }>(
    `query($r: uuid!) { pm_report_pdf(report_id: $r) { url } }`,
    { r: report },
  );
  return pm_report_pdf.url;
};
