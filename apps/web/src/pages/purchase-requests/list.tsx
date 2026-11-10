import { CreateButton, List, ShowButton, useTable } from "@refinedev/antd";
import type { BaseRecord } from "@refinedev/core";
import { Input, Segmented, Space, Table, Typography } from "antd";

import { PR_LIST } from "./queries";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatMoney } from "../../utils/format";
import { PR_STATUS_LABEL } from "../../utils/status";
import { tr } from "../../i18n";

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

  return (
    <List title={tr("Đề nghị mua sắm")} headerButtons={<CreateButton>{tr("Lập đề nghị")}</CreateButton>}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={status}
          options={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? tr("Tất cả") : PR_STATUS_LABEL[s] }))}
          onChange={(v) => setFilters(v === "ALL" ? [] : [{ field: "status", operator: "eq", value: v }], "replace")}
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
        <Table.Column dataIndex="title" title={tr("Tiêu đề")} />
        <Table.Column dataIndex={["requester", "full_name"]} title={tr("Người lập")} />
        <Table.Column dataIndex={["org_unit", "name"]} title={tr("Đơn vị")} responsive={["lg"]} />
        <Table.Column dataIndex="total_amount" title={tr("Tổng tiền")} align="right" sorter render={formatMoney} />
        <Table.Column dataIndex="status" title={tr("Trạng thái")} render={(s: string) => <StatusTag status={s} />} />
        <Table.Column dataIndex="created_at" title={tr("Ngày lập")} sorter render={formatDate} responsive={["md"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};
