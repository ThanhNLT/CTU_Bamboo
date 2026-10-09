// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ChevronUp, Minus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../utils/cn";
import type { UploadItem } from "../types";

const STATUS_TEXT: Record<UploadItem["status"], (i: UploadItem) => string> = {
  uploading: (i) => `${i.progress}%`,
  scanning: () => "Đang quét mã độc…",
  clean: () => "Sạch · đã lưu",
  blocked: () => "Bị chặn · mã độc",
};

const ProgressBar = ({ item }: { item: UploadItem }) => {
  if (item.status === "scanning") {
    // Sọc chạy: chưa biết thời gian quét còn lại.
    return (
      <div className="h-1.5 overflow-hidden rounded-full bg-bamboo-100">
        <div className="h-full w-full bg-[linear-gradient(45deg,var(--color-bamboo-300)_25%,var(--color-bamboo-200)_25%,var(--color-bamboo-200)_50%,var(--color-bamboo-300)_50%,var(--color-bamboo-300)_75%,var(--color-bamboo-200)_75%)] bg-[length:16px_16px] motion-safe:animate-stripes" />
      </div>
    );
  }
  const fill =
    item.status === "blocked" ? "bg-red-500" : item.status === "clean" ? "bg-bamboo-500" : "bg-bamboo-600";
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-gray-200/80"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={item.progress}
      aria-label={item.name}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${item.progress}%` }} />
    </div>
  );
};

/** Khối nổi góc dưới phải: tiến trình tải lên + quét mã độc. Ẩn khi không có tệp. */
export const UploadProgress = ({ items, onClose }: { items: UploadItem[]; onClose: () => void }) => {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;

  const pending = items.filter((i) => i.status === "uploading" || i.status === "scanning").length;
  const title = pending > 0 ? `Đang tải lên ${pending} tệp` : `Đã xử lý ${items.length} tệp`;

  return (
    <section
      aria-live="polite"
      aria-label="Tiến trình tải lên"
      className="fixed inset-x-4 bottom-4 z-30 rounded-2xl border border-line bg-white shadow-float sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[300px]"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
            aria-expanded={!collapsed}
            className="grid h-7 w-7 place-items-center rounded-full bg-canvas text-body hover:bg-gray-200/70"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          </button>
          {pending === 0 && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="grid h-7 w-7 place-items-center rounded-full bg-canvas text-body hover:bg-gray-200/70"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <ul className="m-0 max-h-[260px] list-none space-y-3 overflow-y-auto px-4 pb-4">
          {items.map((item) => (
            <li key={item.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
                <span className="min-w-0 truncate text-ink" title={item.name}>{item.name}</span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    item.status === "blocked" ? "font-medium text-red-700" : "text-muted",
                  )}
                >
                  {STATUS_TEXT[item.status](item)}
                </span>
              </div>
              <ProgressBar item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
