// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { ConfigProvider, Table, type TableColumnsType } from "antd"; // Ant Design

// ===== Module nội bộ =====
import { bambooTableTheme, Panel } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { DriveFile } from "../types";
import { formatBytes } from "../utils";
import type { DriveView } from "./DriveToolbar";
import { FileTypeBadge } from "./FileTypeBadge";
import { ScanStatus } from "./ScanStatus";

// ===== Hằng số =====
const columns: TableColumnsType<DriveFile> = [
  {
    title: "Tên",
    dataIndex: "name",
    ellipsis: true,
    render: (name: string, f) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <FileTypeBadge name={name} />
        <span className={cn("truncate", f.scan === "clean" ? "text-ink" : "text-muted")} title={name}>
          {name}
        </span>
      </span>
    ),
  },
  {
    title: "Chủ sở hữu",
    dataIndex: "owner",
    width: 170,
    ellipsis: true,
    render: (v: string) => <span className="text-ink">{v}</span>,
  },
  {
    title: "Cập nhật",
    dataIndex: "updatedLabel",
    width: 130,
    render: (v: string) => <span className="text-muted">{v}</span>,
  },
  {
    title: "Dung lượng",
    dataIndex: "bytes",
    width: 100,
    align: "right",
    render: (v: number | null) => <span className="tabular-nums text-ink">{formatBytes(v)}</span>,
  },
  { title: "Kiểm dịch", dataIndex: "scan", width: 160, render: (v: DriveFile["scan"]) => <ScanStatus result={v} /> },
];

// ===== Component =====
const FileCardGrid = ({ files, onOpen }: { files: DriveFile[]; onOpen: (f: DriveFile) => void }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    {files.map((f) => (
      <button
        type="button"
        key={f.id}
        onClick={() => onOpen(f)}
        disabled={f.scan !== "clean"}
        title={f.scan === "clean" ? `Tải ${f.name}` : undefined}
        className="flex min-w-0 flex-col gap-3 rounded-xl border border-line p-3 text-left hover:border-bamboo-200 hover:bg-bamboo-50/30 disabled:cursor-not-allowed"
      >
        <div className="flex items-start justify-between gap-2">
          <FileTypeBadge name={f.name} size="lg" />
          <ScanStatus result={f.scan} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink" title={f.name}>
            {f.name}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-muted">
            {f.owner} · {f.updatedLabel} · {formatBytes(f.bytes)}
          </div>
        </div>
      </button>
    ))}
  </div>
);

/** Khối "Tệp": bảng (Danh sách) hoặc thẻ (Lưới), kèm tổng số tệp và dung lượng. Bấm tệp sạch để tải về. */
export const FileTable = ({
  files,
  view,
  onOpen,
  emptyText,
}: {
  files: DriveFile[];
  view: DriveView;
  onOpen: (f: DriveFile) => void;
  emptyText: string;
}) => {
  const total = files.reduce((sum, f) => sum + (f.bytes ?? 0), 0);
  return (
    <Panel
      title="Tệp"
      extra={
        <span className="text-[12px] tabular-nums text-muted">
          {files.length} tệp · {formatBytes(total)}
        </span>
      }
      bodyClassName={view === "list" ? "px-3 pb-3" : undefined}
    >
      {view === "list" ? (
        <ConfigProvider theme={bambooTableTheme}>
          <Table<DriveFile>
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={files}
            pagination={false}
            scroll={{ x: 720 }}
            rowClassName={(f) => (f.scan === "clean" ? "cursor-pointer" : "cursor-not-allowed")}
            onRow={(f) => ({ onClick: () => f.scan === "clean" && onOpen(f) })}
            locale={{ emptyText }}
          />
        </ConfigProvider>
      ) : files.length ? (
        <FileCardGrid files={files} onOpen={onOpen} />
      ) : (
        <p className="py-6 text-center text-[13px] text-muted">{emptyText}</p>
      )}
    </Panel>
  );
};
