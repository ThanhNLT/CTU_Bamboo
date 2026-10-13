// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
/** Mức độ dùng chung cho chấm trạng thái, chữ ghi chú... trên mọi trang. */
export type Tone = "success" | "warning" | "danger" | "neutral";

// ===== Hằng số =====
export const TONE_DOT: Record<Tone, string> = {
  success: "bg-bamboo-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-gray-400",
};
