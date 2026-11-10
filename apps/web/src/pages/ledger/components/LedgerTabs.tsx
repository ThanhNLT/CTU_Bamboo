/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { cn } from "../../../utils/cn";
import type { LedgerTab } from "../types";
import { tr } from "../../../i18n";

const TABS: Array<{ key: LedgerTab; label: string }> = [
  { key: "verify", label: tr("Đối soát") },
  { key: "reading", label: tr("Phòng đọc ảo") },
];

export const LedgerTabs = ({ value, onChange }: { value: LedgerTab; onChange: (t: LedgerTab) => void }) => (
  <div
    role="tablist"
    aria-label={tr("Sổ cái")}
    className="inline-flex gap-0.5 self-start rounded-full bg-black/[0.045] p-1"
  >
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
            active ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);
