// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Dot, type Tone } from "../../../components/ui";
import { formatInt } from "../utils";

export type LedgerStat = { key: string; label: string; value: number; note: string; tone?: Tone };

export const LedgerStats = ({ items }: { items: LedgerStat[] }) => (
  <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
    {items.map((s) => (
      <div key={s.key} className="min-w-0 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card">
        <dt className="truncate text-[12px] text-muted">{s.label}</dt>
        <dd className="m-0">
          <span className="mt-1 block text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink">
            {formatInt(s.value)}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
            {s.tone && <Dot tone={s.tone} />}
            <span className="truncate">{s.note}</span>
          </span>
        </dd>
      </div>
    ))}
  </dl>
);
