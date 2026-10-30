// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type IssueLevel = "error" | "warning";
export type Issue = { level: IssueLevel; message: string; elementId: string | null };

export type FormField = { label: string; type: string; required: boolean };
export type FormDef = { key: string; name: string; fields: FormField[] };

export type Access = "design" | "review" | "view";
export type Audience = "UNIT" | "COMPANY" | "GROUP";
export type DesignUnit = { id: string; name: string; path: string };

export type ProcessSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  ownerUnit: string | null;
  audience: Audience | null;
  access: Access;
  updatedAt: string;
  publishedVersion: number | null;
  lastRunStatus: RunStatus | null;
  runs: number;
};

export type RunStatus = "COMPLETED" | "STOPPED" | "FAILED";
export type RunStep = {
  activity_id: string;
  name: string;
  type: string;
  started_at: string | null;
  ended_at: string | null;
  decision: string | null;
};
export type SandboxRun = {
  id: string;
  status: RunStatus;
  steps: RunStep[];
  variables?: Record<string, unknown> | null;
  error: string | null;
  version?: number | null;
  startedBy?: string | null;
  startedAt?: string | null;
};

export type ProcessVersion = {
  version: number;
  sha256: string;
  note: string | null;
  audience: Audience | null;
  publishedBy: string;
  publishedAt: string;
};

export type ChangeRequest = {
  id: string;
  version: number;
  message: string;
  status: "OPEN" | "RESOLVED" | "DECLINED";
  resolutionNote: string | null;
  requestedBy: string;
  requestedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

export type Regulation = {
  kind: "SOURCE" | "REGULATION";
  version: number | null;
  id: string;
  docNo: string;
  title: string;
  status: "DRAFT" | "PENDING" | "RETURNED" | "APPROVED" | "REJECTED" | "CANCELLED" | "RETIRED";
  publishedAt: string | null;
};

export type ProcessDetail = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  access: Access;
  ownerUnit: string | null;
  audience: Audience | null;
  viewingVersion: number | null;
  changeRequests: ChangeRequest[];
  automation: AutomationOverview | null;
  regulations: Regulation[];
  xml: string;
  forms: FormDef[];
  issues: Issue[];
  versions: ProcessVersion[];
  runs: SandboxRun[];
};

export type SelectedElement = {
  id: string;
  type: string;
  name: string;
  assignee?: string;
  candidateGroups?: string;
  dueDate?: string;
  formKey?: string;
  condition?: string;
  isDefaultFlow?: boolean;
  expression?: string;
  automationAction?: string;
  automationAudience?: string;
  automationMessage?: string;
  automationUrl?: string;
  automationMethod?: string;
  automationBody?: string;
  automationName?: string;
  automationValue?: string;
  timerCycle?: string;
};

export type AutomationRun = {
  id: string;
  trigger: "MANUAL" | "TIMER" | "WEBHOOK" | "EVENT";
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  notified: number;
  error: string | null;
  steps: RunStep[];
  variables: Record<string, unknown>;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
};

export type AutomationOverview = {
  id: string;
  status: "ACTIVE" | "STOPPED";
  version: number;
  activatedAt: string;
  activatedBy: string;
  actions: number;
  events: string[];
  webhook: boolean;
  eventCatalog: { code: string; label: string }[];
  runs: AutomationRun[];
};
