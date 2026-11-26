/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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
