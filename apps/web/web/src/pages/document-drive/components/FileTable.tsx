// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ConfigProvider, Popconfirm, Table, type TableColumnsType } from "antd";
import { Trash2 } from "lucide-react";

import { bambooTableTheme, Panel } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { DriveFile } from "../types";
import { formatBytes } from "../utils";
import type { DriveView } from "./DriveToolbar";
import { FileTypeBadge } from "./FileTypeBadge";
import { ScanStatus } from "./ScanStatus";

type DeleteProps = { me: string; onDelete: (f: DriveFile) => void };

const canDelete = (f: DriveFile, me: string) => f.ownerId === me && !f.locked;

const DeleteButton = ({ file, onDelete }: { file: DriveFile; onDelete: (f: DriveFile) => void }) => (
  <Popconfirm
    title="Xóa tệp này?"
    description="Tệp bị xóa khỏi chứng từ và kho lưu trữ."
    okText="Xóa"
    okButtonProps={{ danger: true }}
    cancelText="Không"
    onConfirm={() => onDelete(file)}
  >
    <button
      type="button"
      aria-label={`Xóa ${file.name}`}
      title="Xóa tệp"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  </Popconfirm>
);

const baseColumns: TableColumnsType<DriveFile> = [
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

const columnsFor = ({ me, onDelete }: DeleteProps): TableColumnsType<DriveFile> => [
  ...baseColumns,
  {
    key: "actions",
    width: 52,
    align: "center",
    render: (_, f) => (canDelete(f, me) ? <DeleteButton file={f} onDelete={onDelete} /> : null),
  },
];

const FileCardGrid = ({
  files,
  onOpen,
  me,
  onDelete,
}: { files: DriveFile[]; onOpen: (f: DriveFile) => void } & DeleteProps) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    {files.map((f) => (
      <div key={f.id} className="relative">
        <button
          type="button"
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
            <div className="mt-0.5 truncate pr-8 text-[11.5px] text-muted">
              {f.owner} · {f.updatedLabel} · {formatBytes(f.bytes)}
            </div>
          </div>
        </button>
        {canDelete(f, me) && (
          <div className="absolute bottom-2 right-2">
            <DeleteButton file={f} onDelete={onDelete} />
          </div>
        )}
      </div>
    ))}
  </div>
);

export const FileTable = ({
  files,
  view,
  onOpen,
  emptyText,
  me,
  onDelete,
}: {
  files: DriveFile[];
  view: DriveView;
  onOpen: (f: DriveFile) => void;
  emptyText: string;
} & DeleteProps) => {
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
            columns={columnsFor({ me, onDelete })}
            dataSource={files}
            pagination={false}
            scroll={{ x: 720 }}
            rowClassName={(f) => (f.scan === "clean" ? "cursor-pointer" : "cursor-not-allowed")}
            onRow={(f) => ({ onClick: () => f.scan === "clean" && onOpen(f) })}
            locale={{ emptyText }}
          />
        </ConfigProvider>
      ) : files.length ? (
        <FileCardGrid files={files} onOpen={onOpen} me={me} onDelete={onDelete} />
      ) : (
        <p className="py-6 text-center text-[13px] text-muted">{emptyText}</p>
      )}
    </Panel>
  );
};
