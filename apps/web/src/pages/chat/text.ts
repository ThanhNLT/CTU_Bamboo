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

export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type Part = { text: string; mention?: boolean; url?: boolean };

const TOKEN = /(https?:\/\/[^\s<>"']+)|(@[\p{L}][\p{L}\p{M} ]{0,60}?)(?=$|[\s,.;:!?)])/gu;

export const splitMessage = (body: string, names: string[]): Part[] => {
  const out: Part[] = [];
  let last = 0;
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const m of body.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (m[1]) {
      if (start > last) out.push({ text: body.slice(last, start) });
      out.push({ text: m[1], url: true });
      last = start + m[1].length;
      continue;
    }
    const tail = body.slice(start + 1);
    const name = sorted.find((n) => tail.startsWith(n));
    if (!name) continue;
    if (start > last) out.push({ text: body.slice(last, start) });
    out.push({ text: `@${name}`, mention: true });
    last = start + 1 + name.length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
};
