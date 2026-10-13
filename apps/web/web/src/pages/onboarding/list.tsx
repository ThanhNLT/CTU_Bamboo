// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hồ sơ tiếp nhận người dùng được xem: người lập, phòng nhân sự, quản lý cây đơn vị nhận người, người duyệt.

// ===== Thư viện =====
import { CreateButton, List, ShowButton, useTable } from "@refinedev/antd"; // Refine Ant Design
import type { BaseRecord } from "@refinedev/core"; // Refine
import { Input, Segmented, Space, Table, Tag, Typography } from "antd"; // Ant Design

// ===== Module nội bộ =====
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatDay } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";
import { OB_LIST } from "./queries";
import { ACCOUNT_STATUS } from "./types";

// ===== Kiểu dữ liệu =====
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

// ===== Hằng số =====
const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "CANCELLED"];

// ===== Component =====
export const OnboardingList = () => {
  const { tableProps, filters, setFilters } = useTable<Row>({
    resource: "hr_onboarding_request",
    syncWithLocation: true,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: OB_LIST },
    liveMode: "auto",
  });
  const status = (filters.find((f) => "field" in f && f.field === "status")?.value as string) ?? "ALL";

  return (
    <List title="Tiếp nhận nhân sự" headerButtons={<CreateButton>Lập hồ sơ tiếp nhận</CreateButton>}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={status}
          options={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? "Tất cả" : PR_STATUS_LABEL[s] }))}
          onChange={(v) => setFilters(v === "ALL" ? [] : [{ field: "status", operator: "eq", value: v }], "replace")}
        />
        <Input.Search
          placeholder="Tìm theo số hoặc họ tên"
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
      </Space>
      <Table {...tableProps} rowKey="id" scroll={{ x: 720 }}>
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
        <Table.Column dataIndex="full_name" title="Ứng viên" sorter />
        <Table.Column<Row>
          title="Vị trí bổ nhiệm"
          render={(_, r) =>
            r.target_position ? (
              <>
                {r.target_position.name}
                <br />
                <Typography.Text type="secondary">{r.target_position.org_unit.name}</Typography.Text>
              </>
            ) : (
              "—"
            )
          }
        />
        <Table.Column dataIndex="start_date" title="Ngày vào làm" sorter render={formatDay} responsive={["md"]} />
        <Table.Column<Row>
          dataIndex="status"
          title="Trạng thái"
          render={(s: string, r) => (
            <Space direction="vertical" size={2}>
              <StatusTag status={s} />
              {s === "APPROVED" && (
                <Tag color={ACCOUNT_STATUS[r.account_status]?.color}>{ACCOUNT_STATUS[r.account_status]?.label}</Tag>
              )}
            </Space>
          )}
        />
        <Table.Column dataIndex={["requester", "full_name"]} title="Người lập" responsive={["lg"]} />
        <Table.Column dataIndex="created_at" title="Ngày lập" sorter render={formatDate} responsive={["lg"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};
