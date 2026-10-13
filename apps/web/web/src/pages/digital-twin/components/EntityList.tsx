// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { RadioTower } from "lucide-react";
import { Dot, SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { TwinEntity } from "../types";
import { ENTITY_STATUS } from "../utils";

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
      selected ? "border-bamboo-200 bg-bamboo-50" : "border-line bg-white shadow-card hover:border-bamboo-200",
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

/** Cột trái: ô lọc + danh sách thực thể (cuộn độc lập). Mũi tên lên/xuống để chuyển thực thể. */
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
  /** Hiện loại thiết bị trên thẻ (hữu ích ở tab "Tất cả"). */
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
        placeholder="Lọc thực thể"
        label="Lọc thực thể theo mã, tên, địa điểm"
      />

      {entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <RadioTower className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13px] font-medium text-ink">Không có thực thể phù hợp</p>
          <p className="text-[12px] text-muted">Thử tìm theo mã (CR-02) hoặc địa điểm (Bắc Ninh).</p>
        </div>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-0.5 pr-1" aria-label="Thực thể">
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
