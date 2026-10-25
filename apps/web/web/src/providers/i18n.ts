// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { I18nProvider } from "@refinedev/core";

import { getLocale, setLocale, tr } from "../i18n";

const VI: Record<string, string> = {
  "buttons.logout": "Đăng xuất",
  "buttons.create": "Tạo mới",
  "buttons.save": "Lưu",
  "buttons.edit": "Sửa",
  "buttons.show": "Xem",
  "buttons.delete": "Xóa",
  "buttons.cancel": "Hủy",
  "buttons.refresh": "Tải lại",
  "buttons.list": "Danh sách",
  "actions.list": "Danh sách",
  "actions.create": "Tạo mới",
  "actions.edit": "Sửa",
  "actions.show": "Chi tiết",
  "pages.error.404": "Không tìm thấy trang này.",
  "pages.error.backHome": "Về trang chủ",
  warnWhenUnsavedChanges: "Có thay đổi chưa lưu. Rời trang?",
  "notifications.success": "Thành công",
  "notifications.error": "Lỗi (mã {{statusCode}})",
  "dashboard.title": "Tổng quan",
};

export const i18nProvider: I18nProvider = {
  translate: (key, options, defaultMessage) => {
    const text = tr(VI[key] ?? defaultMessage ?? key);
    return typeof options === "object" && options
      ? text.replace(/\{\{(\w+)\}\}/g, (_, k) => String((options as Record<string, unknown>)[k] ?? ""))
      : text;
  },
  changeLocale: async (locale) => setLocale(locale === "en" ? "en" : "vi"),
  getLocale,
};
