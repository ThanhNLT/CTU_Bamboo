// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import type { DriveNavItem, DriveSection } from "../types";

export const DriveSidebar = ({
  items,
  active,
  onChange,
}: {
  items: DriveNavItem[];
  active: DriveSection;
  onChange: (key: DriveSection) => void;
}) => (
  <nav aria-label="Vùng lưu trữ" className="rounded-2xl border border-line bg-white p-2 shadow-card">
    <ul className="m-0 list-none space-y-0.5 p-0">
      {items.map(({ key, label, icon: Icon, badge }) => {
        const selected = key === active;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onChange(key)}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                selected ? "bg-bamboo-50 font-semibold text-ink" : "text-body hover:bg-canvas hover:text-ink",
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", selected ? "text-bamboo-700" : "text-muted")}
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span className="min-w-5 rounded-full bg-canvas px-1.5 text-center text-[11px] font-medium tabular-nums text-muted">
                  {badge}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);
