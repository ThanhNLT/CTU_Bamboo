// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App } from "antd";
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { UploadTargetModal } from "./components/UploadTargetModal";
import { useDriveUsage } from "./useDriveUsage";
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

  const openFolder = (id?: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id) next.set("folder", id);
      else next.delete("folder");
      return next;
    });

  const download = async (f: DriveFile) => {
    try {
      const { get_download_url } = await request<{ get_download_url: { url: string } }>(
        `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
        { a: f.id },
      );
      window.open(get_download_url.url, "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const uploadDisabledReason =
    drive.folder && drive.folderStatus && LOCKED.has(drive.folderStatus)
      ? "Chứng từ đã có kết quả, không thêm tệp được"
      : !drive.folder && drive.targets.length === 0 && !drive.loading
        ? "Bạn chưa có chứng từ nào nhận thêm tệp (lập đề nghị trước)"
        : undefined;
  const [picking, setPicking] = useState(false);
  const usage = useDriveUsage();

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-24">
      <DriveHeader
        uploadDisabledReason={uploadDisabledReason}
        onPickTarget={drive.folder ? undefined : () => setPicking(true)}
        onUpload={(list) => {
          if (!drive.folder) return;
          uploads.enqueue(list, { entityType: drive.folder.entityType, entityId: drive.folder.id });
          window.setTimeout(() => void usage.reload(), 4000);
        }}
      />
      <UploadTargetModal
        open={picking}
        targets={drive.targets}
        onCancel={() => setPicking(false)}
        onUpload={(target, list) => {
          setPicking(false);
          openFolder(target.id);
          uploads.enqueue(list, { entityType: target.entityType, entityId: target.id });
          window.setTimeout(() => void usage.reload(), 4000);
        }}
      />

      {drive.error && <Alert type="error" showIcon message="Không tải được tệp" description={drive.error} />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:sticky lg:top-[84px] lg:grid-cols-1"
          aria-label="Ổ đĩa"
        >
          <DriveSidebar
            items={DRIVE_NAV}
            active={section}
            onChange={(key) => {
              setSection(key);
              openFolder();
            }}
          />
          <StorageCard segments={drive.storage} usage={usage.data} onChanged={() => void usage.reload()} />
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
                <Link
                  to={drive.folder.to}
                  className="inline-flex items-center gap-1 text-bamboo-700 hover:underline underline-offset-2"
                >
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
