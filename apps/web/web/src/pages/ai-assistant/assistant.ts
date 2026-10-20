// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request, wsClient } from "../../api/client";
import type { Assistant, Citation, HistoryGroup, Question } from "./types";

const FIELDS = `id question status answer thinking citations guard error gpu_wait_since model kb_document_id created_at started_at finished_at`;

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

/** Theo dõi một lượt hỏi qua subscription Hasura; trả hàm hủy. */
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

export const citationLabel = (c: Citation) =>
  [c.doc_no, c.heading ?? c.file_name ?? c.title].filter(Boolean).join(" · ");

export const citationLink = (c: Citation) => `/h/library?doc=${encodeURIComponent(c.kb_document_id)}`;

export const plainText = (q: Question) =>
  [
    q.answer.replace(/\*\*/g, ""),
    ...(q.citations.length ? ["", "Nguồn:", ...q.citations.map((c) => `[${c.n}] ${citationLabel(c)}`)] : []),
  ].join("\n");

export const refusalText = (q: Question) =>
  q.guard === "prompt"
    ? "Câu hỏi bị chặn vì có dấu hiệu cố tình thay đổi chỉ dẫn của trợ lý."
    : q.answer || "Không tìm thấy nội dung liên quan trong Thư viện tri thức mà bạn được xem.";

export const elapsed = (q: Question) => {
  if (!q.started_at || !q.finished_at) return null;
  const s = (new Date(q.finished_at).getTime() - new Date(q.started_at).getTime()) / 1000;
  return `${s.toFixed(1).replace(".", ",")} giây`;
};

export const titleFrom = (text: string) => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text);

export const groupOf = (iso: string, now = new Date()): HistoryGroup => {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days <= 7 ? "lastWeek" : "older";
};

export const GROUP_LABEL: Record<HistoryGroup, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  lastWeek: "7 ngày qua",
  older: "Cũ hơn",
};
