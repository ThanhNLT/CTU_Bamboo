/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import { useSyncExternalStore } from "react";

import { EN as EN_SHELL } from "./catalog";
import { EN_PAGES } from "./catalog-pages";

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
  } catch {}
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
  } catch {}
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
  window.location.reload();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const tr = (vi: string, locale: Locale = current): string => (locale === "en" ? (EN[vi] ?? vi) : vi);

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

export const trf = (vi: string, args: readonly unknown[], locale: Locale = current): string =>
  tr(vi, locale).replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));

export const useLocale = (): { locale: Locale; t: (vi: string) => string } => {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "vi" as Locale);
  return { locale, t: (vi) => tr(vi, locale) };
};
