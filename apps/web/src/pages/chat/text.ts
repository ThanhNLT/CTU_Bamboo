/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

/** Bỏ dấu, chữ thường: tìm "nguyen" ra "Nguyễn". */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type Part = { text: string; mention?: boolean; url?: boolean };

const TOKEN = /(https?:\/\/[^\s<>"']+)|(@[\p{L}][\p{L}\p{M} ]{0,60}?)(?=$|[\s,.;:!?)])/gu;

/**
 * Tách nội dung tin thành đoạn thường, liên kết và tên được nhắc (@Họ tên khớp tên thành viên được nhắc).
 * Chỉ tô đậm tên có trong `names`, không tin vào chữ @ người gửi tự gõ.
 */
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
