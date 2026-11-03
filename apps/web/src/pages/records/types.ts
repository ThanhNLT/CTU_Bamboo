// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { DocKind, DocStep } from "../../api/documents";

export type RecordStatus = "draft" | "pending" | "returned" | "approved" | "closed";

export type StatusTab = "all" | "draft" | "reviewing" | "returned" | "approved" | "closed";

export type RecordType = DocKind;

export type TimeRange = "7d" | "30d" | "90d" | "all";

export type EofficeRecord = {
  id: string;
  code: string;
  title: string;
  type: RecordType;
  status: RecordStatus;
  statusLabel: string;
  submitter: string;
  submitterId?: string;
  unit: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
  steps: DocStep[];
  to: string;
};

export type StepState = "done" | "current" | "returned" | "pending";

export type WorkflowStep = { key: string; label: string; state: StepState; meta?: string };

export type RecordFilters = {
  tab: StatusTab;
  query: string;
  type: RecordType | "all";
  range: TimeRange;
  mineOnly: boolean;
};
