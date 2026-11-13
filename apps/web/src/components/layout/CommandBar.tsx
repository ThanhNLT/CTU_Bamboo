/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import {
  type ActionImpl,
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarResults,
  KBarSearch,
  useMatches,
  useRefineKbar,
} from "@refinedev/kbar";
import { forwardRef } from "react";

import { useLocale } from "../../i18n";
import { cn } from "../../utils/cn";

const ResultItem = forwardRef<HTMLDivElement, { action: ActionImpl; active: boolean; rootActionId?: string | null }>(
  ({ action, active, rootActionId }, ref) => {
    const index = rootActionId ? action.ancestors.findIndex((a) => a.id === rootActionId) : -1;
    const ancestors = action.ancestors.slice(index + 1);
    return (
      <div
        ref={ref}
        className={cn(
          "mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-ui px-3 py-2.5 text-[14px] transition-colors duration-200 ease-out",
          active ? "bg-bamboo-600 text-white shadow-glass-active" : "text-ink",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {action.icon && (
            <span className={cn("grid shrink-0 place-items-center", active ? "text-white" : "text-bamboo-700")}>
              {action.icon}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <div className="truncate">
              {ancestors.map((a) => (
                <span key={a.id} className={cn("mr-2", active ? "text-white/75" : "text-muted")}>
                  {a.name} ›
                </span>
              ))}
              <span className={cn(!active && action.name.toUpperCase() === "DELETE" && "text-red-600")}>
                {action.name}
              </span>
            </div>
            {action.subtitle && (
              <span className={cn("text-[12px]", active ? "text-white/75" : "text-muted")}>{action.subtitle}</span>
            )}
          </div>
        </div>
        {action.shortcut?.length ? (
          <div aria-hidden className="grid auto-cols-max grid-flow-col gap-1">
            {action.shortcut.map((sc) => (
              <kbd
                key={sc}
                className={cn(
                  "rounded-ui px-1.5 py-0.5 font-sans text-[12px]",
                  active ? "bg-white/20 text-white" : "bg-black/[0.06] text-muted",
                )}
              >
                {sc}
              </kbd>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
ResultItem.displayName = "ResultItem";

const Results = () => {
  const { results, rootActionId } = useMatches();
  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === "string" ? (
          <div className="px-5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {item}
          </div>
        ) : (
          <ResultItem action={item} active={active} rootActionId={rootActionId} />
        )
      }
    />
  );
};

export const CommandBar = () => {
  useRefineKbar();
  const { t } = useLocale();
  return (
    <KBarPortal>
      <KBarPositioner className="z-[9999] bg-[rgb(0_0_0/0.35)] backdrop-blur-[2px] backdrop-saturate-150">
        <KBarAnimator className="glass w-full max-w-[600px] bg-surface/90 overflow-hidden rounded-[22px] border border-line pb-2 text-ink shadow-float">
          <KBarSearch
            defaultPlaceholder={t("Gõ lệnh hoặc tìm kiếm…")}
            className="w-full border-0 border-b border-line bg-transparent px-5 py-3.5 text-[15px] text-ink outline-none placeholder:text-muted"
          />
          <Results />
        </KBarAnimator>
      </KBarPositioner>
    </KBarPortal>
  );
};
