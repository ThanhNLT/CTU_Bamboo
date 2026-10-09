// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Tone } from "../types";

/** Màu chấm trạng thái theo mức độ. */
export const TONE_DOT: Record<Tone, string> = {
  success: "bg-bamboo-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-gray-400",
};
