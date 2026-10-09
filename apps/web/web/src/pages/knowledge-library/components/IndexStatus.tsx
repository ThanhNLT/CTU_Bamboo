// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Dot, type Tone } from "../../../components/ui";
import type { IndexState } from "../types";

const VIEW: Record<IndexState["status"], { label: string; tone: Tone; text: string }> = {
  indexed: { label: "Đã nạp", tone: "success", text: "text-body" },
  indexing: { label: "Đang nạp", tone: "warning", text: "text-amber-700" },
  failed: { label: "Lỗi nạp", tone: "danger", text: "text-red-700" },
};

export const indexTone = (s: IndexState) => VIEW[s.status].tone;

/** Nhãn ngắn trạng thái nạp vào Trợ lý: chấm màu + chữ. */
export const IndexStatus = ({ state }: { state: IndexState }) => {
  const v = VIEW[state.status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] ${v.text}`}>
      <Dot tone={v.tone} className={state.status === "indexing" ? "motion-safe:animate-pulse" : undefined} />
      {v.label}
    </span>
  );
};
