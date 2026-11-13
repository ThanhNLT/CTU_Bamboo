/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import type { ArchiveDoc } from "../types";
import { READING_ROOM_RULES } from "../utils";
import { ArchiveDocRow } from "./ArchiveDocRow";
import { tr } from "../../../i18n";

export const VirtualReadingRoomWidget = ({
  docs,
  onOpen,
  onShowAll,
}: {
  docs: ArchiveDoc[];
  onOpen: (doc: ArchiveDoc) => void;
  onShowAll: () => void;
}) => (
  <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label={tr("Phòng đọc ảo")}>
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{tr("Phòng đọc ảo")}</h2>
      <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[11.5px] font-medium text-body">
        {tr("Chỉ đọc")}
      </span>
    </div>
    {docs.length === 0 && (
      <p className="py-4 text-[12.5px] text-muted">{tr("Chưa có chứng từ đã kết thúc nào có tệp đính kèm.")}</p>
    )}
    <div className="mt-1 divide-y divide-line">
      {docs.map((d) => (
        <ArchiveDocRow key={d.id} doc={d} onOpen={() => onOpen(d)} />
      ))}
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
      <span>{READING_ROOM_RULES}</span>
      <button
        type="button"
        onClick={onShowAll}
        className="font-semibold text-bamboo-700 underline-offset-2 hover:underline"
      >
        {tr("Tất cả hồ sơ lưu trữ")}
      </button>
    </div>
  </section>
);
