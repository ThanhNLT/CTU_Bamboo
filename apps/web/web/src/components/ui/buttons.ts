// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nút hành động cấp trang (đầu trang): cùng chiều cao 40px, bo tròn, một kiểu cho mọi trang.
const base =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:opacity-50";

export const secondaryButtonClass = `${base} border border-line bg-white font-medium text-ink shadow-card hover:bg-bamboo-50`;

export const primaryButtonClass =
  `${base} bg-bamboo-600 font-semibold text-white shadow-[0_1px_2px_rgb(31_81_42/0.25)] hover:bg-bamboo-700`;

// Nút nhỏ trong thẻ (h-8): dùng cho thao tác phụ bên trong nội dung, không dùng ở đầu trang.
const small =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:cursor-not-allowed disabled:opacity-50";

export const smallSecondaryButtonClass = `${small} border border-line bg-canvas font-medium text-ink hover:bg-bamboo-50`;

export const smallPrimaryButtonClass = `${small} bg-bamboo-600 font-semibold text-white hover:bg-bamboo-700`;
