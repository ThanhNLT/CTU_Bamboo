// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type Domain = "process" | "production" | "health" | "security";

export type DomainFilter = "all" | Domain;

/** Mức PII: không có · đã che (k-ẩn danh) · có PII (cần quyền đặc biệt). */
export type PiiLevel = "none" | "masked" | "raw";

/** Tầng lưu trữ: nóng/ấm (làm mới định kỳ) · lạnh (ảnh chụp bất biến). */
export type StorageTier = "hot" | "warm" | "cold";

export type ColumnDef = { name: string; type: string; description: string; pii?: boolean };

export type QualityCheck = { name: string; passed: boolean; detail: string };

export type Dataset = {
  id: string;
  /** Tên bảng/view kỹ thuật, ví dụ mart.approval_daily. */
  table: string;
  title: string;
  description: string;
  domain: Domain;
  owner: string;
  refresh: string;
  rows: number;
  access: string;
  /** Nhãn cập nhật ("10 phút trước", "Chốt 30/09/2026"). */
  updatedLabel: string;
  certified: boolean;
  pii: PiiLevel;
  piiNote?: string;
  tier: StorageTier;
  columns: ColumnDef[];
  sample?: Array<Record<string, string | number>>;
  checks: QualityCheck[];
  upstream: string[];
  downstream: string[];
  graphql: string;
  sql: string;
};

export type DetailTab = "schema" | "sample" | "usage" | "quality" | "lineage";
