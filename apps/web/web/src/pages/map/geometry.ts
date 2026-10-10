// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hình nền bản đồ giả lập (hệ tọa độ 1000×700) — dùng chung cho màn hình (MapBackdrop) và ảnh xuất.
export const VIEWBOX = { w: 1000, h: 700 };

export const PARKS = [
  "M720 205c40-48 125-52 160-6 30 40 18 110-30 132-52 24-128 14-150-36-12-28-2-62 20-90z",
  "M118 465c28-40 102-40 128 4 22 38 4 92-44 104-44 12-96-6-104-46-4-22 6-44 20-62z",
];
export const RIVER = "M-20 640C120 600 260 520 400 560s240 120 360 60 200-170 260-200";
export const ROADS = [
  "M-10 250L1010 330", // trục ngang chính
  "M390 -10L310 710", // trục dọc trái
  "M650 -10L620 710", // trục dọc phải
  "M-10 560L560 470", // đường chéo nam
  "M860 -10L960 710",
];
export const MINOR_ROADS = ["M0 120L1000 150", "M150 -10L120 710", "M520 300L540 710", "M780 330L1000 470", "M0 420L380 380"];
export const BOUNDARIES = ["M60 60L540 40L560 360L300 420L80 330Z", "M560 360L940 300L960 640L600 660Z"];
