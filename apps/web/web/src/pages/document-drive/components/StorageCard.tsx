// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import type { StorageSegment } from "../types";
import { formatBytes } from "../utils";

// ===== Component =====
/** Dung lượng tệp sạch đã lưu (chưa có hạn mức): thanh nhiều đoạn theo loại tệp + chú thích. */
export const StorageCard = ({ segments }: { segments: StorageSegment[] }) => {
  const used = segments.reduce((sum, s) => sum + s.bytes, 0);
  const total = Math.max(used, 1);
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-labelledby="storage-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="storage-title" className="text-[14px] font-semibold text-ink">
          Dung lượng
        </h2>
        <span className="text-[12px] tabular-nums text-muted">{formatBytes(used)}</span>
      </div>

      <div
        className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-gray-200/70"
        role="img"
        aria-label={`Đã dùng ${formatBytes(used)}`}
      >
        {segments.map((s) => (
          <span key={s.key} className={cn("h-full", s.className)} style={{ width: `${(s.bytes / total) * 100}%` }} />
        ))}
      </div>

      <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[12px]">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", s.className)} aria-hidden />
            <span className="flex-1 text-body">{s.label}</span>
            <span className="tabular-nums text-muted">{formatBytes(s.bytes)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
