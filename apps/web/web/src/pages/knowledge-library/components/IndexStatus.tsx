// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Dot } from "../../../components/ui";
import type { IndexState } from "../types";
import { VIEW } from "./indexState";

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
