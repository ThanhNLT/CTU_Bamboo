// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { List, useTable } from "@refinedev/antd";
import { useGo, useInvalidate, type BaseRecord } from "@refinedev/core";
import { Button, Space, Table, Tag, Typography } from "antd";
import gql from "graphql-tag";

import { ActModal } from "../../components/approval/ActModal";
import { ESCALATION_REASON, formatDate, formatMoney } from "../../utils/format";

const INBOX = gql`
  query Inbox($limit: Int, $offset: Int, $order_by: [wf_v_inbox_order_by!], $where: wf_v_inbox_bool_exp) {
    wf_v_inbox(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      task_id
      via_delegation
      escalated
      escalation_reason
      created_at
      entity_id
      step_order
      assigned_position {
        name
      }
      purchase_request {
        id
        doc_no
        title
        total_amount
        requester {
          full_name
        }
        org_unit {
          name
        }
      }
      kb_document {
        id
        doc_no
        title
        requester {
          full_name
        }
        org_unit {
          name
        }
      }
      onboarding_request {
        id
        doc_no
        full_name
        salary
        requester {
          full_name
        }
        target_position {
          name
          org_unit {
            name
          }
        }
      }
    }
    wf_v_inbox_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

type Row = BaseRecord & {
  task_id: string;
  via_delegation: boolean;
  escalated: boolean;
  escalation_reason: string | null;
  created_at: string;
  assigned_position: { name: string } | null;
  purchase_request: {
    id: string;
    doc_no: string;
    title: string;
    total_amount: number;
    requester: { full_name: string } | null;
    org_unit: { name: string } | null;
  } | null;
  kb_document: {
    id: string;
    doc_no: string;
    title: string;
    requester: { full_name: string } | null;
    org_unit: { name: string } | null;
  } | null;
  onboarding_request: {
    id: string;
    doc_no: string;
    full_name: string;
    salary: number | null;
    requester: { full_name: string } | null;
    target_position: { name: string; org_unit: { name: string } } | null;
  } | null;
};

const describe = (r: Row) => {
  if (r.kb_document) {
    const k = r.kb_document;
    return {
      to: `/h/library/proposals/${k.id}`,
      resource: "collab_kb_document",
      id: k.id,
      docNo: k.doc_no,
      title: `Đề xuất tài liệu: ${k.title}`,
      sub: `${k.requester?.full_name ?? ""} · ${k.org_unit?.name ?? ""}`,
      amount: "—",
    };
  }
  if (r.onboarding_request) {
    const o = r.onboarding_request;
    return {
      resource: "hr_onboarding_request",
      id: o.id,
      docNo: o.doc_no,
      title: `Tiếp nhận ${o.full_name}`,
      sub: `${o.requester?.full_name ?? ""} · ${o.target_position?.name ?? ""}, ${o.target_position?.org_unit.name ?? ""}`,
      amount: o.salary == null ? "—" : `${formatMoney(o.salary)}/tháng`,
    };
  }
  const p = r.purchase_request;
  return {
    resource: "proc_purchase_request",
    id: p?.id ?? r.entity_id,
    docNo: p?.doc_no,
    title: p?.title,
    sub: `${p?.requester?.full_name ?? ""} · ${p?.org_unit?.name ?? ""}`,
    amount: formatMoney(p?.total_amount),
  };
};

export const InboxList = () => {
  const go = useGo();
  const invalidate = useInvalidate();
  const [acting, setActing] = useState<Row | null>(null);
  const { tableProps } = useTable<Row>({
    resource: "wf_v_inbox",
    sorters: { initial: [{ field: "created_at", order: "asc" }] },
    meta: { gqlQuery: INBOX },
    liveMode: "auto",
    syncWithLocation: false,
  });

  return (
    <List title="Hộp việc cần duyệt">
      <Table {...tableProps} rowKey={(r) => `${r.task_id}:${r.via_delegation}`}>
        <Table.Column<Row>
          title="Chứng từ"
          render={(_, r) => {
            const d = describe(r);
            return (
              <Space direction="vertical" size={0}>
                <a onClick={() => go({ to: "to" in d ? d.to : { resource: d.resource, action: "show", id: d.id } })}>
                  <Typography.Text code style={{ whiteSpace: "nowrap" }}>
                    {d.docNo}
                  </Typography.Text>{" "}
                  {d.title}
                </a>
                <Typography.Text type="secondary">{d.sub}</Typography.Text>
              </Space>
            );
          }}
        />
        <Table.Column<Row> title="Số tiền / lương" align="right" render={(_, r) => describe(r).amount} />
        <Table.Column<Row>
          title="Duyệt với tư cách"
          render={(_, r) => (
            <Space direction="vertical" size={2}>
              <span>{r.assigned_position?.name}</span>
              {r.via_delegation && <Tag color="purple">Duyệt thay (ủy quyền)</Tag>}
              {r.escalated && <Tag color="orange">Đẩy lên: {ESCALATION_REASON[r.escalation_reason ?? ""]}</Tag>}
            </Space>
          )}
        />
        <Table.Column dataIndex="created_at" title="Nhận lúc" sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row>
          title=""
          render={(_, r) => (
            <Button type="primary" onClick={() => setActing(r)}>
              Xử lý
            </Button>
          )}
        />
      </Table>
      <ActModal
        taskId={acting?.task_id ?? null}
        viaDelegation={acting?.via_delegation}
        title={acting ? `Xử lý ${describe(acting).docNo}` : undefined}
        onClose={() => setActing(null)}
        onDone={() => {
          setActing(null);
          invalidate({ resource: "wf_v_inbox", invalidates: ["list"] });
        }}
      />
    </List>
  );
};
