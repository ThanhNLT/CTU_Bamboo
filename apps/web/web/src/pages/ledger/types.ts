// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
/**
 * Một bản niêm phong (ADR #46): SHA-256 của một tệp đính kèm ghi lúc tệp được nhận, nằm trong chuỗi hash của
 * nhật ký kiểm toán. `block` / `txId` là số thứ tự và mã hash của dòng nhật ký đó.
 */
export type Seal = {
  attachmentId: string;
  entityType: string;
  entityId: string;
  /** Số chứng từ, ví dụ "PR-2026-000012". */
  code: string;
  /** Thứ tự tệp trong chứng từ (tệp nhận trước là v1). */
  version: number;
  title: string;
  fileName: string;
  unit: string;
  /** "03/10/2026 14:22" */
  sealedAt: string;
  /** Mã tenant (mỗi tenant một chuỗi hash). */
  channel: string;
  block: number | null;
  txId: string | null;
  sha256: string;
  lastResult: "match" | "mismatch" | "not_found" | null;
  lastCheckedAt: string | null;
};

export type VerifyVia = "code" | "file";

export type VerifyResult =
  | { kind: "match"; seal: Seal; via: VerifyVia; checkedAt: string; fileName?: string }
  | {
      kind: "mismatch";
      seal: Seal;
      actualSha256: string | null;
      problem?: string;
      via: VerifyVia;
      checkedAt: string;
      fileName?: string;
    }
  | { kind: "not_found"; query: string; via: VerifyVia; checkedAt: string; sha256?: string; fileName?: string };

export type LedgerOverview = {
  channel: string;
  sealed: number;
  sealedThisWeek: number;
  archived: number;
  checkedToday: number;
  matchedToday: number;
  mismatchedToday: number;
  mismatch30d: number;
  /** Người gọi có quyền audit.read: được kiểm tra toàn chuỗi hash. */
  chainReader: boolean;
  recent: Seal[];
};

/** Hồ sơ lưu trữ: tệp của một chứng từ đã kết thúc (duyệt, từ chối, hủy). */
export type ArchiveDoc = {
  id: string;
  code: string;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  unit: string;
  /** Hồ sơ nhân sự: chỉ người có quyền xem chứng từ. */
  restricted: boolean;
  archivedYear: number;
};

export type AccessLog = { id: string; docTitle: string; fileName: string; viewer: string; at: string };

/** Một lần mở hồ sơ ở phòng đọc: link xem trực tiếp hạn ngắn. */
export type ArchiveView = {
  attachmentId: string;
  title: string;
  fileName: string;
  contentType: string;
  viewer: string;
  openedAt: string;
  url: string;
};

export type LedgerTab = "verify" | "reading";
export type VerifyMode = "code" | "file";
