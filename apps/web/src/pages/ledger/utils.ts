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

import { fold } from "../../utils/text";
import type { ArchiveDoc, Seal, VerifyResult, VerifyVia } from "./types";
import { tr, trf } from "../../i18n";

const num = new Intl.NumberFormat("en-US");

export const formatInt = (n: number) => num.format(n);

const stampFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

export const formatStamp = (d: Date) => {
  const p = Object.fromEntries(stampFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
};

export const shortHash = (h: string, head = 6, tail = 7) =>
  h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h;

export const sha256Hex = async (data: Blob) => {
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1).replace(".", ",")} KB`
      : `${(n / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;

export const READING_ROOM_RULES = tr("Dấu chìm tên người xem · link xem hết hạn sau 60 giây · ghi nhật ký truy cập");
const VIA_LABEL: Record<VerifyVia, string> = { code: tr("theo mã hồ sơ"), file: tr("theo tệp tải lên") };
const KIND_LABEL: Record<VerifyResult["kind"], string> = {
  match: tr("Khớp với bản niêm phong"),
  mismatch: tr("KHÔNG khớp với bản niêm phong"),
  not_found: tr("Không tìm thấy bản niêm phong"),
};

export const evidenceText = (r: VerifyResult) => {
  const lines = [
    tr("Bằng chứng đối soát · Bamboo Sổ cái (chuỗi hash kiểm toán)"),
    trf("Kết quả: {0}", [KIND_LABEL[r.kind]]),
  ];
  if (r.kind === "not_found") {
    lines.push(trf("Truy vấn: {0}", [r.query]));
    if (r.sha256) lines.push(trf("SHA-256 tệp: {0}", [r.sha256]));
  } else {
    const s = r.seal;
    lines.push(
      trf("Hồ sơ: {0} · v{1} · {2}", [s.code, s.version, s.title]),
      trf("Tệp: {0}", [s.fileName]),
      trf("Niêm phong: {0} · chuỗi {1} · dòng nhật ký #{2}", [s.sealedAt, s.channel, s.block ?? "—"]),
      trf("Mã hash dòng nhật ký: {0}", [s.txId ?? "—"]),
      trf("SHA-256 đã niêm phong: {0}", [s.sha256]),
    );
    if (r.kind === "mismatch") {
      lines.push(trf("SHA-256 tệp hiện tại: {0}", [r.actualSha256 ?? "—"]));
      if (r.problem) lines.push(trf("Ghi chú: {0}", [r.problem]));
    }
    if (r.fileName) lines.push(trf("Tệp đối soát: {0}", [r.fileName]));
  }
  lines.push(trf("Đối soát lúc: {0} ({1})", [r.checkedAt, VIA_LABEL[r.via]]));
  return lines.join("\n");
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const certificateHtml = (r: Exclude<VerifyResult, { kind: "not_found" }>) => {
  const s = r.seal;
  const ok = r.kind === "match";
  const rows: Array<[string, string]> = [
    [tr("Hồ sơ"), trf("{0} · phiên bản {1}", [s.code, s.version])],
    [tr("Tiêu đề"), s.title],
    [tr("Tệp"), s.fileName],
    [tr("Niêm phong"), trf("{0} · chuỗi {1} · dòng nhật ký #{2}", [s.sealedAt, s.channel, s.block ?? "—"])],
    [tr("Mã hash dòng nhật ký"), s.txId ?? "—"],
    [tr("SHA-256 đã niêm phong"), s.sha256],
    ...(r.kind === "mismatch"
      ? ([
          [tr("SHA-256 tệp hiện tại"), r.actualSha256 ?? "—"],
          ...(r.problem ? [[tr("Ghi chú"), r.problem]] : []),
        ] as Array<[string, string]>)
      : []),
    [tr("Đối soát lúc"), `${r.checkedAt} (${VIA_LABEL[r.via]})`],
  ];
  return trf(
    '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Chứng nhận đối soát {0} v{1}</title>\n<style>\n  body{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#1b231e;margin:48px;}\n  h1{font-size:22px;margin:0 0 4px} p{margin:0;color:#6b7670;font-size:13px}\n  .badge{display:inline-block;margin:20px 0;padding:6px 14px;border-radius:10px;font-weight:600;font-size:14px;\n    background:{2};color:{3};border:1px solid {4}}\n  table{border-collapse:collapse;width:100%;font-size:13px} td{padding:8px 0;border-bottom:1px solid #e4e9e5;vertical-align:top}\n  td:first-child{width:180px;color:#6b7670} .mono{font-family:"JetBrains Mono",Menlo,Consolas,monospace;word-break:break-all}\n  footer{margin-top:28px;font-size:11.5px;color:#6b7670}\n</style></head><body>\n<h1>Chứng nhận đối soát toàn vẹn</h1><p>Bamboo · Sổ cái (chuỗi hash nhật ký kiểm toán)</p>\n<div class="badge">{5}</div>\n<table>{6}</table>\n<footer>Kiểm chứng lại: tính SHA-256 của tệp gốc và so với SHA-256 đã niêm phong; dòng nhật ký #{7} nằm trong chuỗi hash kiểm toán của {8}. Tài liệu được tạo tự động.</footer>\n<script>window.onload=function(){window.print()}</script>\n</body></html>',
    [
      esc(s.code),
      s.version,
      ok ? "#f0f7f1" : "#fef2f2",
      ok ? "#1f512a" : "#b91c1c",
      ok ? "#c3e0c8" : "#fecaca",
      ok ? tr("✓ Khớp với bản niêm phong") : tr("✗ Không khớp với bản niêm phong"),
      rows
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="${/SHA|hash/.test(k) ? "mono" : ""}">${esc(v)}</td></tr>`)
        .join(""),
      esc(String(s.block ?? "—")),
      esc(s.channel),
    ],
  );
};

export const reconciliationCsv = (seals: Seal[]) => {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = [
    tr("Mã hồ sơ"),
    tr("Phiên bản"),
    tr("Tiêu đề"),
    tr("Tệp"),
    tr("Niêm phong lúc"),
    tr("Chuỗi"),
    tr("Dòng nhật ký"),
    tr("Mã hash dòng nhật ký"),
    "SHA-256",
    tr("Kết quả đối soát gần nhất"),
    tr("Đối soát lúc"),
  ];
  const label = { match: tr("Khớp"), mismatch: tr("Không khớp"), not_found: tr("Không tìm thấy") } as const;
  const rows = seals.map((s) => [
    s.code,
    s.version,
    s.title,
    s.fileName,
    s.sealedAt,
    s.channel,
    s.block ?? "",
    s.txId ?? "",
    s.sha256,
    s.lastResult ? label[s.lastResult] : tr("Chưa đối soát"),
    s.lastCheckedAt ?? "",
  ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
};

export const downloadText = (text: string, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const filterArchive = (docs: ArchiveDoc[], query: string) => {
  const q = fold(query.trim());
  return q
    ? docs.filter((d) => fold(`${d.title} ${d.code} ${d.fileName} ${d.unit} ${d.archivedYear}`).includes(q))
    : docs;
};
