// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ConfigProvider, Table, type TableColumnsType } from "antd";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router";
import type { DataTier, RecentRecord, RecordStatus, Tone } from "../types";
import { bambooTableTheme, Dot, Panel, PanelLink } from "../../../components/ui";

// Trạng thái luôn có chữ kèm dấu hiệu (chấm/biểu tượng), không truyền nghĩa chỉ bằng màu (UI-10).
const STATUS: Record<RecordStatus, { label: string; tone: Tone; locked?: boolean }> = {
  pending_l1: { label: "Chờ duyệt cấp 1", tone: "warning" },
  returned: { label: "Trả lại bổ sung", tone: "danger" },
  draft: { label: "Nháp", tone: "neutral" },
  approved: { label: "Đã duyệt", tone: "success" },
  archived: { label: "Lưu trữ", tone: "neutral", locked: true },
};

const TIER: Record<DataTier, { label: string; hint: string }> = {
  hot: { label: "Nóng", hint: "Dữ liệu nóng: truy cập thường xuyên" },
  warm: { label: "Ấm", hint: "Dữ liệu ấm: truy cập thỉnh thoảng" },
  cold: { label: "Lạnh", hint: "Dữ liệu lạnh: đã lưu trữ dài hạn" },
};

const StatusCell = ({ status }: { status: RecordStatus }) => {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-body">
      {s.locked ? <Lock className="h-3 w-3 text-muted" strokeWidth={2} aria-hidden /> : <Dot tone={s.tone} className="h-2 w-2" />}
      {s.label}
    </span>
  );
};

const TierTag = ({ tier }: { tier: DataTier }) => (
  <span
    title={TIER[tier].hint}
    className="inline-flex rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-body"
  >
    {TIER[tier].label}
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
  { title: "Trạng thái", dataIndex: "status", width: 160, render: (v: RecordStatus) => <StatusCell status={v} /> },
  { title: "Cập nhật", dataIndex: "updatedAt", width: 120, render: (v: string) => <span className="text-body">{v}</span> },
  { title: "Dữ liệu", dataIndex: "tier", width: 84, render: (v: DataTier) => <TierTag tier={v} /> },
];

export const RecentRecords = ({ records }: { records: RecentRecord[] }) => {
  const navigate = useNavigate();
  return (
    <Panel title="Hồ sơ gần đây" extra={<PanelLink to="/p/documents">Xem tất cả</PanelLink>} bodyClassName="px-3 pb-3">
      <ConfigProvider theme={bambooTableTheme}>
        <Table<RecentRecord>
          size="small"
          rowKey="code"
          columns={columns}
          dataSource={records}
          pagination={false}
          scroll={{ x: 680 }}
          onRow={() => ({ onClick: () => navigate("/p/documents"), style: { cursor: "pointer" } })}
        />
      </ConfigProvider>
    </Panel>
  );
};
