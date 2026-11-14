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

import { RadioTower } from "lucide-react";

import { Dot, SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { TwinEntity } from "../types";
import { ENTITY_STATUS } from "../utils";
import { tr } from "../../../i18n";

const EntityCard = ({
  entity,
  selected,
  showKind,
  onSelect,
  onKeyNav,
}: {
  entity: TwinEntity;
  selected: boolean;
  showKind: boolean;
  onSelect: () => void;
  onKeyNav: (delta: number) => void;
}) => (
  <button
    id={`twin-${entity.id}`}
    type="button"
    onClick={onSelect}
    onKeyDown={(e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        onKeyNav(e.key === "ArrowDown" ? 1 : -1);
      }
    }}
    aria-current={selected ? "true" : undefined}
    title={`${entity.name} · ${entity.site}`}
    className={cn(
      "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
      selected ? "border-bamboo-200 bg-bamboo-50" : "border-line bg-surface shadow-card hover:border-bamboo-200",
    )}
  >
    <Dot tone={ENTITY_STATUS[entity.status].tone} size="md" className="mt-[7px]" />
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">{entity.id}</span>
        {showKind && <span className="truncate text-[11px] text-muted">{entity.kind}</span>}
      </span>
      <span className="mt-0.5 block truncate text-[12px] text-muted">{entity.subtitle}</span>
    </span>
  </button>
);

export const EntityList = ({
  entities,
  selectedId,
  query,
  showKind,
  onQueryChange,
  onSelect,
  className,
}: {
  entities: TwinEntity[];
  selectedId?: string;
  query: string;
  showKind: boolean;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  className?: string;
}) => {
  const move = (from: number, delta: number) => {
    const next = entities[Math.min(entities.length - 1, Math.max(0, from + delta))];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(`twin-${next.id}`)?.focus();
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={tr("Lọc thực thể")}
        label={tr("Lọc thực thể theo mã, tên, địa điểm")}
      />

      {entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <RadioTower className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13px] font-medium text-ink">{tr("Không có thực thể phù hợp")}</p>
          <p className="text-[12px] text-muted">{tr("Thử tìm theo mã (CR-02) hoặc địa điểm (Bắc Ninh).")}</p>
        </div>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none flex flex-col gap-2 overflow-y-auto p-0.5 pr-1 *:shrink-0" aria-label={tr("Thực thể")}>
          {entities.map((e, i) => (
            <li key={e.id}>
              <EntityCard
                entity={e}
                selected={e.id === selectedId}
                showKind={showKind}
                onSelect={() => onSelect(e.id)}
                onKeyNav={(delta) => move(i, delta)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
