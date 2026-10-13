// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import type { LucideIcon } from "lucide-react"; // Lucide React

// ===== Kiểu dữ liệu =====
/** Các vùng ở cột trái: tệp tôi tải lên · mọi tệp tôi được xem · tệp 7 ngày gần đây. */
export type DriveSection = "mine" | "all" | "recent";

export type DriveNavItem = { key: DriveSection; label: string; icon: LucideIcon; badge?: number };

export type StorageSegment = { key: string; label: string; bytes: number; className: string };

/** Thư mục = một chứng từ có tệp đính kèm (backend không có thư mục tự do: tệp luôn gắn với chứng từ). */
export type DriveFolder = {
  /** entity_id của chứng từ. */
  id: string;
  name: string;
  /** "proc.purchase_request" | "hr.onboarding_request" — dùng khi tải tệp vào thư mục. */
  entityType: string;
  /** Trang chi tiết chứng từ. */
  to?: string;
  fileCount: number;
  bytes: number;
  /** Số người được chia sẻ (nếu có). */
  sharedWith?: number;
};

/** Kết quả kiểm dịch tại biên (ClamAV): sạch · nhiễm mã độc · bị loại (sai định dạng) · đang kiểm tra. */
export type ScanResult = "clean" | "infected" | "rejected" | "pending";

export type DriveFile = {
  id: string;
  name: string;
  owner: string;
  ownerId: string;
  /** Chứng từ chứa tệp. */
  entityId: string;
  contentType: string;
  /** ISO 8601 — dùng để sắp xếp. */
  updatedAt: string;
  /** Nhãn hiển thị ("10 phút trước", "Hôm qua"...). */
  updatedLabel: string;
  bytes: number | null;
  scan: ScanResult;
};

export type SortKey = "updated" | "name" | "size";

export type UploadStatus = "uploading" | "scanning" | "clean" | "blocked";

export type UploadItem = {
  id: string;
  name: string;
  progress: number;
  status: UploadStatus;
  /** Lý do khi bị chặn / lỗi (thông điệp của máy chủ). */
  error?: string;
};
