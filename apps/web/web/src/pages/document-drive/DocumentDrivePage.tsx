// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Ổ đĩa tài liệu (Con người số): cột trái chọn vùng lưu trữ + dung lượng; cột phải là thư mục và tệp
// của thư mục đang mở; khối nổi góc dưới hiển thị tiến trình tải lên/kiểm dịch. Dữ liệu minh họa ở ./mock.
import { App } from "antd";
import { useMemo, useState } from "react";
import { DriveHeader } from "./components/DriveHeader";
import { DriveSidebar } from "./components/DriveSidebar";
import { DriveToolbar, type DriveView } from "./components/DriveToolbar";
import { FileTable } from "./components/FileTable";
import { FolderGrid } from "./components/FolderCard";
import { NewFolderModal } from "./components/NewFolderModal";
import { StorageCard } from "./components/StorageCard";
import { UploadProgress } from "./components/UploadProgress";
import {
  CURRENT_FOLDER, DRIVE_NAV, MOCK_FILES, MOCK_FOLDERS, MOCK_UPLOADS, STORAGE_QUOTA, STORAGE_SEGMENTS,
} from "./mock";
import type { DriveFolder, DriveSection, SortKey } from "./types";
import { useUploadQueue } from "./useUploadQueue";
import { sortFiles } from "./utils";

export const DocumentDrivePage = () => {
  const { message } = App.useApp();
  const [section, setSection] = useState<DriveSection>("mine");
  const [subPath, setSubPath] = useState<string[]>([CURRENT_FOLDER]);
  const [view, setView] = useState<DriveView>("list");
  const [sort, setSort] = useState<SortKey>("updated");
  const [folders, setFolders] = useState<DriveFolder[]>(MOCK_FOLDERS);
  const [creating, setCreating] = useState(false);
  const uploads = useUploadQueue(MOCK_UPLOADS);

  const sectionLabel = DRIVE_NAV.find((n) => n.key === section)?.label ?? "";
  const files = useMemo(() => sortFiles(MOCK_FILES, sort), [sort]);

  const changeSection = (key: DriveSection) => {
    setSection(key);
    setSubPath([]);
  };

  const openFolder = (f: DriveFolder) => {
    setSubPath((p) => [...p, f.name]);
    message.info(`Đã mở "${f.name}" (dữ liệu minh họa: nội dung chưa đổi).`);
  };

  const createFolder = (name: string) => {
    setFolders((prev) => [{ id: `new-${Date.now()}`, name, fileCount: 0, bytes: 0 }, ...prev]);
    setCreating(false);
    message.success(`Đã tạo thư mục "${name}".`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-24">
      <DriveHeader onNewFolder={() => setCreating(true)} onUpload={uploads.enqueue} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:sticky lg:top-[84px] lg:grid-cols-1" aria-label="Ổ đĩa">
          <DriveSidebar items={DRIVE_NAV} active={section} onChange={changeSection} />
          <StorageCard segments={STORAGE_SEGMENTS} quota={STORAGE_QUOTA} />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <DriveToolbar
            path={[sectionLabel, ...subPath]}
            view={view}
            onViewChange={setView}
            sort={sort}
            onSortChange={setSort}
          />
          <FolderGrid folders={folders} onOpen={openFolder} />
          <FileTable files={files} view={view} />
        </div>
      </div>

      <UploadProgress items={uploads.items} onClose={uploads.clearFinished} />

      <NewFolderModal
        open={creating}
        existing={folders.map((f) => f.name)}
        onCancel={() => setCreating(false)}
        onCreate={createFolder}
      />
    </div>
  );
};

export default DocumentDrivePage;
