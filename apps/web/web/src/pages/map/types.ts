// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type CompanyKey = "phone" | "chip" | "appliance" | "hospital";

/** Lớp bản đồ bật/tắt được ở cột phải. */
export type LayerKey = "phone" | "chip" | "warehouse" | "hospital" | "boundary";

export type SiteStatus = "ok" | "warning" | "critical";

export type SiteAlert = { code: string; text: string; status: Exclude<SiteStatus, "ok">; age: string };

export type MapSite = {
  id: string;
  layer: Exclude<LayerKey, "boundary">;
  company: CompanyKey;
  name: string;
  address: string;
  /** Vị trí trên bản đồ, % theo chiều ngang / dọc của vùng bản đồ ở mức zoom 1. */
  x: number;
  y: number;
  devices: number;
  openRecords: number;
  alerts: SiteAlert[];
  /** Cụm điểm (ví dụ 12 kho & cửa hàng) — tách ra khi phóng to. */
  cluster?: Array<{ name: string; dx: number; dy: number }>;
};

export type MapView = { zoom: number; panX: number; panY: number };
