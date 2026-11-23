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

export type QuestionStatus = "queued" | "running" | "done" | "refused" | "error";

export type Citation = {
  n: number;
  kb_document_id: string;
  doc_no: string;
  title: string;
  attachment_id: string | null;
  file_name: string | null;
  heading: string | null;
  sections?: string[] | null;
};

export type Question = {
  id: string;
  question: string;
  status: QuestionStatus;
  answer: string;
  citations: Citation[];
  guard: "scope" | "prompt" | null;
  error: string | null;
  model: string;
  kb_document_id: string | null;
  reused_from?: string | null;
  created_at: string;
  started_at: string | null;
  first_token_at?: string | null;
  finished_at: string | null;
  position?: number;
};

export type Assistant = { id: string; name: string; model: string; ready: boolean };

export type HistoryGroup = "today" | "yesterday" | "lastWeek" | "older";
