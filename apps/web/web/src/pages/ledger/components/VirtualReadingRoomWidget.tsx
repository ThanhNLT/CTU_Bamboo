// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import { READING_ROOM_RULES } from "../mock";
import type { ArchiveDoc } from "../types";
import { ArchiveDocRow } from "./ArchiveDocRow";

// ===== Component =====
/** Thẻ Phòng đọc ảo (tab Đối soát): vài hồ sơ lưu trữ hay dùng, mở ở chế độ chỉ đọc. */
export const VirtualReadingRoomWidget = ({
  docs,
  onOpen,
  onShowAll,
}: {
  docs: ArchiveDoc[];
  onOpen: (doc: ArchiveDoc) => void;
  onShowAll: () => void;
}) => (
  <section className="rounded-2xl border border-line bg-white p-5 shadow-card" aria-label="Phòng đọc ảo">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">Phòng đọc ảo</h2>
      <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[11.5px] font-medium text-body">
        Chỉ đọc
      </span>
    </div>
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
        Tất cả hồ sơ lưu trữ
      </button>
    </div>
  </section>
);
