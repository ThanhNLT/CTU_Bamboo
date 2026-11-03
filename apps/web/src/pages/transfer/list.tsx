// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { CreateButton, List, ShowButton, useTable } from "@refinedev/antd";
import { useGo, type BaseRecord } from "@refinedev/core";
import { Button, Input, Segmented, Space, Table, Typography } from "antd";

import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatDay } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";
import { TR_LIST } from "./queries";
import { tr } from "../../i18n";

type Row = BaseRecord & {
  doc_no: string;
  status: string;
  effective_date: string;
  created_at: string;
  person: { full_name: string; employee_code: string | null } | null;
  source_position: { name: string; org_unit: { name: string } } | null;
  target_unit: { name: string } | null;
  requester: { full_name: string } | null;
};

const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "CANCELLED"];

export const TransferList = () => {
  const go = useGo();
  const { tableProps, filters, setFilters } = useTable<Row>({
    resource: "hr_transfer_request",
    syncWithLocation: true,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: TR_LIST },
    liveMode: "auto",
  });
  const status = (filters.find((f) => "field" in f && f.field === "status")?.value as string) ?? "ALL";

  return (
    <List
      title={tr("Điều chuyển nội bộ")}
      headerButtons={
        <Space>
          <Button onClick={() => go({ to: "/h/transfer/cross" })}>{tr("Liên tập đoàn")}</Button>
          <CreateButton>{tr("Lập đề nghị điều chuyển")}</CreateButton>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={status}
          options={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? tr("Tất cả") : PR_STATUS_LABEL[s] }))}
          onChange={(v) => setFilters(v === "ALL" ? [] : [{ field: "status", operator: "eq", value: v }], "replace")}
        />
        <Input.Search
          placeholder={tr("Tìm theo số chứng từ")}
          allowClear
          style={{ width: 280 }}
          onSearch={(q) => setFilters(q ? [{ field: "doc_no", operator: "contains", value: q }] : [], "replace")}
        />
      </Space>
      <Table {...tableProps} rowKey="id" scroll={{ x: 720 }}>
        <Table.Column
          dataIndex="doc_no"
          title={tr("Số")}
          sorter
          render={(v: string) => (
            <Typography.Text code style={{ whiteSpace: "nowrap" }}>
              {v}
            </Typography.Text>
          )}
        />
        <Table.Column<Row>
          title={tr("Nhân viên")}
          render={(_, r) => (
            <>
              {r.person?.full_name ?? "—"}
              <br />
              <Typography.Text type="secondary">{r.person?.employee_code}</Typography.Text>
            </>
          )}
        />
        <Table.Column<Row>
          title={tr("Từ → đến")}
          render={(_, r) => (
            <>
              {r.source_position?.org_unit.name ?? "—"} → {r.target_unit?.name ?? "—"}
            </>
          )}
        />
        <Table.Column
          dataIndex="effective_date"
          title={tr("Ngày chuyển")}
          sorter
          render={formatDay}
          responsive={["md"]}
        />
        <Table.Column dataIndex="status" title={tr("Trạng thái")} render={(s: string) => <StatusTag status={s} />} />
        <Table.Column dataIndex={["requester", "full_name"]} title={tr("Người lập")} responsive={["lg"]} />
        <Table.Column dataIndex="created_at" title={tr("Ngày lập")} sorter render={formatDate} responsive={["lg"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};
