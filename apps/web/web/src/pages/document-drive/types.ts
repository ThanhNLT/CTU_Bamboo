// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { LucideIcon } from "lucide-react";

/** Các vùng lưu trữ ở cột trái. */
export type DriveSection = "mine" | "department" | "company" | "shared" | "recent" | "trash";

export type DriveNavItem = { key: DriveSection; label: string; icon: LucideIcon; badge?: number };

export type StorageSegment = { key: string; label: string; bytes: number; className: string };

export type DriveFolder = {
  id: string;
  name: string;
  fileCount: number;
  bytes: number;
  /** Số người được chia sẻ (nếu có). */
  sharedWith?: number;
};

/** Kết quả kiểm dịch tại biên (ClamAV). */
export type ScanResult = "clean" | "blocked";

export type DriveFile = {
  id: string;
  name: string;
  owner: string;
  /** ISO 8601 — dùng để sắp xếp. */
  updatedAt: string;
  /** Nhãn hiển thị ("10 phút trước", "Hôm qua"...). */
  updatedLabel: string;
  /** null: tệp bị chặn, không lưu nội dung. */
  bytes: number | null;
  scan: ScanResult;
};

export type SortKey = "updated" | "name" | "size";

export type UploadStatus = "uploading" | "scanning" | "clean" | "blocked";

export type UploadItem = { id: string; name: string; progress: number; status: UploadStatus };
