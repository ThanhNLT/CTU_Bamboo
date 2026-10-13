// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Hằng số =====
// Đặt VITE_SOURCE_URL (đường dẫn kho mã nguồn) trong .env để liên kết "Mã nguồn" trỏ đúng chỗ.
const SOURCE_URL: string | undefined = import.meta.env.VITE_SOURCE_URL;

// ===== Component =====
export const DashboardFooter = () => (
  <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-[11.5px] text-muted">
    <span>BAMBOO v0.x · Apache-2.0</span>
    {SOURCE_URL ? (
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        className="text-muted underline underline-offset-2 hover:text-ink"
      >
        Mã nguồn
      </a>
    ) : (
      <span className="underline underline-offset-2">Mã nguồn</span>
    )}
    <span>Dữ liệu minh họa</span>
  </footer>
);
