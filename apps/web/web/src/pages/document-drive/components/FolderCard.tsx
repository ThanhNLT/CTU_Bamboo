// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Folder, Users } from "lucide-react";
import type { DriveFolder } from "../types";
import { formatBytes } from "../utils";

export const FolderCard = ({ folder, onOpen }: { folder: DriveFolder; onOpen?: (f: DriveFolder) => void }) => (
  <button
    type="button"
    onClick={() => onOpen?.(folder)}
    className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left shadow-card transition-colors hover:border-bamboo-200 hover:bg-bamboo-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
  >
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-canvas text-bamboo-700">
      <Folder className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
    <span className="min-w-0">
      <span className="block truncate text-[13.5px] font-semibold text-ink" title={folder.name}>{folder.name}</span>
      <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted">
        {folder.fileCount} tệp · {formatBytes(folder.bytes)}
        {folder.sharedWith ? (
          <>
            {" · "}
            <Users className="h-3 w-3" strokeWidth={2} aria-hidden />
            {folder.sharedWith} người
          </>
        ) : null}
      </span>
    </span>
  </button>
);

export const FolderGrid = ({ folders, onOpen }: { folders: DriveFolder[]; onOpen?: (f: DriveFolder) => void }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {folders.map((f) => <FolderCard key={f.id} folder={f} onOpen={onOpen} />)}
  </div>
);
