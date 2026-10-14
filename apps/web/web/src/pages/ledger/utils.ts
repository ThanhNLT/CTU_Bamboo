// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { fold } from "../../utils/text";
import type { ArchiveDoc, Seal, VerifyResult, VerifyVia } from "./types";

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

export const formatStamp = (d: Date) => {
  const p = Object.fromEntries(stampFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
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

export const READING_ROOM_RULES = "Dấu chìm tên người xem · link xem hết hạn sau 60 giây · ghi nhật ký truy cập";
const VIA_LABEL: Record<VerifyVia, string> = { code: "theo mã hồ sơ", file: "theo tệp tải lên" };
const KIND_LABEL: Record<VerifyResult["kind"], string> = {
  match: "Khớp với bản niêm phong",
  mismatch: "KHÔNG khớp với bản niêm phong",
  not_found: "Không tìm thấy bản niêm phong",
};

export const evidenceText = (r: VerifyResult) => {
  const lines = ["Bằng chứng đối soát · Bamboo Sổ cái (chuỗi hash kiểm toán)", `Kết quả: ${KIND_LABEL[r.kind]}`];
  if (r.kind === "not_found") {
    lines.push(`Truy vấn: ${r.query}`);
    if (r.sha256) lines.push(`SHA-256 tệp: ${r.sha256}`);
  } else {
    const s = r.seal;
    lines.push(
      `Hồ sơ: ${s.code} · v${s.version} · ${s.title}`,
      `Tệp: ${s.fileName}`,
      `Niêm phong: ${s.sealedAt} · chuỗi ${s.channel} · dòng nhật ký #${s.block ?? "—"}`,
      `Mã hash dòng nhật ký: ${s.txId ?? "—"}`,
      `SHA-256 đã niêm phong: ${s.sha256}`,
    );
    if (r.kind === "mismatch") {
      lines.push(`SHA-256 tệp hiện tại: ${r.actualSha256 ?? "—"}`);
      if (r.problem) lines.push(`Ghi chú: ${r.problem}`);
    }
    if (r.fileName) lines.push(`Tệp đối soát: ${r.fileName}`);
  }
  lines.push(`Đối soát lúc: ${r.checkedAt} (${VIA_LABEL[r.via]})`);
  return lines.join("\n");
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const certificateHtml = (r: Exclude<VerifyResult, { kind: "not_found" }>) => {
  const s = r.seal;
  const ok = r.kind === "match";
  const rows: Array<[string, string]> = [
    ["Hồ sơ", `${s.code} · phiên bản ${s.version}`],
    ["Tiêu đề", s.title],
    ["Tệp", s.fileName],
    ["Niêm phong", `${s.sealedAt} · chuỗi ${s.channel} · dòng nhật ký #${s.block ?? "—"}`],
    ["Mã hash dòng nhật ký", s.txId ?? "—"],
    ["SHA-256 đã niêm phong", s.sha256],
    ...(r.kind === "mismatch"
      ? ([["SHA-256 tệp hiện tại", r.actualSha256 ?? "—"], ...(r.problem ? [["Ghi chú", r.problem]] : [])] as Array<
          [string, string]
        >)
      : []),
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
<h1>Chứng nhận đối soát toàn vẹn</h1><p>Bamboo · DX-OS Open-Core · Sổ cái (chuỗi hash nhật ký kiểm toán)</p>
<div class="badge">${ok ? "✓ Khớp với bản niêm phong" : "✗ Không khớp với bản niêm phong"}</div>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="${/SHA|hash/.test(k) ? "mono" : ""}">${esc(v)}</td></tr>`).join("")}</table>
<footer>Kiểm chứng lại: tính SHA-256 của tệp gốc và so với SHA-256 đã niêm phong; dòng nhật ký #${esc(String(s.block ?? "—"))} nằm trong chuỗi hash kiểm toán của ${esc(s.channel)}. Tài liệu được tạo tự động.</footer>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
};

export const reconciliationCsv = (seals: Seal[]) => {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = [
    "Mã hồ sơ",
    "Phiên bản",
    "Tiêu đề",
    "Tệp",
    "Niêm phong lúc",
    "Chuỗi",
    "Dòng nhật ký",
    "Mã hash dòng nhật ký",
    "SHA-256",
    "Kết quả đối soát gần nhất",
    "Đối soát lúc",
  ];
  const label = { match: "Khớp", mismatch: "Không khớp", not_found: "Không tìm thấy" } as const;
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
    s.lastResult ? label[s.lastResult] : "Chưa đối soát",
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
