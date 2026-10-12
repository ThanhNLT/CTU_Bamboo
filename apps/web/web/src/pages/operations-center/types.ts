// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

/** Khóa "công ty" = id đơn vị cấp 1 dưới gốc tenant, hoặc OTHER_COMPANY cho phần gộp "Khác". */
export type CompanyKey = string;

export type Company = { key: CompanyKey; name: string; short: string; color: string };

/** Công ty trong dữ liệu minh họa của bản đồ cảnh báo. */
export type SampleCompanyKey = "phone" | "chip" | "appliance" | "hospital";
export type SampleCompany = { key: SampleCompanyKey; name: string; short: string; color: string };

/** Độ tươi dữ liệu: nóng (gần thời gian thực) · ấm (theo lô) · lạnh. */
export type Freshness = { tier: "Nóng" | "Ấm" | "Lạnh"; at: string };

export type Kpi = {
  key: string;
  label: string;
  value: string;
  /** Chú thích dưới số: mũi tên/chấm + chữ. */
  delta?: { dir: "up" | "down" | "dot" | "none"; tone: "good" | "bad" | "neutral"; text: string };
  freshness: Freshness;
  definition: string;
};

export type DashTab = "overview" | "process" | "production" | "hospital" | "quality";

export type Period = "week" | "month" | "quarter";

export type SiteStatus = "ok" | "warning" | "critical";

export type Site = {
  id: string;
  company: SampleCompanyKey;
  name: string;
  province: string;
  /** Vị trí trên bản đồ, % theo chiều ngang/dọc. */
  x: number;
  y: number;
  status: SiteStatus;
  alert?: string;
};

export type OverdueRow = {
  code: string;
  /** Trang Hộp việc / chi tiết của hồ sơ. */
  to: string;
  company: CompanyKey;
  type: string;
  step: string;
  overdueMinutes: number;
  overdueLabel: string;
};

/** Một ngày trên biểu đồ "duyệt mỗi ngày": số hồ sơ duyệt xong theo từng công ty. */
export type DailyPoint = { day: string } & Record<CompanyKey, number | string>;

export type PendingRow = { company: CompanyKey; l1: number; l2: number };

export type MonthlyPoint = { month: string; current: number | null; previous: number };
