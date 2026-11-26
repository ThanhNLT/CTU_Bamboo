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

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ALLOWED = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "MIT OR CC0-1.0",
]);

function stripParens(expr) {
  let s = expr.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0 && i < s.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

function splitTopLevel(expr, op) {
  const parts = [];
  let depth = 0;
  let start = 0;
  const tokens = expr.split(/(\s+|\(|\))/);
  let pos = 0;
  for (const tok of tokens) {
    if (tok === "(") depth++;
    else if (tok === ")") depth--;
    else if (depth === 0 && tok === op) {
      parts.push(expr.slice(start, pos));
      start = pos + tok.length;
    }
    pos += tok.length;
  }
  parts.push(expr.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function isAllowed(expr) {
  const s = stripParens(expr);
  if (ALLOWED.has(s)) return true;
  const ors = splitTopLevel(s, "OR");
  if (ors.length > 1) return ors.some(isAllowed);
  const ands = splitTopLevel(s, "AND");
  if (ands.length > 1) return ands.every(isAllowed);
  return false;
}

const dir = resolve(process.argv[2] ?? "apps/web");
const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  cwd: dir,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(raw);

const summary = new Map();
const rejected = [];
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const pkg of pkgs) {
    for (const version of pkg.versions) {
      const id = `${pkg.name}@${version}`;
      summary.set(license, (summary.get(license) ?? 0) + 1);
      if (!isAllowed(license)) rejected.push(`${id}: ${license}`);
    }
  }
}

for (const [license, count] of [...summary].sort((a, b) => b[1] - a[1])) console.log(`${license}: ${count}`);
if (rejected.length) {
  console.error(`\nGiấy phép không nằm trong danh sách cho phép (${rejected.length}):`);
  for (const r of rejected) console.error(`  ${r}`);
  process.exit(1);
}
console.log(`\nĐạt: mọi phụ thuộc production của ${dir} dùng giấy phép được phép.`);
