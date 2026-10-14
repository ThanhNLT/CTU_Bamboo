// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Tìm THẬT trong đề nghị mua sắm, tài liệu thư viện và nội dung tệp đính kèm (Action search_documents, ADR #36, #48).
// Tenant và quyền xem lọc ở máy chủ; giao diện chỉ gửi chữ cần tìm.

// ===== Thư viện =====
import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // React

// ===== Module nội bộ =====
import { request } from "../../api/client";
import type { SearchResult } from "./types";

// ===== Hằng số =====
const PAGE = 20;

// ===== Truy vấn GraphQL =====
const SEARCH = `
  query Search($q: String!, $kind: SearchKind, $limit: Int, $offset: Int) {
    search_documents(query: $q, kind: $kind, limit: $limit, offset: $offset) {
      kind entity_type entity_id attachment_id file_name matched_field snippet
      purchase_request { id doc_no title status total_amount requester { full_name } org_unit { name } }
      kb_document { id doc_no title status org_unit { name } }
    }
  }
`;

// ===== Kiểu dữ liệu =====
type Hit = {
  kind: "purchase_request" | "attachment" | "kb_document";
  entity_type: string;
  entity_id: string;
  attachment_id: string | null;
  file_name: string | null;
  matched_field: string | null;
  snippet: string;
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

// ===== Hằng số =====
const FIELD: Record<string, string> = {
  doc_no: "Số chứng từ",
  title: "Tiêu đề",
  description: "Mô tả",
  items: "Dòng hàng",
  partner: "Nhà cung cấp",
  requester: "Người lập",
  org_unit: "Đơn vị",
  content: "Nội dung tệp",
  file_name: "Tên tệp",
};

// ===== Hàm tiện ích =====
/** Kết quả thật → dòng hiển thị chung. Điểm giảm dần theo thứ tự máy chủ trả (đã xếp theo độ khớp). */
const toResult = (h: Hit, i: number): SearchResult => {
  const kb = h.kb_document;
  if (h.entity_type === "collab.kb_document") {
    const file = h.kind === "attachment";
    return {
      key: `doc:${h.kind}:${h.attachment_id ?? h.entity_id}`,
      type: file ? "document" : "record",
      title: file && h.file_name ? h.file_name : (kb?.title ?? h.entity_id),
      code: kb?.doc_no,
      breadcrumb: file
        ? `Thư viện tri thức › ${kb ? `${kb.doc_no} ${kb.title}` : h.entity_id}`
        : `Thư viện tri thức${kb?.org_unit ? ` · ${kb.org_unit.name}` : ""}`,
      snippetHtml: h.snippet,
      to: `/h/library?doc=${h.entity_id}`,
      keyword: true,
      score: Math.max(0.5, 0.86 - i * 0.01),
      matchedField: h.matched_field ? (FIELD[h.matched_field] ?? h.matched_field) : undefined,
      attachmentId: h.attachment_id ?? undefined,
      mono: file,
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
        ? `Tệp đính kèm › ${pr ? `${pr.doc_no} ${pr.title}` : h.entity_id}`
        : `Hồ sơ › Đề nghị mua sắm${meta ? ` · ${meta}` : ""}`,
    snippetHtml: h.snippet,
    to: `/p/documents/show/${h.entity_id}`,
    keyword: true,
    score: Math.max(0.5, 0.86 - i * 0.01),
    matchedField: h.matched_field ? (FIELD[h.matched_field] ?? h.matched_field) : undefined,
    status: pr?.status,
    attachmentId: h.attachment_id ?? undefined,
    mono: h.kind === "attachment",
  };
};

// ===== Kiểu dữ liệu =====
type State = { hits: Hit[]; more: boolean; loading: boolean; error?: string; ms: number };

// ===== Hằng số =====
const EMPTY: State = { hits: [], more: false, loading: false, ms: 0 };

// ===== Hook =====
export const useDocumentSearch = (q: string, enabled: boolean) => {
  const [state, setState] = useState<State>(EMPTY);
  const seq = useRef(0);

  const fetchPage = useCallback(async (query: string, offset: number) => {
    const my = ++seq.current;
    const t0 = performance.now();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const r = await request<{ search_documents: Hit[] }>(SEARCH, { q: query, kind: null, limit: PAGE, offset });
      if (my !== seq.current) return; // Đã có lần tìm mới hơn.
      setState((s) => ({
        hits: offset === 0 ? r.search_documents : [...s.hits, ...r.search_documents],
        more: r.search_documents.length === PAGE,
        loading: false,
        ms: performance.now() - t0,
      }));
    } catch (e) {
      if (my === seq.current) setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

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
