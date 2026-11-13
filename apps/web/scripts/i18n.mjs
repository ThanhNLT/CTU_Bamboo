/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(WEB, "package.json"));
const ts = require("typescript");

const SRC = path.join(WEB, "src");
const I18N = path.join(SRC, "i18n");
const MODE = process.argv[2] ?? "check";
const VI =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
const SKIP_METHODS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "indexOf",
  "lastIndexOf",
  "split",
  "replace",
  "replaceAll",
  "match",
  "test",
  "localeCompare",
  "padStart",
  "padEnd",
  "join",
]);
const T_FUNCS = new Set(["t", "tr", "trl", "trf", "trs", "translate"]);
const write = MODE === "wrap";
const keys = new Map();
const skipped = [];
const unwrapped = [];
const manual = [];

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (p !== I18N) walk(p);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) files.push(p);
  }
};
walk(SRC);

const jsxText = (raw) => {
  const lines = raw.split(/\r?\n/);
  const out = [];
  lines.forEach((l, i) => {
    let s = l.replace(/\t/g, " ");
    if (i > 0) s = s.replace(/^\s+/, "");
    if (i < lines.length - 1) s = s.replace(/\s+$/, "");
    if (s) out.push(s);
  });
  return out.join(" ");
};

const inTypeOrSkipCtx = (node) => {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isTypeNode(n) || ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTaggedTemplateExpression(n))
      return true;
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
      if (T_FUNCS.has(name) && n.arguments[0] && n.arguments[0].pos <= node.pos && node.end <= n.arguments[0].end)
        return true;
      if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "console")
        return true;
      if (SKIP_METHODS.has(name) && n.arguments.some((a) => a.pos <= node.pos && node.end <= a.end)) return true;
      if (ts.isIdentifier(c) && c.text === "RegExp") return true;
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "RegExp") return true;
    if (ts.isBlock(n) || ts.isSourceFile(n)) break;
  }
  return false;
};

const ignored = (node) => {
  const sf = node.getSourceFile();
  const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
  const lines = sf.text.split("\n");
  return /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
};

const directSkip = (node) => {
  const p = node.parent;
  if (!p) return true;
  if (ignored(node)) return true;
  if (
    (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p)) &&
    p.name === node
  )
    return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  if (
    ts.isBinaryExpression(p) &&
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.InKeyword,
    ].includes(p.operatorToken.kind)
  )
    return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isExternalModuleReference(p) || ts.isImportDeclaration(p)) return true;
  if (ts.isJsxAttribute(p) && p.name.getText() === "key") return true;
  return false;
};

let changedFiles = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (!VI.test(text)) continue;
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  let needTr = false,
    needTrf = false;
  const add = (k) => keys.set(k, (keys.get(k) ?? 0) + 1);

  const visit = (node) => {
    if (ts.isJsxText(node) && VI.test(node.text)) {
      const raw = node.getFullText();
      if (raw.includes("&") || /[{}]/.test(raw)) {
        manual.push(`${path.relative(WEB, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        return;
      }
      const core = jsxText(raw);
      const lead = raw.match(/^\s*/)[0],
        trail = raw.match(/\s*$/)[0];
      edits.push([node.getFullStart(), node.end, `${lead}{tr(${JSON.stringify(core)})}${trail}`]);
      add(core);
      needTr = true;
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && VI.test(node.text)) {
      if (directSkip(node) || inTypeOrSkipCtx(node)) {
        if (!inTypeOrSkipCtx(node) || true) skipped.push(`${file}:${node.text.slice(0, 60)}`);
        return;
      }
      const inJsxAttr = ts.isJsxAttribute(node.parent);
      const call = `tr(${JSON.stringify(node.text)})`;
      edits.push([node.getStart(), node.end, inJsxAttr ? `{${call}}` : call]);
      add(node.text);
      needTr = true;
      return;
    }
    if (ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((x) => VI.test(x)) && !directSkip(node) && !inTypeOrSkipCtx(node)) {
        let key = node.head.text;
        node.templateSpans.forEach((s, i) => {
          key += `{${i}}` + s.literal.text;
        });
        const args = node.templateSpans.map((s) => s.expression.getText(sf));
        if (node.templateSpans.some((s) => VI.test(s.expression.getText(sf))))
          skipped.push(`${file}:NESTED ${key.slice(0, 60)}`);
        edits.push([node.getStart(), node.end, `trf(${JSON.stringify(key)}, [${args.join(", ")}])`]);
        add(key);
        needTrf = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);

  const rel = path.relative(path.dirname(file), I18N).split(path.sep).join("/");
  const spec = rel.startsWith(".") ? rel : `./${rel}`;
  const names = [needTr && "tr", needTrf && "trf"].filter(Boolean);
  const re = new RegExp(`import \\{([^}]*)\\} from "${spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}";`);
  const m = out.match(re);
  if (m) {
    const have = m[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const all = [...new Set([...have, ...names])].sort((a, b) => a.localeCompare(b));
    out = out.replace(re, `import { ${all.join(", ")} } from "${spec}";`);
  } else {
    const imports = [...out.matchAll(/^import [\s\S]*?;$/gm)];
    const last = imports.length ? imports[imports.length - 1] : null;
    const line = `import { ${names.join(", ")} } from "${spec}";`;
    if (last) {
      const at = last.index + last[0].length;
      out = out.slice(0, at) + "\n" + line + out.slice(at);
    } else {
      const header = out.match(/^(?:\/\/.*\n)+\n?/);
      const at = header ? header[0].length : 0;
      out = out.slice(0, at) + line + "\n\n" + out.slice(at);
    }
  }
  changedFiles++;
  if (write) fs.writeFileSync(file, out);
  else
    unwrapped.push(
      ...edits.map(([s]) => `${path.relative(WEB, file)}:${sf.getLineAndCharacterOfPosition(s).line + 1}`),
    );
}

const used = new Set();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["t", "tr", "trl", "trf", "trs"].includes(node.expression.text)
    ) {
      const a = node.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && /\p{L}/u.test(a.text))
        used.add(a.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const catalogKeys = new Set();
for (const name of ["catalog.ts", "catalog-pages.ts"]) {
  const file = path.join(I18N, name);
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isPropertyAssignment(node))
      catalogKeys.add(ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const untranslated = [...used].filter((k) => !catalogKeys.has(k) && !/^\s*\{\s*"/.test(k)).sort();

if (MODE === "wrap") {
  console.log(`Đã bọc chuỗi trong ${changedFiles} tệp. Câu chưa có bản dịch (${untranslated.length}):`);
  for (const k of untranslated) console.log(`  ${JSON.stringify(k)}`);
} else {
  if (unwrapped.length) {
    console.error(
      `Có ${unwrapped.length} chuỗi tiếng Việt chưa bọc tr()/trf() (chạy: pnpm --filter @bamboo/web i18n:wrap):`,
    );
    for (const u of unwrapped.slice(0, 50)) console.error(`  ${u}`);
  }
  if (untranslated.length) {
    console.error(`Có ${untranslated.length} câu chưa có bản dịch tiếng Anh trong src/i18n/catalog-pages.ts:`);
    for (const k of untranslated.slice(0, 50)) console.error(`  ${JSON.stringify(k)}`);
  }
  if (manual.length) {
    console.error(`Có ${manual.length} đoạn JSX tiếng Việt chứa & hoặc ngoặc nhọn, cần bọc tr() bằng tay:`);
    for (const u of manual.slice(0, 50)) console.error(`  ${u}`);
  }
  if (unwrapped.length || untranslated.length || manual.length) process.exit(1);
  console.log(`i18n: ${used.size} câu đã bọc, đều có bản dịch tiếng Anh.`);
}
