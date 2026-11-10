/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useEffect, useState } from "react";
import { List, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Alert, App, Button, Select, Space, Spin, Table, Tag, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import gql from "graphql-tag";

import { request } from "../../api/client";
import { PiiNotice } from "../../components/pii/PiiNotice";
import { formatDate } from "../../utils/format";
import { tr, trf } from "../../i18n";

const AUDIT = gql`
  query Audit($limit: Int, $offset: Int, $order_by: [audit_log_order_by!], $where: audit_log_bool_exp) {
    audit_log(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      seq
      table_name
      row_id
      op
      actor_role
      changed_cols
      created_at
      hash
      actor {
        full_name
      }
    }
    audit_log_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

type Row = BaseRecord & {
  seq: number;
  table_name: string;
  row_id: string;
  op: string;
  actor_role: string;
  changed_cols: string[] | null;
  created_at: string;
  hash: string;
  actor: { full_name: string } | null;
};
type Detail = { log_id: number; old_data: unknown; new_data: unknown; masked: string[] };
type Verify = {
  ok: boolean;
  checked: number;
  head_seq: number;
  head_hash: string | null;
  problems: { seq: number | null; problem: string }[];
};

const DetailView = ({ id }: { id: number }) => {
  const [detail, setDetail] = useState<Detail | null>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    request<{ audit_log_detail: Detail[] }>(
      `query AuditDetail($ids: [Int!]!) { audit_log_detail(log_ids: $ids) { log_id old_data new_data masked } }`,
      { ids: [id] },
    )
      .then((r) => setDetail(r.audit_log_detail[0] ?? null))
      .catch((e: Error) => setError(e.message));
  }, [id]);
  if (error) return <Alert type="error" showIcon message={error} />;
  if (detail === undefined) return <Spin size="small" />;
  if (detail === null) return <Typography.Text type="secondary">{tr("Không còn dữ liệu")}</Typography.Text>;
  return (
    <>
      <PiiNotice labels={detail.masked} />
      <pre style={{ fontSize: 12, maxHeight: 320, overflow: "auto" }}>
        {JSON.stringify({ old: detail.old_data, new: detail.new_data }, null, 2)}
      </pre>
    </>
  );
};

const OP_COLOR: Record<string, string> = { INSERT: "green", UPDATE: "blue", DELETE: "red" };
const TABLES = [
  "proc.purchase_request",
  "hr.onboarding_request",
  "collab.kb_document",
  "proc.purchase_request_item",
  "core.attachment",
  "collab.comment",
  "core.assignment",
  "core.role_grant",
  "core.delegation",
  "wf.approval_rule",
  "core.person",
  "core.position",
  "core.org_unit",
];

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
        `query { verify_audit_chain { ok checked head_seq head_hash problems { seq problem } } }`,
      );
      setVerify(r.verify_audit_chain);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <List
      title={tr("Nhật ký kiểm toán")}
      headerButtons={
        <Button type="primary" icon={<SafetyCertificateOutlined />} loading={busy} onClick={runVerify}>
          {tr("Đối soát chuỗi hash")}
        </Button>
      }
    >
      {verify && (
        <Alert
          style={{ marginBottom: 16 }}
          showIcon
          type={verify.ok ? "success" : "error"}
          message={
            verify.ok
              ? trf("Chuỗi nguyên vẹn: {0} bản ghi", [verify.checked])
              : trf("Phát hiện {0} bất thường", [verify.problems.length])
          }
          description={
            verify.ok ? (
              <>
                {tr("Đầu chuỗi #")}
                {verify.head_seq}:{" "}
                <Typography.Text code copyable>
                  {verify.head_hash}
                </Typography.Text>
              </>
            ) : (
              verify.problems.map((p) => (
                <div key={`${p.seq}${p.problem}`}>
                  #{p.seq ?? "?"}: {p.problem}
                </div>
              ))
            )
          }
        />
      )}
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder={tr("Lọc theo bảng")}
          style={{ width: 280 }}
          options={TABLES.map((t) => ({ value: t, label: t }))}
          onChange={(t?: string) => setFilters(t ? [{ field: "table_name", operator: "eq", value: t }] : [], "replace")}
        />
      </Space>
      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        expandable={{ expandedRowRender: (r) => <DetailView id={Number(r.id)} /> }}
      >
        <Table.Column dataIndex="seq" title="#" sorter />
        <Table.Column dataIndex="created_at" title={tr("Thời điểm")} render={formatDate} />
        <Table.Column dataIndex="table_name" title={tr("Bảng")} />
        <Table.Column
          dataIndex="op"
          title={tr("Thao tác")}
          render={(op: string) => <Tag color={OP_COLOR[op]}>{op}</Tag>}
        />
        <Table.Column<Row>
          title={tr("Người thực hiện")}
          render={(_, r) => r.actor?.full_name ?? <i>{r.actor_role}</i>}
        />
        <Table.Column
          dataIndex="changed_cols"
          title={tr("Cột thay đổi")}
          responsive={["lg"]}
          render={(c: string[] | null) => c?.join(", ") ?? "—"}
        />
        <Table.Column
          dataIndex="hash"
          title="Hash"
          responsive={["xl"]}
          render={(h: string) => <Typography.Text code>{String(h).slice(2, 14)}…</Typography.Text>}
        />
      </Table>
    </List>
  );
};
