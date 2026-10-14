// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import type { Tone } from "../../../components/ui";
import type { IndexState } from "../types";

// ===== Hằng số =====
export const VIEW: Record<IndexState["status"], { label: string; tone: Tone; text: string }> = {
  indexed: { label: "Đã vào chỉ mục", tone: "success", text: "text-body" },
  indexing: { label: "Đang cập nhật chỉ mục", tone: "warning", text: "text-amber-700" },
  missing: { label: "Chưa vào chỉ mục", tone: "warning", text: "text-amber-700" },
  error: { label: "Lỗi chỉ mục", tone: "danger", text: "text-red-700" },
};

// ===== Hàm tiện ích =====
export const indexTone = (s: IndexState) => VIEW[s.status].tone;
