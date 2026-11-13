/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

export type SlaLevel = "overdue" | "urgent" | "ok";

export type InboxScope = "mine" | "team";

export type Attachment = {
  id: string;
  name: string;
  kind: "pdf" | "image" | "file";
  pages: number;
  sha256: string | null;
  scan: "clean" | "blocked" | "pending";
};

export type TaskInfo = {
  submitter: string;
  unit: string;
  device?: { label: string; to: string };
  phone?: string;
  dataTier?: string;
  amount?: string;
};

export type AiSuggestion = {
  bullets: string[];
  citation?: { label: string; to: string };
};

export type DocPreview = { org: string; heading: string; subline: string };

export type InboxTask = {
  id: string;
  taskId: string;
  code: string;
  title: string;
  level: number;
  assignee: string;
  actionable: boolean;
  viaDelegation: boolean;
  to: string;
  dueAt: string;
  sla: { level: SlaLevel; label: string };
  attachments: Attachment[];
  info: TaskInfo;
  ai?: AiSuggestion;
  preview: DocPreview;
};

export type Decision = "approve" | "return" | "reject";
