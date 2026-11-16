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

import { ShowButton, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Segmented, Table } from "antd";
import { Eye } from "lucide-react";

import { IC_LIST } from "./queries";
import { StatusDot } from "../../components/StatusTag";
import { CellText, CellTitle, ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { formatDate, formatMoney } from "../../utils/format";
import { IC_STATUS_LABEL } from "../../utils/status";
import { tr, trf } from "../../i18n";

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
  const total = tableProps.pagination ? tableProps.pagination.total : undefined;

  return (
    <ListPage>
      <ListPageHeader title={tr("Đơn hàng nội bộ")} description={tr("Đơn đặt hàng giữa các công ty trong tập đoàn")} />
      <ListCard
        title={tr("Danh sách đơn hàng")}
        meta={total !== undefined ? trf("{0} đơn hàng", [total]) : undefined}
        toolbar={
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
        }
      >
        <Table {...tableProps} rowKey="id" className="list-table" scroll={{ x: 820 }}>
          <Table.Column<Row>
            dataIndex="doc_no"
            title={tr("Đơn hàng")}
            sorter
            render={(_, r) => (
              <CellTitle title={`${r.buyer_unit?.name ?? "—"} → ${r.seller_unit?.name ?? "—"}`} sub={r.doc_no} />
            )}
          />
          <Table.Column<Row>
            title={tr("Người đặt")}
            responsive={["lg"]}
            render={(_, r) => <CellText main={r.created_by_person?.full_name ?? "—"} sub={r.buyer_unit?.name} />}
          />
          <Table.Column
            dataIndex="total_amount"
            title={tr("Tổng tiền")}
            align="right"
            sorter
            render={(v: number) => <span className="whitespace-nowrap tabular-nums text-ink">{formatMoney(v)}</span>}
          />
          <Table.Column
            dataIndex="status"
            title={tr("Trạng thái")}
            render={(s: string) => <StatusDot status={s} labels={IC_STATUS_LABEL} />}
          />
          <Table.Column
            dataIndex="created_at"
            title={tr("Ngày đặt")}
            sorter
            responsive={["md"]}
            render={(v: string) => <span className="whitespace-nowrap tabular-nums text-body">{formatDate(v)}</span>}
          />
          <Table.Column<Row>
            title={<span className="sr-only">{tr("Thao tác")}</span>}
            align="right"
            width={56}
            render={(_, r) => (
              <ShowButton
                hideText
                type="text"
                shape="circle"
                icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
                recordItemId={r.id}
                aria-label={trf("Xem {0}", [r.doc_no])}
              />
            )}
          />
        </Table>
      </ListCard>
    </ListPage>
  );
};
