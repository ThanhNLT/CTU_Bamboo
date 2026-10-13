// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import type { Tone } from "../../../components/ui";
import type { SlaLevel } from "../types";

// ===== Hằng số =====
export const SLA_TONE: Record<SlaLevel, Tone> = { overdue: "danger", urgent: "warning", ok: "success" };

export const SLA_PILL: Record<SlaLevel, string> = {
  overdue: "bg-red-50 text-red-700",
  urgent: "bg-amber-50 text-amber-800",
  ok: "bg-bamboo-50 text-bamboo-700",
};

// ===== Hàm tiện ích =====
/** "còn 3 giờ 20 phút" → "Còn 3 giờ 20 phút" */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
