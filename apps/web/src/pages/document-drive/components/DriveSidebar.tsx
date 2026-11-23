/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { cn } from "../../../utils/cn";
import type { DriveNavItem, DriveSection } from "../types";
import { tr } from "../../../i18n";

export const DriveSidebar = ({
  items,
  active,
  onChange,
  title,
}: {
  items: DriveNavItem[];
  active: DriveSection;
  onChange: (key: DriveSection) => void;
  title?: string;
}) => (
  <nav aria-label={title ?? tr("Vùng lưu trữ")} className="rounded-2xl border border-line bg-surface p-2 shadow-card">
    {title && (
      <p className="m-0 px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
    )}
    <ul className="m-0 list-none flex flex-col gap-0.5 p-0">
      {items.map(({ key, label, icon: Icon, badge, hint }) => {
        const selected = key === active;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onChange(key)}
              title={hint}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex h-9 w-full items-center gap-2.5 rounded-ui px-2.5 text-left text-[13px] transition-colors",
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
                <span className="min-w-5 rounded-ui bg-canvas px-1.5 text-center text-[11px] font-medium tabular-nums text-muted">
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
