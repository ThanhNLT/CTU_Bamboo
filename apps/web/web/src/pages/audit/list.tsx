// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nhật ký kiểm toán nối chuỗi hash theo tenant và đối soát chuỗi (ADR #18, #33). Cần quyền audit.read.
import { useState } from "react";
import { List, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Alert, App, Button, Select, Space, Table, Tag, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import gql from "graphql-tag";
import { request } from "../../api/client";
import { formatDate } from "../../utils/format";

const AUDIT = gql`
  query Audit($limit: Int, $offset: Int, $order_by: [audit_log_order_by!], $where: audit_log_bool_exp) {
    audit_log(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id seq table_name row_id op actor_role changed_cols created_at hash old_data new_data
      actor { full_name }
    }
    audit_log_aggregate(where: $where) { aggregate { count } }
  }
`;

type Row = BaseRecord & {
  seq: number; table_name: string; row_id: string; op: string; actor_role: string; changed_cols: string[] | null;
  created_at: string; hash: string; old_data: unknown; new_data: unknown; actor: { full_name: string } | null;
};
type Verify = { ok: boolean; checked: number; head_seq: number; head_hash: string | null; problems: { seq: number | null; problem: string }[] };

const OP_COLOR: Record<string, string> = { INSERT: "green", UPDATE: "blue", DELETE: "red" };
const TABLES = ["proc.purchase_request", "proc.purchase_request_item", "core.attachment", "collab.comment", "core.assignment",
  "core.role_grant", "core.delegation", "wf.approval_rule", "core.person", "core.position", "core.org_unit"];

export const AuditLogList = () => {
  const { message } = App.useApp();
  const [verify, setVerify] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const { tableProps, setFilters } = useTable<Row>({
    resource: "audit_log",
    sorters: { initial: [{ field: "seq", order: "desc" }] },
    meta: { gqlQuery: AUDIT },
    syncWithLocation: true,
  });

  const runVerify = async () => {
    setBusy(true);
    try {
      const r = await request<{ verify_audit_chain: Verify }>(
        `query { verify_audit_chain { ok checked head_seq head_hash problems { seq problem } } }`);
      setVerify(r.verify_audit_chain);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <List title="Nhật ký kiểm toán" headerButtons={
      <Button type="primary" icon={<SafetyCertificateOutlined />} loading={busy} onClick={runVerify}>Đối soát chuỗi hash</Button>}>
      {verify && (
        <Alert style={{ marginBottom: 16 }} showIcon type={verify.ok ? "success" : "error"}
          message={verify.ok ? `Chuỗi nguyên vẹn: ${verify.checked} bản ghi` : `Phát hiện ${verify.problems.length} bất thường`}
          description={verify.ok
            ? <>Đầu chuỗi #{verify.head_seq}: <Typography.Text code copyable>{verify.head_hash}</Typography.Text></>
            : verify.problems.map((p) => <div key={`${p.seq}${p.problem}`}>#{p.seq ?? "?"}: {p.problem}</div>)} />
      )}
      <Space style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="Lọc theo bảng" style={{ width: 280 }} options={TABLES.map((t) => ({ value: t, label: t }))}
                onChange={(t?: string) => setFilters(t ? [{ field: "table_name", operator: "eq", value: t }] : [], "replace")} />
      </Space>
      <Table {...tableProps} rowKey="id" size="small"
             expandable={{ expandedRowRender: (r) => (
               <pre style={{ fontSize: 12, maxHeight: 320, overflow: "auto" }}>
                 {JSON.stringify({ old: r.old_data, new: r.new_data }, null, 2)}
               </pre>) }}>
        <Table.Column dataIndex="seq" title="#" sorter />
        <Table.Column dataIndex="created_at" title="Thời điểm" render={formatDate} />
        <Table.Column dataIndex="table_name" title="Bảng" />
        <Table.Column dataIndex="op" title="Thao tác" render={(op: string) => <Tag color={OP_COLOR[op]}>{op}</Tag>} />
        <Table.Column<Row> title="Người thực hiện" render={(_, r) => r.actor?.full_name ?? <i>{r.actor_role}</i>} />
        <Table.Column dataIndex="changed_cols" title="Cột thay đổi" responsive={["lg"]}
                      render={(c: string[] | null) => c?.join(", ") ?? "—"} />
        <Table.Column dataIndex="hash" title="Hash" responsive={["xl"]}
                      render={(h: string) => <Typography.Text code>{String(h).slice(2, 14)}…</Typography.Text>} />
      </Table>
    </List>
  );
};
