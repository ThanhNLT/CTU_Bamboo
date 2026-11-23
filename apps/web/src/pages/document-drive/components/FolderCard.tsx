/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import { Folder, Users } from "lucide-react";

import { PARA_LABEL } from "../nav";
import type { DriveFolder } from "../types";
import { formatBytes } from "../utils";
import { tr } from "../../../i18n";

export const FolderCard = ({ folder, onOpen }: { folder: DriveFolder; onOpen?: (f: DriveFolder) => void }) => (
  <button
    type="button"
    onClick={() => onOpen?.(folder)}
    className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-bamboo-200 hover:bg-bamboo-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
  >
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-canvas text-bamboo-700">
      <Folder className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
    <span className="min-w-0">
      <span className="block truncate text-[13.5px] font-semibold text-ink" title={folder.name}>
        {folder.name}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted">
        {folder.fileCount} {tr(" tệp · ")} {formatBytes(folder.bytes)}
        {folder.para ? ` · ${PARA_LABEL[folder.para]}` : null}
        {folder.sharedWith ? (
          <>
            {" · "}
            <Users className="h-3 w-3" strokeWidth={2} aria-hidden />
            {folder.sharedWith} {tr(" người")}
          </>
        ) : null}
      </span>
    </span>
  </button>
);

export const FolderGrid = ({ folders, onOpen }: { folders: DriveFolder[]; onOpen?: (f: DriveFolder) => void }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {folders.map((f) => (
      <FolderCard key={f.id} folder={f} onOpen={onOpen} />
    ))}
  </div>
);
