// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ConfigProvider, Table, type TableColumnsType } from "antd";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router";
import type { RecentRecord } from "../types";
import { bambooTableTheme, Dot, Panel, PanelLink } from "../../../components/ui";

// Trạng thái luôn có chữ kèm dấu hiệu (chấm/biểu tượng), không truyền nghĩa chỉ bằng màu (UI-10).
const StatusCell = ({ r }: { r: RecentRecord }) => (
  <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-body">
    {r.locked ? <Lock className="h-3 w-3 text-muted" strokeWidth={2} aria-hidden /> : <Dot tone={r.tone} size="md" />}
    {r.statusLabel}
  </span>
);

const KindTag = ({ kind }: { kind: string }) => (
  <span className="inline-flex whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-body">
    {kind}
  </span>
);

const columns: TableColumnsType<RecentRecord> = [
  {
    title: "Mã hồ sơ",
    dataIndex: "code",
    width: 170,
    render: (v: string) => <span className="font-mono text-[11.5px] tracking-tight text-muted">{v}</span>,
  },
  {
    title: "Tiêu đề",
    dataIndex: "title",
    ellipsis: true,
    render: (v: string) => <span className="font-medium text-ink">{v}</span>,
  },
  { title: "Trạng thái", key: "status", width: 150, render: (_: unknown, r: RecentRecord) => <StatusCell r={r} /> },
  { title: "Cập nhật", dataIndex: "updatedAt", width: 140, render: (v: string) => <span className="text-body">{v}</span> },
  { title: "Loại", dataIndex: "kind", width: 150, render: (v: string) => <KindTag kind={v} /> },
];

export const RecentRecords = ({ records }: { records: RecentRecord[] }) => {
  const navigate = useNavigate();
  return (
    <Panel title="Hồ sơ gần đây" extra={<PanelLink to="/p/records">Xem tất cả</PanelLink>} bodyClassName="px-3 pb-3">
      <ConfigProvider theme={bambooTableTheme}>
        <Table<RecentRecord>
          size="small"
          rowKey="code"
          columns={columns}
          dataSource={records}
          pagination={false}
          scroll={{ x: 680 }}
          onRow={(r) => ({ onClick: () => navigate(r.to), style: { cursor: "pointer" } })}
          locale={{ emptyText: "Bạn chưa lập chứng từ nào." }}
        />
      </ConfigProvider>
    </Panel>
  );
};
