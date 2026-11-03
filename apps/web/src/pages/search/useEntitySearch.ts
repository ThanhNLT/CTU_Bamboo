// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import { request } from "../../api/client";
import type { SearchResult } from "./types";
import { tr, trf } from "../../i18n";

const QUERY = `query EntitySearch($p: String!) {
  iot_entity(where: {_or: [{code: {_ilike: $p}}, {name: {_ilike: $p}}]}, limit: 10, order_by: {code: asc}) {
    code name last_seen_at site { name province } type_model { kind }
  }
  hr_onboarding_request(where: {_or: [{doc_no: {_ilike: $p}}, {full_name: {_ilike: $p}}]}, limit: 10,
                        order_by: {updated_at: desc}) {
    id doc_no full_name status updated_at target_position { name org_unit { name } }
  }
  ic_ic_order(where: {doc_no: {_ilike: $p}}, limit: 10, order_by: {updated_at: desc}) {
    id doc_no status updated_at buyer_unit { name } seller_unit { name }
  }
  meta_lineage_node(where: {_or: [{name: {_ilike: $p}}, {title: {_ilike: $p}}, {fqn: {_ilike: $p}}]}, limit: 10) {
    id fqn title tech owner layer
  }
}`;

type Rows = {
  iot_entity: {
    code: string;
    name: string;
    last_seen_at: string | null;
    site: { name: string; province: string | null } | null;
    type_model: { kind: string };
  }[];
  hr_onboarding_request: {
    id: string;
    doc_no: string;
    full_name: string;
    status: string;
    updated_at: string;
    target_position: { name: string; org_unit: { name: string } } | null;
  }[];
  ic_ic_order: {
    id: string;
    doc_no: string;
    status: string;
    updated_at: string;
    buyer_unit: { name: string } | null;
    seller_unit: { name: string } | null;
  }[];
  meta_lineage_node: { id: string; fqn: string; title: string; tech: string; owner: string; layer: string }[];
};

const DAY = 86_400_000;
const ago = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY)) : undefined);
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const toResults = (r: Rows): SearchResult[] => [
  ...r.iot_entity.map((e) => ({
    key: `twin:${e.code}`,
    type: "twin" as const,
    title: e.name,
    code: e.code,
    breadcrumb: trf("Bản sao số › {0}{1}", [e.type_model.kind, e.site ? ` · ${e.site.name}` : ""]),
    to: `/d/twin?entity=${encodeURIComponent(e.code)}`,
    keyword: true,
    score: 0.8,
    daysAgo: ago(e.last_seen_at),
    mono: false,
  })),
  ...r.hr_onboarding_request.map((o) => ({
    key: `ob:${o.id}`,
    type: "record" as const,
    title: trf("Tiếp nhận {0}", [o.full_name]),
    code: o.doc_no,
    breadcrumb: trf("Hồ sơ › Tiếp nhận nhân sự{0}", [o.target_position ? ` · ${o.target_position.org_unit.name}` : ""]),
    to: `/h/onboarding/show/${o.id}`,
    keyword: true,
    score: 0.78,
    daysAgo: ago(o.updated_at),
    status: o.status,
  })),
  ...r.ic_ic_order.map((o) => ({
    key: `ic:${o.id}`,
    type: "record" as const,
    title: trf("Đơn nội bộ {0} → {1}", [o.buyer_unit?.name ?? "?", o.seller_unit?.name ?? "?"]),
    code: o.doc_no,
    breadcrumb: tr("Hồ sơ › Đơn hàng nội bộ"),
    to: `/p/ic-orders/show/${o.id}`,
    keyword: true,
    score: 0.76,
    daysAgo: ago(o.updated_at),
    status: o.status,
  })),
  ...r.meta_lineage_node.map((n) => ({
    key: `data:${n.id}`,
    type: "data" as const,
    title: n.title,
    code: n.fqn,
    breadcrumb: trf("Dữ liệu › {0} · {1}", [n.tech, n.owner]),
    to: `/d/lineage?asset=${encodeURIComponent(n.fqn)}`,
    keyword: true,
    score: 0.7,
    mono: true,
  })),
];

export const useEntitySearch = (q: string) => {
  const [state, setState] = useState<{ q: string; results: SearchResult[]; error?: string }>({ q: "", results: [] });
  useEffect(() => {
    if (!q) return;
    let live = true;
    request<Rows>(QUERY, { p: pattern(q) })
      .then((r) => live && setState({ q, results: toResults(r) }))
      .catch((e: Error) => live && setState({ q, results: [], error: e.message }));
    return () => {
      live = false;
    };
  }, [q]);
  return state.q === q ? state : { q, results: [] as SearchResult[], error: undefined };
};
