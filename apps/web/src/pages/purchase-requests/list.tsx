/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { CreateButton, ShowButton, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Input, Segmented, Table } from "antd";
import { Eye } from "lucide-react";

import { PR_LIST } from "./queries";
import { StatusDot } from "../../components/StatusTag";
import { CellText, CellTitle, ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { formatDate, formatMoney } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";
import { tr, trf } from "../../i18n";

type Row = BaseRecord & {
  doc_no: string;
  title: string;
  status: string;
  total_amount: number;
  created_at: string;
  requester?: { full_name: string };
  org_unit?: { name: string };
};

const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "CANCELLED"];

export const PurchaseRequestList = () => {
  const { tableProps, filters, setFilters } = useTable<Row>({
    resource: "proc_purchase_request",
    syncWithLocation: true,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: PR_LIST },
    liveMode: "auto",
  });
  const status = (filters.find((f) => "field" in f && f.field === "status")?.value as string) ?? "ALL";
  const total = tableProps.pagination ? tableProps.pagination.total : undefined;

  return (
    <ListPage>
      <ListPageHeader
        title={tr("Đề nghị mua sắm")}
        description={tr("Lập, gửi duyệt và theo dõi đề nghị mua sắm của đơn vị")}
        actions={<CreateButton size="large">{tr("Lập đề nghị")}</CreateButton>}
      />
      <ListCard
        title={tr("Danh sách đề nghị")}
        meta={total !== undefined ? trf("{0} đề nghị", [total]) : undefined}
        toolbar={
          <>
            <Segmented
              value={status}
              options={STATUS_FILTERS.map((s) => ({
                value: s,
                label: s === "ALL" ? tr("Tất cả") : PR_STATUS_LABEL[s],
              }))}
              onChange={(v) =>
                setFilters(v === "ALL" ? [] : [{ field: "status", operator: "eq", value: v }], "replace")
              }
            />
            <Input.Search
              placeholder={tr("Tìm theo số hoặc tiêu đề")}
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
          </>
        }
      >
        <Table {...tableProps} rowKey="id" className="list-table" scroll={{ x: 820 }}>
          <Table.Column<Row>
            dataIndex="doc_no"
            title={tr("Đề nghị")}
            sorter
            render={(_, r) => <CellTitle title={r.title} sub={r.doc_no} />}
          />
          <Table.Column<Row>
            title={tr("Người lập")}
            render={(_, r) => <CellText main={r.requester?.full_name ?? "—"} sub={r.org_unit?.name} />}
          />
          <Table.Column
            dataIndex="total_amount"
            title={tr("Tổng tiền")}
            align="right"
            sorter
            render={(v: number) => <span className="whitespace-nowrap tabular-nums text-ink">{formatMoney(v)}</span>}
          />
          <Table.Column dataIndex="status" title={tr("Trạng thái")} render={(s: string) => <StatusDot status={s} />} />
          <Table.Column
            dataIndex="created_at"
            title={tr("Ngày lập")}
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
