// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Ổ đĩa tài liệu (Con người số): cột trái chọn vùng + dung lượng; cột phải là thư mục (mỗi chứng từ có tệp là một
// thư mục) và tệp. Dữ liệu thật qua ./useDrive; tải lên thật qua ./useUploadQueue vào chứng từ đang mở.
// ?folder=<id chứng từ> trên URL mở sẵn một thư mục.
import { Alert, App } from "antd";
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { DriveHeader } from "./components/DriveHeader";
import { DriveSidebar } from "./components/DriveSidebar";
import { DriveToolbar, type DriveView } from "./components/DriveToolbar";
import { FileTable } from "./components/FileTable";
import { FolderGrid } from "./components/FolderCard";
import { StorageCard } from "./components/StorageCard";
import { UploadProgress } from "./components/UploadProgress";
import { DRIVE_NAV } from "./nav";
import type { DriveFile, DriveSection, SortKey } from "./types";
import { useDrive } from "./useDrive";
import { useUploadQueue } from "./useUploadQueue";
import { sortFiles } from "./utils";

// Chứng từ đã có kết quả thì không nhận thêm tệp (máy chủ cũng chặn).
const LOCKED = new Set(["APPROVED", "REJECTED", "CANCELLED"]);

export const DocumentDrivePage = () => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [params, setParams] = useSearchParams();
  const [section, setSection] = useState<DriveSection>("all");
  const [view, setView] = useState<DriveView>("list");
  const [sort, setSort] = useState<SortKey>("updated");
  const uploads = useUploadQueue();

  const folderId = params.get("folder") ?? undefined;
  const drive = useDrive(section, tenant.person_id, folderId);
  const files = useMemo(() => sortFiles(drive.files, sort), [drive.files, sort]);
  const sectionLabel = DRIVE_NAV.find((n) => n.key === section)?.label ?? "";

  const openFolder = (id?: string) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (id) next.set("folder", id);
    else next.delete("folder");
    return next;
  });

  const download = async (f: DriveFile) => {
    try {
      const { get_download_url } = await request<{ get_download_url: { url: string } }>(
        `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`, { a: f.id });
      window.open(get_download_url.url, "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const uploadDisabledReason = !drive.folder
    ? "Mở thư mục của một chứng từ để tải tệp vào"
    : drive.folderStatus && LOCKED.has(drive.folderStatus) ? "Chứng từ đã có kết quả, không thêm tệp được" : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-24">
      <DriveHeader
        uploadDisabledReason={uploadDisabledReason}
        onUpload={(list) => drive.folder && uploads.enqueue(list, { entityType: drive.folder.entityType, entityId: drive.folder.id })}
      />

      {drive.error && <Alert type="error" showIcon message="Không tải được tệp" description={drive.error} />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:sticky lg:top-[84px] lg:grid-cols-1" aria-label="Ổ đĩa">
          <DriveSidebar items={DRIVE_NAV} active={section} onChange={(key) => { setSection(key); openFolder(); }} />
          <StorageCard segments={drive.storage} />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <DriveToolbar
            path={drive.folder ? [sectionLabel, drive.folder.name] : [sectionLabel]}
            onCrumb={() => openFolder()}
            view={view}
            onViewChange={setView}
            sort={sort}
            onSortChange={setSort}
          />
          {drive.folder ? (
            <p className="-mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
              {drive.folderHint}
              {drive.folder.to && (
                <Link to={drive.folder.to} className="inline-flex items-center gap-1 text-bamboo-700 hover:underline underline-offset-2">
                  Mở chứng từ <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </p>
          ) : (
            drive.folders.length > 0 && <FolderGrid folders={drive.folders} onOpen={(f) => openFolder(f.id)} />
          )}
          <FileTable
            files={files}
            view={view}
            onOpen={(f) => void download(f)}
            emptyText={drive.loading ? "Đang tải…" : section === "mine" ? "Bạn chưa tải lên tệp nào." : "Không có tệp."}
          />
        </div>
      </div>

      <UploadProgress items={uploads.items} onClose={uploads.clearFinished} />
    </div>
  );
};

export default DocumentDrivePage;
