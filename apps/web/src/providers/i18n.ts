/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
