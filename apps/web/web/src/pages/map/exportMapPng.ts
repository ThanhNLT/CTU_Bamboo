// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// "Xuất ảnh": dựng lại bản đồ thành SVG (nền + điểm theo các lớp đang bật + chú giải) rồi vẽ sang PNG.
// Không chụp DOM nên không cần thư viện ngoài; ảnh luôn ở toàn cảnh 1000×700 (2× cho màn hình nét).
import { BOUNDARIES, MINOR_ROADS, PARKS, RIVER, ROADS, VIEWBOX } from "./geometry";
import { ATTRIBUTION, COMPANY_STYLE } from "./mock";
import type { CompanyKey, MapSite } from "./types";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

const shape = (company: CompanyKey, x: number, y: number, r = 8) => {
  const c = COMPANY_STYLE[company].color;
  const ring = `stroke="#fff" stroke-width="2"`;
  switch (company) {
    case "phone":
      return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="3" fill="${c}" ${ring}/>`;
    case "chip":
      return `<rect x="${x - r * 0.8}" y="${y - r * 0.8}" width="${1.6 * r}" height="${1.6 * r}" rx="3" fill="${c}" ${ring} transform="rotate(45 ${x} ${y})"/>`;
    case "appliance":
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${ring}/>`;
    case "hospital":
      return `<path d="M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}" stroke="${c}" stroke-width="${r * 0.7}" stroke-linecap="round"/>`;
  }
};

export const buildMapSvg = (sites: MapSite[], showBoundary: boolean) => {
  const { w, h } = VIEWBOX;
  const marks = sites.map((s) => {
    const x = (s.x / 100) * w;
    const y = (s.y / 100) * h;
    const halo = s.alerts.some((a) => a.status === "critical")
      ? `<circle cx="${x}" cy="${y}" r="20" fill="rgba(239,68,68,0.18)"/>`
      : "";
    // Điểm sát mép phải: đặt nhãn bên trái để không bị cắt.
    const left = s.x > 75;
    const label = `<text x="${left ? x - 16 : x + 16}" y="${y + 4}" font-size="13" fill="#1b231e" text-anchor="${left ? "end" : "start"}" font-family="Inter, Arial, sans-serif">${esc(s.name)}</text>`;
    if (s.cluster) {
      return (
        `<circle cx="${x}" cy="${y}" r="16" fill="${COMPANY_STYLE[s.company].color}" stroke="#fff" stroke-width="3"/>` +
        `<text x="${x}" y="${y + 4}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle" font-family="Inter, Arial, sans-serif">${s.cluster.length}</text>` +
        `<text x="${x + 22}" y="${y + 4}" font-size="13" fill="#1b231e" font-family="Inter, Arial, sans-serif">${esc(s.name)}</text>`
      );
    }
    return halo + shape(s.company, x, y) + label;
  });
  const legend = (Object.keys(COMPANY_STYLE) as CompanyKey[])
    .map(
      (k, i) =>
        shape(k, 34 + i * 120, h - 30, 6) +
        `<text x="${46 + i * 120}" y="${h - 26}" font-size="12" fill="#36413a" font-family="Inter, Arial, sans-serif">${COMPANY_STYLE[k].name}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#eef2ee"/>
${PARKS.map((d) => `<path d="${d}" fill="#d7ead9"/>`).join("")}
<path d="${RIVER}" fill="none" stroke="#cfe2ec" stroke-width="14" stroke-linecap="round"/>
${MINOR_ROADS.map((d) => `<path d="${d}" stroke="#fff" stroke-width="4" opacity="0.8"/>`).join("")}
${ROADS.map((d) => `<path d="${d}" stroke="#fff" stroke-width="9"/>`).join("")}
${showBoundary ? BOUNDARIES.map((d) => `<path d="${d}" fill="none" stroke="#6b7670" stroke-width="1.5" stroke-dasharray="8 6"/>`).join("") : ""}
${marks.join("\n")}
<rect x="16" y="${h - 48}" width="490" height="36" rx="18" fill="#fff"/>
${legend}
<text x="${w - 16}" y="${h - 14}" font-size="11" fill="#6b7670" text-anchor="end" font-family="Inter, Arial, sans-serif">${esc(ATTRIBUTION)}</text>
</svg>`;
};

/** Vẽ SVG sang canvas (2×) và tải về PNG. */
export const exportMapPng = (sites: MapSite[], showBoundary: boolean, filename = "ban-do-bamboo.png") =>
  new Promise<void>((resolve, reject) => {
    const svg = buildMapSvg(sites, showBoundary);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = VIEWBOX.w * scale;
      canvas.height = VIEWBOX.h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Trình duyệt không hỗ trợ canvas"));
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Không tạo được ảnh"));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        resolve();
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không dựng được ảnh bản đồ"));
    };
    img.src = url;
  });
