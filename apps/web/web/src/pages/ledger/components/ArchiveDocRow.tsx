// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Eye, Lock } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import type { ArchiveDoc } from "../types";

// ===== Component =====
/** Một hồ sơ lưu trữ: ổ khóa, tên, năm · số trang, nút "Mở chỉ đọc". */
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
        {detailed ? `${doc.code} · ` : ""}Lưu trữ {doc.archivedYear} · {doc.pages} trang
        {detailed ? ` · ${doc.unit} · ${doc.access}` : ""}
      </div>
    </div>
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Mở chỉ đọc: ${doc.title}`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-canvas px-3 text-[12px] font-medium text-ink transition-colors hover:bg-bamboo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      Mở chỉ đọc
    </button>
  </div>
);
