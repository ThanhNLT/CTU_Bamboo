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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { request } from "../../api/client";
import type { SearchMode, SearchResult } from "./types";
import { tr, trf } from "../../i18n";

const PAGE = 20;

const SEARCH = `
  query Search($q: String!, $kind: SearchKind, $mode: String, $limit: Int, $offset: Int) {
    search_documents(query: $q, kind: $kind, mode: $mode, limit: $limit, offset: $offset) {
      kind entity_type entity_id attachment_id file_name matched_field snippet semantic_score
      purchase_request { id doc_no title status total_amount requester { full_name } org_unit { name } }
      kb_document { id doc_no title status org_unit { name } }
    }
  }
`;

type Hit = {
  kind: "purchase_request" | "attachment" | "kb_document";
  entity_type: string;
  entity_id: string;
  attachment_id: string | null;
  file_name: string | null;
  matched_field: string | null;
  snippet: string;
  semantic_score: number | null;
  purchase_request: {
    id: string;
    doc_no: string;
    title: string;
    status: string;
    total_amount: number;
    requester: { full_name: string } | null;
    org_unit: { name: string } | null;
  } | null;
  kb_document: { id: string; doc_no: string; title: string; status: string; org_unit: { name: string } | null } | null;
};

const FIELD: Record<string, string> = {
  doc_no: tr("Số chứng từ"),
  title: tr("Tiêu đề"),
  description: tr("Mô tả"),
  items: tr("Dòng hàng"),
  partner: tr("Nhà cung cấp"),
  requester: tr("Người lập"),
  org_unit: tr("Đơn vị"),
  content: tr("Nội dung tệp"),
  file_name: tr("Tên tệp"),
};

// Kết quả theo ý nghĩa (semantic_score = cos) máy chủ đã nối sau kết quả từ khóa; giữ thứ tự đó khi xếp theo độ phù hợp.
const match = (h: Hit, i: number) =>
  h.semantic_score != null
    ? { keyword: false, semantic: h.semantic_score, score: Math.min(0.49, h.semantic_score * 0.75) }
    : { keyword: true, semantic: undefined, score: Math.max(0.5, 0.86 - i * 0.01) };

const toResult = (h: Hit, i: number): SearchResult => {
  const kb = h.kb_document;
  if (h.entity_type === "collab.kb_document") {
    const file = h.kind === "attachment";
    return {
      key: `doc:${h.kind}:${h.attachment_id ?? h.entity_id}`,
      type: file ? "document" : "knowledge",
      title: file && h.file_name ? h.file_name : (kb?.title ?? h.entity_id),
      code: kb?.doc_no,
      breadcrumb: file
        ? trf("Thư viện tri thức › {0}", [kb ? `${kb.doc_no} ${kb.title}` : h.entity_id])
        : trf("Thư viện tri thức{0}", [kb?.org_unit ? ` · ${kb.org_unit.name}` : ""]),
      snippetHtml: h.snippet,
      to: `/h/library?doc=${h.entity_id}`,
      ...match(h, i),
      matchedField: h.matched_field ? (FIELD[h.matched_field] ?? h.matched_field) : undefined,
      attachmentId: h.attachment_id ?? undefined,
      mono: file,
    };
  }
  if (h.entity_type === "hr.onboarding_request") {
    return {
      key: `doc:${h.kind}:${h.attachment_id ?? h.entity_id}`,
      type: "document",
      title: h.file_name ?? h.entity_id,
      breadcrumb: tr("Tệp đính kèm › Hồ sơ tiếp nhận nhân sự"),
      snippetHtml: h.snippet,
      to: `/h/onboarding/show/${h.entity_id}`,
      ...match(h, i),
      matchedField: h.matched_field ? (FIELD[h.matched_field] ?? h.matched_field) : undefined,
      attachmentId: h.attachment_id ?? undefined,
      mono: true,
    };
  }
  const pr = h.purchase_request;
  const meta = [pr?.requester?.full_name, pr?.org_unit?.name].filter(Boolean).join(" · ");
  return {
    key: `doc:${h.kind}:${h.attachment_id ?? h.entity_id}`,
    type: h.kind === "attachment" ? "document" : "record",
    title: h.kind === "attachment" && h.file_name ? h.file_name : (pr?.title ?? h.entity_id),
    code: pr?.doc_no,
    breadcrumb:
      h.kind === "attachment"
        ? trf("Tệp đính kèm › {0}", [pr ? `${pr.doc_no} ${pr.title}` : h.entity_id])
        : trf("Hồ sơ › Đề nghị mua sắm{0}", [meta ? ` · ${meta}` : ""]),
    snippetHtml: h.snippet,
    to: `/p/documents/show/${h.entity_id}`,
    ...match(h, i),
    matchedField: h.matched_field ? (FIELD[h.matched_field] ?? h.matched_field) : undefined,
    status: pr?.status,
    attachmentId: h.attachment_id ?? undefined,
    mono: h.kind === "attachment",
  };
};

type State = { hits: Hit[]; more: boolean; loading: boolean; error?: string; ms: number };

const EMPTY: State = { hits: [], more: false, loading: false, ms: 0 };

export const useDocumentSearch = (q: string, enabled: boolean, mode: SearchMode = "hybrid") => {
  const [state, setState] = useState<State>(EMPTY);
  const seq = useRef(0);

  const fetchPage = useCallback(
    async (query: string, offset: number) => {
      const my = ++seq.current;
      const t0 = performance.now();
      setState((s) => ({ ...s, loading: true, error: undefined }));
      try {
        const r = await request<{ search_documents: Hit[] }>(SEARCH, {
          q: query,
          kind: null,
          mode,
          limit: PAGE,
          offset,
        });
        if (my !== seq.current) return;
        setState((s) => ({
          hits: offset === 0 ? r.search_documents : [...s.hits, ...r.search_documents],
          more: r.search_documents.length === PAGE,
          loading: false,
          ms: performance.now() - t0,
        }));
      } catch (e) {
        if (my === seq.current) setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      }
    },
    [mode],
  );

  useEffect(() => {
    if (!enabled || !q) {
      seq.current++;
      setState(EMPTY);
      return;
    }
    void fetchPage(q, 0);
  }, [q, enabled, fetchPage]);

  const results = useMemo(() => state.hits.map(toResult), [state.hits]);

  return {
    results,
    more: state.more,
    loading: state.loading,
    error: state.error,
    ms: state.ms,
    loadMore: () => fetchPage(q, state.hits.length),
    reload: () => fetchPage(q, 0),
  };
};
