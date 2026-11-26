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

import { ConfigProvider, Table, type TableColumnsType } from "antd";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router";

import type { RecentRecord } from "../types";
import { bambooTableTheme, Dot, Panel, PanelLink } from "../../../components/ui";
import { tr } from "../../../i18n";

const StatusCell = ({ r }: { r: RecentRecord }) => (
  <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-body">
    {r.locked ? <Lock className="h-3 w-3 text-muted" strokeWidth={2} aria-hidden /> : <Dot tone={r.tone} size="md" />}
    {r.statusLabel}
  </span>
);

const KindTag = ({ kind }: { kind: string }) => (
  <span className="inline-flex whitespace-nowrap rounded-full bg-[var(--glass-well)] px-2.5 py-0.5 text-[11.5px] font-medium text-body">
    {kind}
  </span>
);

const columns: TableColumnsType<RecentRecord> = [
  {
    title: tr("Mã hồ sơ"),
    dataIndex: "code",
    width: 170,
    render: (v: string) => <span className="font-mono text-[11.5px] tracking-tight text-muted">{v}</span>,
  },
  {
    title: tr("Tiêu đề"),
    dataIndex: "title",
    ellipsis: true,
    render: (v: string) => <span className="font-medium text-ink">{v}</span>,
  },
  { title: tr("Trạng thái"), key: "status", width: 150, render: (_: unknown, r: RecentRecord) => <StatusCell r={r} /> },
  {
    title: tr("Cập nhật"),
    dataIndex: "updatedAt",
    width: 140,
    render: (v: string) => <span className="text-body">{v}</span>,
  },
  { title: tr("Loại"), dataIndex: "kind", width: 150, render: (v: string) => <KindTag kind={v} /> },
];

export const RecentRecords = ({ records }: { records: RecentRecord[] }) => {
  const navigate = useNavigate();
  return (
    <Panel
      title={tr("Hồ sơ gần đây")}
      extra={<PanelLink to="/p/records">{tr("Xem tất cả")}</PanelLink>}
      bodyClassName="px-3 pb-3"
    >
      <ConfigProvider theme={bambooTableTheme}>
        <Table<RecentRecord>
          size="small"
          rowKey="code"
          columns={columns}
          dataSource={records}
          pagination={false}
          scroll={{ x: 680 }}
          onRow={(r) => ({ onClick: () => navigate(r.to), style: { cursor: "pointer" } })}
          locale={{ emptyText: tr("Bạn chưa lập chứng từ nào.") }}
        />
      </ConfigProvider>
    </Panel>
  );
};
