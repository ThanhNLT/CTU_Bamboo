/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { List, ShowButton, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Segmented, Space, Table, Typography } from "antd";

import { IC_LIST } from "./queries";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatMoney } from "../../utils/format";
import { IC_STATUS_LABEL } from "../../utils/status";
import { tr } from "../../i18n";

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
    <List title={tr("Đơn hàng nội bộ")}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={value}
          options={FILTERS.map((s) => ({
            value: s,
            label: s === "ALL" ? tr("Tất cả") : s === "MINE" ? tr("Chờ tôi xác nhận") : IC_STATUS_LABEL[s],
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
          title={tr("Số")}
          sorter
          render={(v: string) => (
            <Typography.Text code style={{ whiteSpace: "nowrap" }}>
              {v}
            </Typography.Text>
          )}
        />
        <Table.Column dataIndex={["buyer_unit", "name"]} title={tr("Bên mua")} />
        <Table.Column dataIndex={["seller_unit", "name"]} title={tr("Bên bán")} />
        <Table.Column dataIndex={["created_by_person", "full_name"]} title={tr("Người đặt")} responsive={["lg"]} />
        <Table.Column dataIndex="total_amount" title={tr("Tổng tiền")} align="right" sorter render={formatMoney} />
        <Table.Column
          dataIndex="status"
          title={tr("Trạng thái")}
          render={(s: string) => <StatusTag status={s} labels={IC_STATUS_LABEL} />}
        />
        <Table.Column dataIndex="created_at" title={tr("Ngày đặt")} sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};
