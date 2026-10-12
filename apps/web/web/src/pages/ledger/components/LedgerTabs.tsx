// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import type { LedgerTab } from "../types";

const TABS: Array<{ key: LedgerTab; label: string }> = [
  { key: "verify", label: "Đối soát" },
  { key: "reading", label: "Phòng đọc ảo" },
];

export const LedgerTabs = ({ value, onChange }: { value: LedgerTab; onChange: (t: LedgerTab) => void }) => (
  <div role="tablist" aria-label="Sổ cái" className="inline-flex gap-0.5 self-start rounded-full bg-black/[0.045] p-1">
    {TABS.map((t) => {
      const active = t.key === value;
      return (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`ledger-tab-${t.key}`}
          aria-selected={active}
          aria-controls={`ledger-panel-${t.key}`}
          onClick={() => onChange(t.key)}
          className={cn(
            "h-8 rounded-full px-4 text-[12.5px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
            active ? "bg-white font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);
