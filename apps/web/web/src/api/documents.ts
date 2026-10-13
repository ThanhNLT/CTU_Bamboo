// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Danh sách chứng từ dùng chung cho Trang chủ và trang Hồ sơ: đề nghị mua sắm, đề nghị tiếp nhận nhân sự và
// đơn hàng nội bộ gộp về một dạng. Hasura chỉ trả chứng từ người dùng được xem (can_read); `mine` lọc thêm
// chứng từ do chính người dùng lập. Tự cập nhật qua subscription.
import { useList, type CrudFilter } from "@refinedev/core";
import gql from "graphql-tag";
import { useMemo } from "react";
import { formatMoney } from "../utils/format";
import { IC_STATUS_LABEL, PR_STATUS_LABEL } from "../utils/status";

export type DocKind = "purchase_request" | "onboarding_request" | "ic_order";

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  purchase_request: "Đề nghị mua sắm",
  onboarding_request: "Tiếp nhận nhân sự",
  ic_order: "Đơn hàng nội bộ",
};

/** Một bước duyệt của lần gửi hiện tại. */
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
  /** Mã trạng thái gốc (DRAFT, PENDING, ...). */
  status: string;
  statusLabel: string;
  requester: string;
  requesterId?: string;
  unit: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
  /** Trang chi tiết. */
  to: string;
  /** Chuỗi duyệt của lần gửi hiện tại (đơn nội bộ không qua chuỗi duyệt). */
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
  title: `Tiếp nhận ${r.full_name}`,
  status: r.status,
  statusLabel: PR_STATUS_LABEL[r.status] ?? r.status,
  requester: r.requester?.full_name ?? "—",
  requesterId: r.requester_id,
  unit: r.target_position?.org_unit.name ?? "—",
  amount: r.salary == null ? "—" : `${formatMoney(r.salary)}/tháng`,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  to: `/h/onboarding/show/${r.id}`,
  steps: stepsOf(r.approval_round, r.approval_steps),
});

const fromIc = (r: IcRow): DocSummary => ({
  id: r.id,
  kind: "ic_order",
  code: r.doc_no,
  title: `Đơn nội bộ ${r.buyer_unit?.name ?? "?"} → ${r.seller_unit?.name ?? "?"}`,
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

type Options = {
  /** Chỉ chứng từ do người này lập (core.person.id). */
  mine?: string;
  /** Số chứng từ mới nhất lấy về cho MỖI loại. */
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

  const prRows = pr.result.data;
  const obRows = ob.result.data;
  const icRows = ic.result.data;
  const documents = useMemo(
    () =>
      [...prRows.map(fromPr), ...obRows.map(fromOb), ...icRows.map(fromIc)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [prRows, obRows, icRows],
  );

  return {
    documents,
    /** Tổng số chứng từ thỏa điều kiện (kể cả phần chưa tải về). */
    total: (pr.result.total ?? 0) + (ob.result.total ?? 0) + (ic.result.total ?? 0),
    loading: pr.query.isLoading || ob.query.isLoading || ic.query.isLoading,
    error: (pr.query.error ?? ob.query.error ?? ic.query.error)?.message,
  };
};
