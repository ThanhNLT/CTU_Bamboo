// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
export type IssueLevel = "error" | "warning";
/** Lỗi / cảnh báo do máy chủ kiểm tra bản BPMN (ADR #47). */
export type Issue = { level: IssueLevel; message: string; elementId: string | null };

export type FormField = { label: string; type: string; required: boolean };
/** Biểu mẫu của tác vụ người dùng; tác vụ gắn bằng thuộc tính flowable:formKey = key. */
export type FormDef = { key: string; name: string; fields: FormField[] };

export type ProcessSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
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
  startedBy?: string | null;
  startedAt?: string | null;
};

export type ProcessVersion = {
  version: number;
  sha256: string;
  note: string | null;
  publishedBy: string;
  publishedAt: string;
};

export type ProcessDetail = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  xml: string;
  forms: FormDef[];
  issues: Issue[];
  versions: ProcessVersion[];
  runs: SandboxRun[];
};

/** Phần tử đang chọn trên sơ đồ, đọc từ businessObject của bpmn-js. */
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
};
