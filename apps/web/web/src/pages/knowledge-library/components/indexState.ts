// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Tone } from "../../../components/ui";
import type { IndexState } from "../types";

export const VIEW: Record<IndexState["status"], { label: string; tone: Tone; text: string }> = {
  indexed: { label: "Đã nạp", tone: "success", text: "text-body" },
  indexing: { label: "Đang nạp", tone: "warning", text: "text-amber-700" },
  failed: { label: "Lỗi nạp", tone: "danger", text: "text-red-700" },
};

export const indexTone = (s: IndexState) => VIEW[s.status].tone;
