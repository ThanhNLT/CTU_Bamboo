/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useList, type CrudFilter } from "@refinedev/core";
import gql from "graphql-tag";
import { useMemo } from "react";

import { formatMoney } from "../utils/format";
import { IC_STATUS_LABEL, PR_STATUS_LABEL } from "../utils/status";
import { tr, trf } from "../i18n";

export type DocKind = "purchase_request" | "onboarding_request" | "ic_order" | "kb_document";

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  purchase_request: tr("Đề nghị mua sắm"),
  onboarding_request: tr("Tiếp nhận nhân sự"),
  ic_order: tr("Đơn hàng nội bộ"),
  kb_document: tr("Đề xuất tài liệu"),
};

export type DocStep = {
  order: number;
  position: string;
  status: string;
  actedBy?: string;
  actedAt?: string;
};

export type DocSummary = {
  id: string;
  kind: DocKind;
  code: string;
  title: string;
  status: string;
  statusLabel: string;
  requester: string;
  requesterId?: string;
  unit: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
  to: string;
  steps: DocStep[];
};

const STEPS = `
  approval_round
  approval_steps(order_by: [{ round: desc }, { step_order: asc }]) {
    round step_order status acted_at position { name } acted_by_person { full_name }
  }
`;

const PR = gql`
  query DocsPr($limit: Int, $offset: Int, $order_by: [proc_purchase_request_order_by!], $where: proc_purchase_request_bool_exp) {
    proc_purchase_request(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id doc_no title status total_amount created_at updated_at requester_id
      requester { full_name } org_unit { name }
      ${STEPS}
    }
    proc_purchase_request_aggregate(where: $where) { aggregate { count } }
  }
`;

const OB = gql`
  query DocsOb($limit: Int, $offset: Int, $order_by: [hr_onboarding_request_order_by!], $where: hr_onboarding_request_bool_exp) {
    hr_onboarding_request(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id doc_no full_name status salary created_at updated_at requester_id
      requester { full_name } target_position { name org_unit { name } }
      ${STEPS}
    }
    hr_onboarding_request_aggregate(where: $where) { aggregate { count } }
  }
`;

const IC = gql`
  query DocsIc($limit: Int, $offset: Int, $order_by: [ic_ic_order_order_by!], $where: ic_ic_order_bool_exp) {
    ic_ic_order(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      doc_no
      status
      total_amount
      created_at
      updated_at
      created_by
      created_by_person {
        full_name
      }
      buyer_unit {
        name
      }
      seller_unit {
        name
      }
    }
    ic_ic_order_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const KB = gql`
  query DocsKb($limit: Int, $offset: Int, $order_by: [collab_kb_document_order_by!], $where: collab_kb_document_bool_exp) {
    collab_kb_document(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id doc_no title status version created_at updated_at requester_id
      requester { full_name } org_unit { name }
      ${STEPS}
    }
    collab_kb_document_aggregate(where: $where) { aggregate { count } }
  }
`;

type StepRow = {
  round: number;
  step_order: number;
  status: string;
  acted_at: string | null;
  position: { name: string } | null;
  acted_by_person: { full_name: string } | null;
};
type PrRow = {
  id: string;
  doc_no: string;
  title: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  requester_id: string;
  requester: { full_name: string } | null;
  org_unit: { name: string } | null;
  approval_round: number;
  approval_steps: StepRow[];
};
type ObRow = {
  id: string;
  doc_no: string;
  full_name: string;
  status: string;
  salary: number | null;
  created_at: string;
  updated_at: string;
  requester_id: string;
  requester: { full_name: string } | null;
  target_position: { name: string; org_unit: { name: string } } | null;
  approval_round: number;
  approval_steps: StepRow[];
};
type IcRow = {
  id: string;
  doc_no: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_person: { full_name: string } | null;
  buyer_unit: { name: string } | null;
  seller_unit: { name: string } | null;
};

type KbRow = {
  id: string;
  doc_no: string;
  title: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  requester_id: string;
  requester: { full_name: string } | null;
  org_unit: { name: string } | null;
  approval_round: number;
  approval_steps: StepRow[];
};

const stepsOf = (round: number, rows: StepRow[]): DocStep[] =>
  rows
    .filter((s) => s.round === round)
    .map((s) => ({
      order: s.step_order,
      position: s.position?.name ?? "—",
      status: s.status,
      actedBy: s.acted_by_person?.full_name,
      actedAt: s.acted_at ?? undefined,
    }));

const fromPr = (r: PrRow): DocSummary => ({
  id: r.id,
  kind: "purchase_request",
  code: r.doc_no,
  title: r.title,
  status: r.status,
  statusLabel: PR_STATUS_LABEL[r.status] ?? r.status,
  requester: r.requester?.full_name ?? "—",
  requesterId: r.requester_id,
  unit: r.org_unit?.name ?? "—",
  amount: formatMoney(r.total_amount),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  to: `/p/documents/show/${r.id}`,
  steps: stepsOf(r.approval_round, r.approval_steps),
});

const fromOb = (r: ObRow): DocSummary => ({
  id: r.id,
  kind: "onboarding_request",
  code: r.doc_no,
  title: trf("Tiếp nhận {0}", [r.full_name]),
  status: r.status,
  statusLabel: PR_STATUS_LABEL[r.status] ?? r.status,
  requester: r.requester?.full_name ?? "—",
  requesterId: r.requester_id,
  unit: r.target_position?.org_unit.name ?? "—",
  amount: r.salary == null ? "—" : trf("{0}/tháng", [formatMoney(r.salary)]),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  to: `/h/onboarding/show/${r.id}`,
  steps: stepsOf(r.approval_round, r.approval_steps),
});

const fromIc = (r: IcRow): DocSummary => ({
  id: r.id,
  kind: "ic_order",
  code: r.doc_no,
  title: trf("Đơn nội bộ {0} → {1}", [r.buyer_unit?.name ?? "?", r.seller_unit?.name ?? "?"]),
  status: r.status,
  statusLabel: IC_STATUS_LABEL[r.status] ?? r.status,
  requester: r.created_by_person?.full_name ?? "—",
  requesterId: r.created_by,
  unit: r.buyer_unit?.name ?? "—",
  amount: formatMoney(r.total_amount),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  to: `/p/ic-orders/show/${r.id}`,
  steps: [],
});

const fromKb = (r: KbRow): DocSummary => ({
  id: r.id,
  kind: "kb_document",
  code: r.doc_no,
  title: r.title,
  status: r.status,
  statusLabel: r.status === "APPROVED" ? tr("Đã xuất bản") : (PR_STATUS_LABEL[r.status] ?? tr("Ngừng hiệu lực")),
  requester: r.requester?.full_name ?? "—",
  requesterId: r.requester_id,
  unit: r.org_unit?.name ?? "—",
  amount: trf("Phiên bản {0}", [r.version]),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  to: `/h/library/proposals/${r.id}`,
  steps: stepsOf(r.approval_round, r.approval_steps),
});

type Options = {
  mine?: string;
  limit?: number;
};

export const useDocuments = ({ mine, limit = 100 }: Options = {}) => {
  const by = (field: string): CrudFilter[] => (mine ? [{ field, operator: "eq", value: mine }] : []);
  const common = {
    sorters: [{ field: "updated_at", order: "desc" as const }],
    pagination: { pageSize: limit },
    liveMode: "auto" as const,
  };
  const pr = useList<PrRow>({
    resource: "proc_purchase_request",
    filters: by("requester_id"),
    meta: { gqlQuery: PR },
    ...common,
  });
  const ob = useList<ObRow>({
    resource: "hr_onboarding_request",
    filters: by("requester_id"),
    meta: { gqlQuery: OB },
    ...common,
  });
  const ic = useList<IcRow>({ resource: "ic_ic_order", filters: by("created_by"), meta: { gqlQuery: IC }, ...common });
  const kb = useList<KbRow>({
    resource: "collab_kb_document",
    filters: by("requester_id"),
    meta: { gqlQuery: KB },
    ...common,
  });

  const prRows = pr.result.data;
  const obRows = ob.result.data;
  const icRows = ic.result.data;
  const kbRows = kb.result.data;
  const documents = useMemo(
    () =>
      [...prRows.map(fromPr), ...obRows.map(fromOb), ...icRows.map(fromIc), ...kbRows.map(fromKb)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [prRows, obRows, icRows, kbRows],
  );

  return {
    documents,
    total: (pr.result.total ?? 0) + (ob.result.total ?? 0) + (ic.result.total ?? 0) + (kb.result.total ?? 0),
    loading: pr.query.isLoading || ob.query.isLoading || ic.query.isLoading || kb.query.isLoading,
    error: (pr.query.error ?? ob.query.error ?? ic.query.error ?? kb.query.error)?.message,
  };
};
