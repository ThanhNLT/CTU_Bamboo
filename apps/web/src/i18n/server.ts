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

import { getLocale } from "./index";

type Template = { re: RegExp; en: string; weight: number };

const HOLE = /\{(\d+)\}/g;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIELDS = new Set([
  "label",
  "message",
  "description",
  "title",
  "body",
  "name",
  "detail",
  "hint",
  "reason",
  "error",
  "errors",
  "warnings",
  "issues",
  "notes",
  "note",
  "summary",
  "text",
  "unit",
  "group",
  "definition",
  "open_work",
  "changes",
  "status_text",
]);

let exact: Record<string, string> = {};
const byHead = new Map<string, Template[]>();
const loose: Template[] = [];
const cache = new Map<string, string>();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const build = (catalog: Record<string, string>) => {
  exact = catalog;
  for (const [vi, en] of Object.entries(catalog)) {
    if (!/\{\d+\}/.test(vi)) continue;
    const parts = vi.split(HOLE);
    const literal = parts.filter((_, i) => i % 2 === 0).join("");
    const letters = literal.replace(/[^\p{L}]/gu, "").length;
    if (letters < 3 || (parts[0].length < 3 && letters < 6)) continue;
    const order: string[] = [];
    const source = parts
      .map((p, i) => (i % 2 === 0 ? escape(p) : (order.push(p), "(.*?)")))
      .join("")
      .replace(/\(\.\*\?\)$/, "(.*)");
    const slots = order.map((n) => `{${n}}`);
    const template: Template = {
      re: new RegExp(`^${source}$`, "s"),
      en: en.replace(HOLE, (m) => `\u0000${slots.indexOf(m)}\u0000`),
      weight: literal.length,
    };
    const head = parts[0].slice(0, 3);
    if (head.length === 3) byHead.set(head, [...(byHead.get(head) ?? []), template]);
    else loose.push(template);
  }
};

export const loadServerCatalog = (): Promise<void> =>
  getLocale() === "en"
    ? import("./server.en.json").then((m) => build(m.default as Record<string, string>)).catch(() => undefined)
    : Promise.resolve();

const translate = (text: string, depth: number): string => {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 600) return text;
  const hit = exact[trimmed];
  if (hit !== undefined) return text.replace(trimmed, () => hit);
  if (depth > 0) {
    const counted = /^(\d+) (.+)$/s.exec(trimmed);
    if (counted && exact[counted[2]] !== undefined) return `${counted[1]} ${exact[counted[2]]}`;
    if (trimmed.includes("; ")) {
      return trimmed
        .split("; ")
        .map((p) => translate(p, depth + 1))
        .join("; ");
    }
  }
  let best: { t: Template; m: RegExpExecArray } | undefined;
  for (const t of [...(byHead.get(trimmed.slice(0, 3)) ?? []), ...loose]) {
    if (best && t.weight <= best.t.weight) continue;
    const m = t.re.exec(trimmed);
    if (m) best = { t, m };
  }
  if (!best) {
    if (depth > 0 && depth < 4 && trimmed.includes(", ")) {
      return trimmed
        .split(", ")
        .map((p) => translate(p, 4))
        .join(", ");
    }
    return text;
  }
  const { t, m } = best;
  // eslint-disable-next-line no-control-regex
  const out = t.en.replace(/\u0000(\d+)\u0000/g, (_, i: string) => {
    const group = m[Number(i) + 1] ?? "";
    return depth < 4 ? translate(group, depth + 1) : group;
  });
  return text.replace(trimmed, () => out);
};

const isoDates = (text: string) =>
  text.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (all, d: string, m: string, y: string) =>
    Number(m) >= 1 && Number(m) <= 12 && Number(d) <= 31 ? `${d}-${MONTHS[Number(m) - 1]}-${y}` : all,
  );

export const trServer = (text: string): string => {
  if (!text) return text;
  const known = cache.get(text);
  if (known !== undefined) return known;
  const out = isoDates(getLocale() === "en" ? translate(text, 0) : text);
  if (cache.size > 5000) cache.clear();
  cache.set(text, out);
  return out;
};

export const localizeServer = (value: unknown, field = ""): void => {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] === "string") {
        if (FIELDS.has(field)) value[i] = trServer(value[i] as string);
      } else localizeServer(value[i], field);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const v = record[key];
    if (typeof v === "string") {
      if (FIELDS.has(key)) record[key] = trServer(v);
    } else if (v && typeof v === "object") localizeServer(v, key);
  }
};
