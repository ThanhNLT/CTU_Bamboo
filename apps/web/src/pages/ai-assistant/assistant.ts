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

import { request, wsClient } from "../../api/client";
import type { Assistant, Citation, HistoryGroup, Question } from "./types";
import { tr, trf } from "../../i18n";
import { fold } from "../../utils/text";

const FIELDS = `id question status answer citations guard error model kb_document_id reused_from created_at
  started_at first_token_at finished_at`;

export const fetchAssistants = async () => {
  const { ai_assistants } = await request<{ ai_assistants: { ai_enabled: boolean; assistants: Assistant[] } }>(
    `query { ai_assistants { ai_enabled assistants { id name model ready } } }`,
  );
  return ai_assistants;
};

export const fetchHistory = async () => {
  const { core_ai_question } = await request<{ core_ai_question: Question[] }>(
    `query { core_ai_question(order_by: {created_at: desc}, limit: 100) { ${FIELDS} } }`,
  );
  return core_ai_question;
};

export const fetchDocument = async (id: string) => {
  const { collab_kb_document_by_pk } = await request<{
    collab_kb_document_by_pk: { id: string; doc_no: string; title: string } | null;
  }>(`query($id: uuid!) { collab_kb_document_by_pk(id: $id) { id doc_no title } }`, { id });
  return collab_kb_document_by_pk;
};

export const ask = async (agentId: string, question: string, kbDocumentId?: string) => {
  const { ai_ask } = await request<{ ai_ask: { id: string; status: Question["status"]; position: number } }>(
    `mutation($a: uuid!, $q: String!, $d: uuid) { ai_ask(agent_id: $a, question: $q, kb_document_id: $d) {
      id status position } }`,
    { a: agentId, q: question, d: kbDocumentId ?? null },
  );
  return ai_ask;
};

export const watchQuestion = (id: string, onData: (q: Question) => void, onError: (e: unknown) => void) =>
  wsClient.subscribe<{ core_ai_question_by_pk: Question | null }>(
    { query: `subscription($id: uuid!) { core_ai_question_by_pk(id: $id) { ${FIELDS} } }`, variables: { id } },
    {
      next: ({ data }) => {
        if (data?.core_ai_question_by_pk) onData(data.core_ai_question_by_pk);
      },
      error: onError,
      complete: () => {},
    },
  );

export const isPending = (q: Question) => q.status === "queued" || q.status === "running";

export type RichPart = { type: "text"; value: string } | { type: "bold"; value: string } | { type: "cite"; n: number };

export const parseRich = (text: string): RichPart[] =>
  text
    .split(/(\*\*[^*]+\*\*|\[\d+\])/g)
    .filter(Boolean)
    .map((s): RichPart => {
      if (s.startsWith("**") && s.endsWith("**")) return { type: "bold", value: s.slice(2, -2) };
      const cite = /^\[(\d+)\]$/.exec(s);
      return cite?.[1] ? { type: "cite", n: Number(cite[1]) } : { type: "text", value: s };
    });

export const citationLabel = (c: Citation) => {
  const sections = c.sections?.length ? c.sections : c.heading ? [c.heading] : [];
  const name = c.title ? (c.doc_no ? `${c.title} (${c.doc_no})` : c.title) : (c.doc_no ?? c.file_name ?? "");
  return [name, sections.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
};

export const shortTitle = (c: Citation, max = 36) => {
  const t = c.title || c.doc_no || c.file_name || "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export const namedBefore = (before: string, c: Citation) =>
  !!c.title && fold(before.slice(-160)).includes(fold(c.title));

export const citationLink = (c: Citation) => `/h/library?doc=${encodeURIComponent(c.kb_document_id)}`;

export const plainText = (q: Question) =>
  [
    q.answer.replace(/\*\*/g, "").replace(/\[(\d+)\]/g, (m, n: string, offset: number, all: string) => {
      const c = q.citations.find((x) => x.n === Number(n));
      return c && !namedBefore(all.slice(0, offset), c) ? `[${shortTitle(c, 60)}]` : m;
    }),
    ...(q.citations.length ? ["", tr("Nguồn:"), ...q.citations.map((c) => `[${c.n}] ${citationLabel(c)}`)] : []),
  ].join("\n");

export const refusalText = (q: Question) =>
  q.answer ||
  (q.guard === "prompt"
    ? tr("Câu hỏi bị chặn vì có dấu hiệu cố tình thay đổi chỉ dẫn của trợ lý.")
    : tr("Không tìm thấy nội dung liên quan trong Thư viện tri thức mà bạn được xem."));

export const elapsed = (q: Question) => {
  if (!q.started_at || !q.finished_at) return null;
  const s = (new Date(q.finished_at).getTime() - new Date(q.started_at).getTime()) / 1000;
  return trf("{0} giây", [s.toFixed(1).replace(".", ",")]);
};

export const titleFrom = (text: string) => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text);

export const groupOf = (iso: string, now = new Date()): HistoryGroup => {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days <= 7 ? "lastWeek" : "older";
};

export const GROUP_LABEL: Record<HistoryGroup, string> = {
  today: tr("Hôm nay"),
  yesterday: tr("Hôm qua"),
  lastWeek: tr("7 ngày qua"),
  older: tr("Cũ hơn"),
};
