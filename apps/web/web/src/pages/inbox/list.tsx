// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hộp việc: việc duyệt của mình và việc nhận qua ủy quyền (wf.v_inbox), tự cập nhật (ADR #20).
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
      task_id via_delegation escalated escalation_reason created_at entity_id step_order
      assigned_position { name }
      purchase_request { id doc_no title total_amount requester { full_name } org_unit { name } }
    }
    wf_v_inbox_aggregate(where: $where) { aggregate { count } }
  }
`;

type Row = BaseRecord & {
  task_id: string; via_delegation: boolean; escalated: boolean; escalation_reason: string | null; created_at: string;
  assigned_position: { name: string } | null;
  purchase_request: { id: string; doc_no: string; title: string; total_amount: number;
                      requester: { full_name: string } | null; org_unit: { name: string } | null } | null;
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
        <Table.Column<Row> title="Đề nghị" render={(_, r) => (
          <Space direction="vertical" size={0}>
            <a onClick={() => go({ to: { resource: "proc_purchase_request", action: "show", id: r.purchase_request!.id } })}>
              <Typography.Text code style={{ whiteSpace: "nowrap" }}>{r.purchase_request?.doc_no}</Typography.Text> {r.purchase_request?.title}
            </a>
            <Typography.Text type="secondary">{r.purchase_request?.requester?.full_name} · {r.purchase_request?.org_unit?.name}</Typography.Text>
          </Space>)} />
        <Table.Column<Row> title="Số tiền" align="right" render={(_, r) => formatMoney(r.purchase_request?.total_amount)} />
        <Table.Column<Row> title="Duyệt với tư cách" render={(_, r) => (
          <Space direction="vertical" size={2}>
            <span>{r.assigned_position?.name}</span>
            {r.via_delegation && <Tag color="purple">Duyệt thay (ủy quyền)</Tag>}
            {r.escalated && <Tag color="orange">Đẩy lên: {ESCALATION_REASON[r.escalation_reason ?? ""]}</Tag>}
          </Space>)} />
        <Table.Column dataIndex="created_at" title="Nhận lúc" sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row> title="" render={(_, r) => <Button type="primary" onClick={() => setActing(r)}>Xử lý</Button>} />
      </Table>
      <ActModal taskId={acting?.task_id ?? null} viaDelegation={acting?.via_delegation}
                title={acting ? `Xử lý ${acting.purchase_request?.doc_no}` : undefined}
                onClose={() => setActing(null)}
                onDone={() => { setActing(null); invalidate({ resource: "wf_v_inbox", invalidates: ["list"] }); }} />
    </List>
  );
};
