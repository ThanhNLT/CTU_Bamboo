/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useState } from "react";
import { List, useTable } from "@refinedev/antd";
import { useGo, useInvalidate, type BaseRecord } from "@refinedev/core";
import { Button, Space, Table, Tag, Typography } from "antd";
import gql from "graphql-tag";

import { ActModal } from "../../components/approval/ActModal";
import { ESCALATION_REASON, formatDate, formatMoney } from "../../utils/format";
import { tr, trf } from "../../i18n";

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
      transfer_request {
        id
        doc_no
        requester {
          full_name
        }
        person {
          full_name
        }
        target_unit {
          name
        }
      }
      transfer_out {
        id
        doc_no
        person_name
        target_unit_name
      }
      transfer_in {
        id
        doc_no
        person_name
        target_unit {
          name
        }
      }
      transfer_group {
        id
        doc_no
        person_name
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
  transfer_request: {
    id: string;
    doc_no: string;
    requester: { full_name: string } | null;
    person: { full_name: string } | null;
    target_unit: { name: string } | null;
  } | null;
  transfer_out: { id: string; doc_no: string; person_name: string; target_unit_name: string } | null;
  transfer_in: { id: string; doc_no: string; person_name: string; target_unit: { name: string } | null } | null;
  transfer_group: { id: string; doc_no: string; person_name: string } | null;
};

const describe = (r: Row) => {
  if (r.kb_document) {
    const k = r.kb_document;
    return {
      to: `/h/library/proposals/${k.id}`,
      resource: "collab_kb_document",
      id: k.id,
      docNo: k.doc_no,
      title: trf("Đề xuất tài liệu: {0}", [k.title]),
      sub: `${k.requester?.full_name ?? ""} · ${k.org_unit?.name ?? ""}`,
      amount: "—",
    };
  }
  if (r.transfer_out) {
    const t = r.transfer_out;
    return {
      to: `/h/transfer/cross/show/${t.id}`,
      resource: "hr_transfer_out",
      id: t.id,
      docNo: t.doc_no,
      title: trf("Điều chuyển liên tập đoàn {0}", [t.person_name]),
      sub: trf("đến {0}", [t.target_unit_name]),
      amount: "—",
    };
  }
  if (r.transfer_in) {
    const t = r.transfer_in;
    return {
      to: `/h/transfer/leg/in/${t.id}`,
      resource: "hr_transfer_in",
      id: t.id,
      docNo: t.doc_no,
      title: trf("Tiếp nhận điều chuyển {0}", [t.person_name]),
      sub: trf("vào {0}", [t.target_unit?.name ?? ""]),
      amount: "—",
    };
  }
  if (r.transfer_group) {
    const t = r.transfer_group;
    return {
      to: `/h/transfer/leg/group/${t.id}`,
      resource: "hr_transfer_group",
      id: t.id,
      docNo: t.doc_no,
      title: trf("Quyết định điều chuyển {0}", [t.person_name]),
      sub: tr("Liên tập đoàn"),
      amount: "—",
    };
  }
  if (r.transfer_request) {
    const t = r.transfer_request;
    return {
      resource: "hr_transfer_request",
      id: t.id,
      docNo: t.doc_no,
      title: trf("Điều chuyển {0}", [t.person?.full_name ?? ""]),
      sub: trf("{0} · đến {1}", [t.requester?.full_name ?? "", t.target_unit?.name ?? ""]),
      amount: "—",
    };
  }
  if (r.onboarding_request) {
    const o = r.onboarding_request;
    return {
      resource: "hr_onboarding_request",
      id: o.id,
      docNo: o.doc_no,
      title: trf("Tiếp nhận {0}", [o.full_name]),
      sub: `${o.requester?.full_name ?? ""} · ${o.target_position?.name ?? ""}, ${o.target_position?.org_unit.name ?? ""}`,
      amount: o.salary == null ? "—" : trf("{0}/tháng", [formatMoney(o.salary)]),
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
    <List title={tr("Hộp việc cần duyệt")}>
      <Table {...tableProps} rowKey={(r) => `${r.task_id}:${r.via_delegation}`}>
        <Table.Column<Row>
          title={tr("Chứng từ")}
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
        <Table.Column<Row> title={tr("Số tiền / lương")} align="right" render={(_, r) => describe(r).amount} />
        <Table.Column<Row>
          title={tr("Duyệt với tư cách")}
          render={(_, r) => (
            <Space direction="vertical" size={2}>
              <span>{r.assigned_position?.name}</span>
              {r.via_delegation && <Tag color="purple">{tr("Duyệt thay (ủy quyền)")}</Tag>}
              {r.escalated && (
                <Tag color="orange">
                  {tr("Đẩy lên: ")} {ESCALATION_REASON[r.escalation_reason ?? ""]}
                </Tag>
              )}
            </Space>
          )}
        />
        <Table.Column dataIndex="created_at" title={tr("Nhận lúc")} sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row>
          title=""
          render={(_, r) => (
            <Button type="primary" onClick={() => setActing(r)}>
              {tr("Xử lý")}
            </Button>
          )}
        />
      </Table>
      <ActModal
        taskId={acting?.task_id ?? null}
        viaDelegation={acting?.via_delegation}
        title={acting ? trf("Xử lý {0}", [describe(acting).docNo]) : undefined}
        onClose={() => setActing(null)}
        onDone={() => {
          setActing(null);
          invalidate({ resource: "wf_v_inbox", invalidates: ["list"] });
        }}
      />
    </List>
  );
};
