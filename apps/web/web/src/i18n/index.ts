// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";

import { EN } from "./catalog";

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
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Dịch một câu tiếng Việt gốc sang ngôn ngữ đang chọn; chưa có bản dịch thì giữ nguyên.
export const tr = (vi: string, locale: Locale = current): string => (locale === "en" ? (EN[vi] ?? vi) : vi);

// Gọi trong component để tự vẽ lại khi đổi ngôn ngữ
export const useLocale = (): { locale: Locale; t: (vi: string) => string } => {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "vi" as Locale);
  return { locale, t: (vi) => tr(vi, locale) };
};
