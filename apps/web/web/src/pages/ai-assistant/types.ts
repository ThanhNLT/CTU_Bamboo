// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type QuestionStatus = "queued" | "running" | "done" | "refused" | "error";

export type Citation = {
  n: number;
  kb_document_id: string;
  doc_no: string;
  title: string;
  attachment_id: string | null;
  file_name: string | null;
  heading: string | null;
};

export type Question = {
  id: string;
  question: string;
  status: QuestionStatus;
  answer: string;
  thinking?: string | null;
  citations: Citation[];
  guard: "scope" | "prompt" | null;
  error: string | null;
  gpu_wait_since?: string | null;
  model: string;
  kb_document_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  position?: number;
};

export type Assistant = { id: string; name: string; model: string; ready: boolean };

export type HistoryGroup = "today" | "yesterday" | "lastWeek" | "older";
