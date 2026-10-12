// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { pct } from "../utils";

/** Thanh ngang tỉ lệ lượt gọi từng công cụ. */
export const ToolsUsageList = ({ tools }: { tools: Array<{ name: string; share: number }> }) => (
  <ul className="m-0 list-none space-y-2.5 p-0">
    {tools.map((t) => (
      <li key={t.name} className="grid grid-cols-[minmax(96px,140px)_minmax(0,1fr)_40px] items-center gap-3">
        <span className="truncate font-mono text-[12px] text-ink">{t.name}</span>
        <span className="h-2 overflow-hidden rounded-full bg-black/[0.06]" role="img" aria-label={`${t.name}: ${pct(t.share, 0)}`}>
          <span className="block h-full rounded-full bg-bamboo-600" style={{ width: `${Math.max(2, t.share * 100)}%` }} />
        </span>
        <span className="text-right text-[12px] tabular-nums text-body">{pct(t.share, 0)}</span>
      </li>
    ))}
  </ul>
);
