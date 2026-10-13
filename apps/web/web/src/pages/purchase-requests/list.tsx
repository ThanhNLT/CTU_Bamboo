// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { CreateButton, List, ShowButton, useTable } from "@refinedev/antd"; // Refine Ant Design
import type { BaseRecord } from "@refinedev/core"; // Refine
import { Input, Segmented, Space, Table, Typography } from "antd"; // Ant Design

// ===== Module nội bộ =====
import { PR_LIST } from "./queries";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatMoney } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";

// ===== Kiểu dữ liệu =====
type Row = BaseRecord & {
  doc_no: string;
  title: string;
  status: string;
  total_amount: number;
  created_at: string;
  requester?: { full_name: string };
  org_unit?: { name: string };
};

// ===== Hằng số =====
const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "CANCELLED"];

// ===== Component =====
export const PurchaseRequestList = () => {
  // Chỉ trả các đề nghị người dùng được xem (computed field can_read ở Hasura).
  const { tableProps, filters, setFilters } = useTable<Row>({
    resource: "proc_purchase_request",
    syncWithLocation: true,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: PR_LIST },
    liveMode: "auto",
  });
  const status = (filters.find((f) => "field" in f && f.field === "status")?.value as string) ?? "ALL";

  return (
    <List title="Đề nghị mua sắm" headerButtons={<CreateButton>Lập đề nghị</CreateButton>}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={status}
          options={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? "Tất cả" : PR_STATUS_LABEL[s] }))}
          onChange={(v) => setFilters(v === "ALL" ? [] : [{ field: "status", operator: "eq", value: v }], "replace")}
        />
        <Input.Search
          placeholder="Tìm theo số hoặc tiêu đề"
          allowClear
          style={{ width: 280 }}
          onSearch={(q) =>
            setFilters(
              q
                ? [
                    {
                      operator: "or",
                      value: [
                        { field: "doc_no", operator: "contains", value: q },
                        { field: "title", operator: "contains", value: q },
                      ],
                    },
                  ]
                : [],
              "replace",
            )
          }
        />
      </Space>
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex="doc_no"
          title="Số"
          sorter
          render={(v: string) => (
            <Typography.Text code style={{ whiteSpace: "nowrap" }}>
              {v}
            </Typography.Text>
          )}
        />
        <Table.Column dataIndex="title" title="Tiêu đề" />
        <Table.Column dataIndex={["requester", "full_name"]} title="Người lập" />
        <Table.Column dataIndex={["org_unit", "name"]} title="Đơn vị" responsive={["lg"]} />
        <Table.Column dataIndex="total_amount" title="Tổng tiền" align="right" sorter render={formatMoney} />
        <Table.Column dataIndex="status" title="Trạng thái" render={(s: string) => <StatusTag status={s} />} />
        <Table.Column dataIndex="created_at" title="Ngày lập" sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};
