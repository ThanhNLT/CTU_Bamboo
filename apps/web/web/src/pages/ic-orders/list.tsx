// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { List, ShowButton, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Segmented, Space, Table, Typography } from "antd";

import { IC_LIST } from "./queries";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatMoney } from "../../utils/format";
import { IC_STATUS_LABEL } from "../../utils/status";

type Row = BaseRecord & {
  doc_no: string;
  status: string;
  total_amount: number;
  created_at: string;
  can_confirm: boolean;
  seller_unit?: { name: string };
  buyer_unit?: { name: string };
  created_by_person?: { full_name: string };
};

const FILTERS = ["ALL", "MINE", "PENDING", "CONFIRMED", "REJECTED", "CANCELLED"];

export const IcOrderList = () => {
  const { tableProps, filters, setFilters } = useTable<Row>({
    resource: "ic_ic_order",
    syncWithLocation: true,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: IC_LIST },
    liveMode: "auto",
  });
  const current = filters.find((f) => "field" in f && (f.field === "status" || f.field === "can_confirm"));
  const value = !current
    ? "ALL"
    : "field" in current && current.field === "can_confirm"
      ? "MINE"
      : (current.value as string);

  return (
    <List title="Đơn hàng nội bộ">
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={value}
          options={FILTERS.map((s) => ({
            value: s,
            label: s === "ALL" ? "Tất cả" : s === "MINE" ? "Chờ tôi xác nhận" : IC_STATUS_LABEL[s],
          }))}
          onChange={(v) =>
            setFilters(
              v === "ALL"
                ? []
                : v === "MINE"
                  ? [{ field: "can_confirm", operator: "eq", value: true }]
                  : [{ field: "status", operator: "eq", value: v }],
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
        <Table.Column dataIndex={["buyer_unit", "name"]} title="Bên mua" />
        <Table.Column dataIndex={["seller_unit", "name"]} title="Bên bán" />
        <Table.Column dataIndex={["created_by_person", "full_name"]} title="Người đặt" responsive={["lg"]} />
        <Table.Column dataIndex="total_amount" title="Tổng tiền" align="right" sorter render={formatMoney} />
        <Table.Column
          dataIndex="status"
          title="Trạng thái"
          render={(s: string) => <StatusTag status={s} labels={IC_STATUS_LABEL} />}
        />
        <Table.Column dataIndex="created_at" title="Ngày đặt" sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};
