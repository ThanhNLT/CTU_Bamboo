/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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
import { useGo, type BaseRecord } from "@refinedev/core";
import { Button, Input, Segmented, Table } from "antd";
import { Eye } from "lucide-react";

import { StatusDot } from "../../components/StatusTag";
import { CellText, CellTitle, ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { formatDate, formatDay } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";
import { TR_LIST } from "./queries";
import { tr, trf } from "../../i18n";

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
  const total = tableProps.pagination ? tableProps.pagination.total : undefined;

  return (
    <ListPage>
      <ListPageHeader
        title={tr("Điều chuyển nội bộ")}
        description={tr("Đề nghị điều chuyển nhân sự giữa các đơn vị trong công ty")}
        actions={
          <>
            <Button size="large" onClick={() => go({ to: "/h/transfer/cross" })}>
              {tr("Liên tập đoàn")}
            </Button>
            <CreateButton size="large">{tr("Lập đề nghị điều chuyển")}</CreateButton>
          </>
        }
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
              placeholder={tr("Tìm theo số chứng từ")}
              allowClear
              style={{ width: 280 }}
              onSearch={(q) => setFilters(q ? [{ field: "doc_no", operator: "contains", value: q }] : [], "replace")}
            />
          </>
        }
      >
        <Table {...tableProps} rowKey="id" className="list-table" scroll={{ x: 820 }}>
          <Table.Column<Row>
            dataIndex="doc_no"
            title={tr("Nhân viên")}
            sorter
            render={(_, r) => (
              <CellTitle
                title={r.person?.full_name ?? "—"}
                sub={[r.doc_no, r.person?.employee_code].filter(Boolean).join(" · ")}
              />
            )}
          />
          <Table.Column<Row>
            title={tr("Từ → đến")}
            render={(_, r) => (
              <CellText
                main={`${r.source_position?.org_unit.name ?? "—"} → ${r.target_unit?.name ?? "—"}`}
                sub={r.source_position?.name}
              />
            )}
          />
          <Table.Column
            dataIndex="effective_date"
            title={tr("Ngày chuyển")}
            sorter
            responsive={["md"]}
            render={(v: string) => <span className="whitespace-nowrap tabular-nums text-body">{formatDay(v)}</span>}
          />
          <Table.Column dataIndex="status" title={tr("Trạng thái")} render={(s: string) => <StatusDot status={s} />} />
          <Table.Column<Row>
            dataIndex="created_at"
            title={tr("Người lập")}
            sorter
            responsive={["lg"]}
            render={(_, r) => <CellText main={r.requester?.full_name ?? "—"} sub={formatDate(r.created_at)} />}
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
