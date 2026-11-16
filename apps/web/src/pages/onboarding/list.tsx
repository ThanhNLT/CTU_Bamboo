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

import { CreateButton, ShowButton, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Input, Segmented, Table } from "antd";
import { Eye } from "lucide-react";

import { StatusDot } from "../../components/StatusTag";
import { CellText, CellTitle, DotLabel, ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { formatDate, formatDay } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";
import { OB_LIST } from "./queries";
import { ACCOUNT_STATUS } from "./types";
import { tr, trf } from "../../i18n";

type Row = BaseRecord & {
  doc_no: string;
  full_name: string;
  status: string;
  account_status: string;
  start_date: string;
  created_at: string;
  requester?: { full_name: string };
  target_position?: { name: string; org_unit: { name: string } };
};

const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "CANCELLED"];

const TAG_DOT: Record<string, string> = {
  green: "bg-bamboo-500",
  success: "bg-bamboo-500",
  blue: "bg-sky-500",
  processing: "bg-sky-500",
  orange: "bg-orange-500",
  gold: "bg-amber-500",
  warning: "bg-amber-500",
  red: "bg-red-500",
  error: "bg-red-500",
};

export const OnboardingList = () => {
  const { tableProps, filters, setFilters } = useTable<Row>({
    resource: "hr_onboarding_request",
    syncWithLocation: true,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: OB_LIST },
    liveMode: "auto",
  });
  const status = (filters.find((f) => "field" in f && f.field === "status")?.value as string) ?? "ALL";
  const total = tableProps.pagination ? tableProps.pagination.total : undefined;

  return (
    <ListPage>
      <ListPageHeader
        title={tr("Tiếp nhận nhân sự")}
        description={tr("Hồ sơ tiếp nhận nhân sự mới và đề xuất bổ nhiệm vị trí")}
        actions={<CreateButton size="large">{tr("Lập hồ sơ tiếp nhận")}</CreateButton>}
      />
      <ListCard
        title={tr("Danh sách hồ sơ")}
        meta={total !== undefined ? trf("{0} hồ sơ", [total]) : undefined}
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
              placeholder={tr("Tìm theo số hoặc họ tên")}
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
                            { field: "full_name", operator: "contains", value: q },
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
            dataIndex="full_name"
            title={tr("Ứng viên")}
            sorter
            render={(_, r) => <CellTitle title={r.full_name} sub={r.doc_no} />}
          />
          <Table.Column<Row>
            title={tr("Vị trí bổ nhiệm")}
            render={(_, r) =>
              r.target_position ? (
                <CellText main={r.target_position.name} sub={r.target_position.org_unit.name} />
              ) : (
                <span className="text-muted">—</span>
              )
            }
          />
          <Table.Column
            dataIndex="start_date"
            title={tr("Ngày vào làm")}
            sorter
            responsive={["md"]}
            render={(v: string) => <span className="whitespace-nowrap tabular-nums text-body">{formatDay(v)}</span>}
          />
          <Table.Column<Row>
            dataIndex="status"
            title={tr("Trạng thái")}
            render={(s: string, r) => {
              const account = s === "APPROVED" ? ACCOUNT_STATUS[r.account_status] : undefined;
              return (
                <span className="flex flex-col items-start">
                  <StatusDot status={s} />
                  {account && (
                    <DotLabel dot={TAG_DOT[account.color ?? ""] ?? "bg-gray-400"} label={account.label} muted />
                  )}
                </span>
              );
            }}
          />
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
