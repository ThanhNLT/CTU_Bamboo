// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";

import { EN as EN_SHELL } from "./catalog";
import { EN_PAGES } from "./catalog-pages";

// Bản dịch khung ứng dụng (menu, thanh trên) ưu tiên hơn bản dịch nội dung trang khi trùng khóa
const EN: Record<string, string> = { ...EN_PAGES, ...EN_SHELL };

export type Locale = "vi" | "en";
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
];

const KEY = "bamboo.locale";
const listeners = new Set<() => void>();

const read = (): Locale => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "vi" || saved === "en") return saved;
  } catch {
    // trình duyệt chặn localStorage: dùng mặc định
  }
  return "vi";
};

let current: Locale = typeof localStorage === "undefined" ? "vi" : read();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLocale = (): Locale => current;

export const setLocale = (next: Locale) => {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // không lưu được thì chỉ giữ cho phiên này
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
  // Nhãn khai ở cấp mô-đun (danh sách cột, tùy chọn, menu…) được dịch lúc nạp mã: tải lại để mọi chỗ cùng đổi ngôn ngữ
  window.location.reload();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Dịch một câu tiếng Việt gốc sang ngôn ngữ đang chọn; chưa có bản dịch thì giữ nguyên.
export const tr = (vi: string, locale: Locale = current): string => (locale === "en" ? (EN[vi] ?? vi) : vi);

// Nhãn trạng thái / sự kiện: tiếng Việt dùng chung một chữ cho nút và trạng thái ("Từ chối"), tiếng Anh thì khác
// ("Reject" / "Rejected"). Bảng nhãn trạng thái và lịch sử dùng trs(); nút bấm dùng tr()
const EN_STATUS: Record<string, string> = {
  "Từ chối": "Rejected",
  "Trả về": "Returned",
  Duyệt: "Approved",
  Hủy: "Cancelled",
  "Gửi duyệt": "Submitted",
  "Chuyển việc": "Transferred",
  "Gộp bước": "Merged",
  "Đẩy lên cấp trên": "Escalated",
  "Giao việc duyệt": "Assigned",
  "Chuyển người lập": "Requester changed",
  "Hoàn tất duyệt": "Completed",
};
export const trs = (vi: string, locale: Locale = current): string =>
  locale === "en" ? (EN_STATUS[vi] ?? tr(vi, locale)) : vi;

// Câu có chỗ trống: khóa dịch là câu gốc với {0}, {1}… ("Đã ghim {0} KPI"), giá trị điền vào sau khi dịch
export const trf = (vi: string, args: readonly unknown[], locale: Locale = current): string =>
  tr(vi, locale).replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));

// Gọi trong component để tự vẽ lại khi đổi ngôn ngữ
export const useLocale = (): { locale: Locale; t: (vi: string) => string } => {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "vi" as Locale);
  return { locale, t: (vi) => tr(vi, locale) };
};
