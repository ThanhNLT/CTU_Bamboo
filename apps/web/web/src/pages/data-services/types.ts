// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
/** Lĩnh vực của tập dữ liệu (máy chủ trả nhãn tiếng Việt theo schema nguồn: Mua sắm, Phê duyệt...). */
export type DomainFilter = "all" | string;

/** Mức PII: không có · đã che · có PII (cần quyền đặc biệt). */
export type PiiLevel = "none" | "masked" | "raw";

/** Tầng lưu trữ: nóng/ấm (làm mới định kỳ) · lạnh (ảnh chụp bất biến). */
export type StorageTier = "hot" | "warm" | "cold";

export type ColumnDef = { name: string; type: string; description: string; pii?: boolean };

export type QualityCheck = { name: string; passed: boolean; detail: string };

export type Dataset = {
  id: string;
  /** Tên view kỹ thuật, ví dụ lakehouse.silver.proc_purchase_request. */
  table: string;
  title: string;
  description: string;
  domain: string;
  owner: string;
  refresh: string;
  /** Số dòng của tenant đang chọn; chưa biết cho tới khi tải bản xem trước. */
  rows?: number;
  access: string;
  /** Nhãn cập nhật ("Gần thời gian thực", "Chốt 30/09/2026"). */
  updatedLabel: string;
  certified: boolean;
  pii: PiiLevel;
  piiNote?: string;
  tier: StorageTier;
  columns: ColumnDef[];
  checks: QualityCheck[];
  upstream: string[];
  downstream: string[];
  graphql: string;
  sql: string;
};

/** Bản xem trước: dòng mới nhất đã che dữ liệu cá nhân, kèm loại dữ liệu đã che. */
export type DatasetPreview = {
  totalRows: number;
  rows: Array<Record<string, unknown>>;
  masked: string[];
};

export type DetailTab = "schema" | "sample" | "usage" | "quality" | "lineage";
