/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { Eye, Lock } from "lucide-react";

import type { ArchiveDoc } from "../types";
import { formatBytes } from "../utils";
import { tr, trf } from "../../../i18n";

export const ArchiveDocRow = ({
  doc,
  detailed,
  onOpen,
}: {
  doc: ArchiveDoc;
  detailed?: boolean;
  onOpen: () => void;
}) => (
  <div className="flex items-center gap-3 py-3">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas text-muted" aria-hidden>
      <Lock className="h-4 w-4" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13.5px] font-semibold text-ink">{doc.title}</div>
      <div className="truncate text-[11.5px] text-muted">
        {detailed ? `${doc.code} · ` : ""}
        {doc.fileName} · {formatBytes(doc.sizeBytes)} {tr(" · Lưu trữ ")} {doc.archivedYear}
        {detailed ? ` · ${doc.unit} · ${doc.restricted ? tr("Hạn chế") : tr("Nội bộ")}` : ""}
      </div>
    </div>
    <button
      type="button"
      onClick={onOpen}
      aria-label={trf("Mở chỉ đọc: {0}", [doc.title])}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-canvas px-3 text-[12px] font-medium text-ink transition-colors hover:bg-bamboo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      {tr("Mở chỉ đọc")}
    </button>
  </div>
);
