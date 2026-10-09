// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { DriveFile, SortKey } from "./types";

const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** 2_400_000 → "2,4 MB" · 640_000 → "640 KB" (cơ số 1000, dấu phẩy thập phân). */
export const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  return `${num.format(value)} ${units[i]}`;
};

/** "1,8" (GB) — dùng cho "1,8 / 5 GB". */
export const formatGB = (bytes: number) => num.format(bytes / 1_000_000_000);

export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** Sắp xếp tệp; tệp bị chặn luôn nằm cuối để không lẫn với tệp dùng được. */
export const sortFiles = (files: DriveFile[], key: SortKey) =>
  [...files].sort((a, b) => {
    if (a.scan !== b.scan) return a.scan === "blocked" ? 1 : -1;
    if (key === "name") return a.name.localeCompare(b.name, "vi");
    if (key === "size") return (b.bytes ?? 0) - (a.bytes ?? 0);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
