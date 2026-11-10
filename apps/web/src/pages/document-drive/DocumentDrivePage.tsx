/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

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
import { DRIVE_NAV, PARA_NAV } from "./nav";
import type { DriveFile, DriveSection, SortKey } from "./types";
import { useDrive } from "./useDrive";
import { useUploadQueue } from "./useUploadQueue";
import { sortFiles } from "./utils";
import { tr, trf } from "../../i18n";

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
  const sectionItem = [...DRIVE_NAV, ...PARA_NAV].find((n) => n.key === section);
  const sectionLabel = sectionItem?.label ?? "";
  const paraNav = PARA_NAV.map((n) => ({ ...n, badge: drive.paraCounts[n.key] }));

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

  const remove = async (f: DriveFile) => {
    try {
      await request(`mutation Del($a: uuid!) { delete_attachment(attachment_id: $a) { status } }`, { a: f.id });
      message.success(trf("Đã xóa {0}", [f.name]));
      drive.reload();
      void usage.reload();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const uploadDisabledReason =
    drive.folder && drive.folderStatus && LOCKED.has(drive.folderStatus)
      ? tr("Chứng từ đã có kết quả, không thêm tệp được")
      : !drive.folder && drive.targets.length === 0 && !drive.loading
        ? tr("Bạn chưa có chứng từ nào nhận thêm tệp (lập đề nghị trước)")
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

      {drive.error && <Alert type="error" showIcon message={tr("Không tải được tệp")} description={drive.error} />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:sticky lg:top-[84px] lg:grid-cols-1"
          aria-label={tr("Ổ đĩa")}
        >
          <DriveSidebar
            items={DRIVE_NAV}
            active={section}
            onChange={(key) => {
              setSection(key);
              openFolder();
            }}
          />
          <DriveSidebar
            title={tr("P.A.R.A")}
            items={paraNav}
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
          {!drive.folder && sectionItem?.hint && <p className="-mt-1 text-[12.5px] text-muted">{sectionItem.hint}</p>}
          {drive.folder ? (
            <p className="-mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
              {drive.folderHint}
              {drive.folder.to && (
                <Link
                  to={drive.folder.to}
                  className="inline-flex items-center gap-1 text-bamboo-700 hover:underline underline-offset-2"
                >
                  {tr("Mở chứng từ ")} <ExternalLink className="h-3 w-3" aria-hidden />
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
            me={tenant.person_id}
            onDelete={(f) => void remove(f)}
            emptyText={
              drive.loading
                ? tr("Đang tải…")
                : section === "mine"
                  ? tr("Bạn chưa tải lên tệp nào.")
                  : tr("Không có tệp.")
            }
          />
        </div>
      </div>

      <UploadProgress items={uploads.items} onClose={uploads.clearFinished} />
    </div>
  );
};

export default DocumentDrivePage;
