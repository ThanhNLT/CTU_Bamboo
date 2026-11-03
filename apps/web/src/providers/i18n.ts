// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { I18nProvider } from "@refinedev/core";

import { getLocale, setLocale, tr } from "../i18n";

const VI: Record<string, string> = {
  "buttons.logout": tr("Đăng xuất"),
  "buttons.create": tr("Tạo mới"),
  "buttons.save": tr("Lưu"),
  "buttons.edit": tr("Sửa"),
  "buttons.show": "Xem",
  "buttons.delete": tr("Xóa"),
  "buttons.cancel": tr("Hủy"),
  "buttons.refresh": tr("Tải lại"),
  "buttons.list": tr("Danh sách"),
  "actions.list": tr("Danh sách"),
  "actions.create": tr("Tạo mới"),
  "actions.edit": tr("Sửa"),
  "actions.show": tr("Chi tiết"),
  "pages.error.404": tr("Không tìm thấy trang này."),
  "pages.error.backHome": tr("Về trang chủ"),
  warnWhenUnsavedChanges: tr("Có thay đổi chưa lưu. Rời trang?"),
  "notifications.success": tr("Thành công"),
  "notifications.error": tr("Lỗi (mã {{statusCode}})"),
  "dashboard.title": tr("Tổng quan"),
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
