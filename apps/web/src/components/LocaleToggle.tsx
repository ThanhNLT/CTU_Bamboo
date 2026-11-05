// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { LOCALES, setLocale, useLocale } from "../i18n";
import { cn } from "../utils/cn";

/**
 * Nút chuyển ngôn ngữ VI | EN cho trang đăng nhập, đăng ký, khôi phục (cùng kiểu với ô chọn ngôn ngữ trên trang đăng
 * nhập Keycloak). Lựa chọn lưu ở `bamboo.locale`, dùng chung với ứng dụng và trang Keycloak (cùng origin qua cổng API).
 */
export const LocaleToggle = ({ className }: { className?: string }) => {
  const { locale, t } = useLocale();
  return (
    <div
      role="radiogroup"
      aria-label={t("Ngôn ngữ")}
      className={cn("glass flex h-9 items-center gap-0.5 rounded-full border p-0.5", className)}
    >
      {LOCALES.map((l) => {
        const on = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            lang={l.code}
            title={l.label}
            onClick={() => !on && setLocale(l.code)}
            className={cn(
              "h-8 min-w-10 rounded-full px-2.5 text-[12.5px] font-semibold uppercase transition-colors",
              on ? "bg-bamboo-600 text-white shadow-sm" : "text-body hover:bg-bamboo-50",
            )}
          >
            {l.code}
          </button>
        );
      })}
    </div>
  );
};
