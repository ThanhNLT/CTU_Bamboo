// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { fold } from "../../utils/text";
import type { ArchiveDoc, Seal, SealLogRow, VerifyResult, VerifyVia } from "./types";

const num = new Intl.NumberFormat("vi-VN");
export const formatInt = (n: number) => num.format(n);

const stampFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});
/** "12/10/2026 09:01" theo giờ Việt Nam. */
export const formatStamp = (d: Date) => {
  const p = Object.fromEntries(stampFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

/** "9c1e4b…d0277ab" */
export const shortHash = (h: string, head = 6, tail = 7) =>
  h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h;

export const CODE_PATTERN = /^(HS-[A-Z]+-\d{4}-\d{5})(?:\s*(?:·|@|,)?\s*v(\d+))?$/i;

/** Tách "HS-SEMI-2026-00123" hoặc "HS-SEMI-2026-00123 v2". Sai định dạng → undefined. */
export const parseCode = (input: string) => {
  const m = CODE_PATTERN.exec(input.trim());
  if (!m?.[1]) return undefined;
  return { code: m[1].toUpperCase(), version: m[2] ? Number(m[2]) : undefined };
};

/** Bản niêm phong theo mã; không ghi phiên bản → phiên bản mới nhất. */
export const findSeal = (seals: Seal[], code: string, version?: number) =>
  seals
    .filter((s) => s.code === code && (version == null || s.version === version))
    .sort((a, b) => b.version - a.version)[0];

/** Đối soát theo mã: lấy mã băm tệp đang lưu, so với mã băm đã niêm phong trên sổ cái. */
export const verifyByCode = (seals: Seal[], input: string, checkedAt: string): VerifyResult => {
  const parsed = parseCode(input);
  const seal = parsed && findSeal(seals, parsed.code, parsed.version);
  if (!seal) return { kind: "not_found", query: input.trim(), via: "code", checkedAt };
  const actual = seal.storedSha256 ?? seal.sha256;
  return actual === seal.sha256
    ? { kind: "match", seal, via: "code", checkedAt }
    : { kind: "mismatch", seal, actualSha256: actual, via: "code", checkedAt };
};

/** Đối soát theo tệp: tìm bản niêm phong có đúng mã băm này. */
export const verifyByHash = (seals: Seal[], sha256: string, fileName: string, checkedAt: string): VerifyResult => {
  const seal = seals.find((s) => s.sha256 === sha256);
  return seal
    ? { kind: "match", seal, via: "file", checkedAt, fileName }
    : { kind: "not_found", query: fileName, sha256, via: "file", checkedAt, fileName };
};

/** Băm SHA-256 ngay trong trình duyệt (Web Crypto). Tệp không rời khỏi máy. */
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

const VIA_LABEL: Record<VerifyVia, string> = { code: "theo mã hồ sơ", file: "theo tệp tải lên" };
const KIND_LABEL: Record<VerifyResult["kind"], string> = {
  match: "Khớp với bản niêm phong",
  mismatch: "KHÔNG khớp với bản niêm phong",
  not_found: "Không tìm thấy bản niêm phong",
};

/** Bằng chứng dạng văn bản để dán vào hồ sơ / email. */
export const evidenceText = (r: VerifyResult) => {
  const lines = ["Bằng chứng đối soát · Bamboo Sổ cái (Hyperledger Fabric)", `Kết quả: ${KIND_LABEL[r.kind]}`];
  if (r.kind === "not_found") {
    lines.push(`Truy vấn: ${r.query}`);
    if (r.sha256) lines.push(`SHA-256 tệp: ${r.sha256}`);
  } else {
    const s = r.seal;
    lines.push(
      `Hồ sơ: ${s.code} · v${s.version} · ${s.title}`,
      `Niêm phong: ${s.sealedAt} · kênh ${s.channel} · khối #${s.block}`,
      `Giao dịch: ${s.txId}`,
      `SHA-256 trên sổ cái: ${s.sha256}`,
    );
    if (r.kind === "mismatch") lines.push(`SHA-256 tệp hiện tại: ${r.actualSha256}`);
    if (r.fileName) lines.push(`Tệp: ${r.fileName}`);
  }
  lines.push(`Đối soát lúc: ${r.checkedAt} (${VIA_LABEL[r.via]})`);
  return lines.join("\n");
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Trang chứng nhận để in / "Lưu dưới dạng PDF" từ hộp thoại In của trình duyệt. */
export const certificateHtml = (r: Exclude<VerifyResult, { kind: "not_found" }>) => {
  const s = r.seal;
  const ok = r.kind === "match";
  const rows: Array<[string, string]> = [
    ["Hồ sơ", `${s.code} · phiên bản ${s.version}`],
    ["Tiêu đề", s.title],
    ["Niêm phong", `${s.sealedAt} · kênh ${s.channel} · khối #${s.block}`],
    ["Giao dịch", s.txId],
    ["SHA-256 trên sổ cái", s.sha256],
    ...(r.kind === "mismatch" ? ([["SHA-256 tệp hiện tại", r.actualSha256]] as Array<[string, string]>) : []),
    ["Đối soát lúc", `${r.checkedAt} (${VIA_LABEL[r.via]})`],
  ];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Chứng nhận đối soát ${esc(s.code)} v${s.version}</title>
<style>
  body{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#1b231e;margin:48px;}
  h1{font-size:22px;margin:0 0 4px} p{margin:0;color:#6b7670;font-size:13px}
  .badge{display:inline-block;margin:20px 0;padding:6px 14px;border-radius:999px;font-weight:600;font-size:14px;
    background:${ok ? "#f0f7f1" : "#fef2f2"};color:${ok ? "#1f512a" : "#b91c1c"};border:1px solid ${ok ? "#c3e0c8" : "#fecaca"}}
  table{border-collapse:collapse;width:100%;font-size:13px} td{padding:8px 0;border-bottom:1px solid #e4e9e5;vertical-align:top}
  td:first-child{width:180px;color:#6b7670} .mono{font-family:"JetBrains Mono",Menlo,Consolas,monospace;word-break:break-all}
  footer{margin-top:28px;font-size:11.5px;color:#6b7670}
</style></head><body>
<h1>Chứng nhận đối soát toàn vẹn</h1><p>Bamboo · DX-OS Open-Core · Sổ cái Hyperledger Fabric</p>
<div class="badge">${ok ? "✓ Khớp với bản niêm phong" : "✗ Không khớp với bản niêm phong"}</div>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="${/SHA|Giao dịch/.test(k) ? "mono" : ""}">${esc(v)}</td></tr>`).join("")}</table>
${s.resolution ? `<p style="margin-top:16px">${esc(s.resolution)}</p>` : ""}
<footer>Kiểm chứng lại: tính SHA-256 của tệp gốc và so với giao dịch trên kênh ${esc(s.channel)}. Tài liệu được tạo tự động.</footer>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
};

/** CSV báo cáo đối soát (có BOM để Excel đọc đúng tiếng Việt). */
export const reconciliationCsv = (seals: Seal[], log: SealLogRow[]) => {
  const last = new Map(log.map((r) => [`${r.code}#${r.version}`, r.result]));
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = [
    "Mã hồ sơ",
    "Phiên bản",
    "Tiêu đề",
    "Niêm phong lúc",
    "Kênh",
    "Khối",
    "Giao dịch",
    "SHA-256",
    "Kết quả đối soát gần nhất",
  ];
  const rows = seals.map((s) => {
    const r = last.get(`${s.code}#${s.version}`) ?? ((s.storedSha256 ?? s.sha256) === s.sha256 ? "match" : "mismatch");
    return [
      s.code,
      s.version,
      s.title,
      s.sealedAt,
      s.channel,
      s.block,
      s.txId,
      s.sha256,
      r === "match" ? "Khớp" : "Không khớp",
    ];
  });
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
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
  return q ? docs.filter((d) => fold(`${d.title} ${d.code} ${d.unit} ${d.archivedYear}`).includes(q)) : docs;
};
