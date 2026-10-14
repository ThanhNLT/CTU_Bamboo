// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { DatabaseZap } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { Dataset } from "../types";
import { DatasetTags } from "./DatasetTags";

export const DatasetCard = ({
  dataset,
  selected,
  onSelect,
  onKeyNav,
}: {
  dataset: Dataset;
  selected: boolean;
  onSelect: () => void;
  onKeyNav: (delta: number) => void;
}) => (
  <button
    id={`ds-${dataset.id}`}
    type="button"
    onClick={onSelect}
    onKeyDown={(e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        onKeyNav(e.key === "ArrowDown" ? 1 : -1);
      }
    }}
    aria-current={selected ? "true" : undefined}
    className={cn(
      "block w-full rounded-2xl border bg-white p-4 text-left transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
      selected
        ? "border-bamboo-500 shadow-[0_0_0_3px_var(--color-bamboo-100)]"
        : "border-line shadow-card hover:border-bamboo-200",
    )}
  >
    <span className="flex items-start justify-between gap-3">
      <span className="text-[14px] font-semibold leading-snug text-ink">{dataset.title}</span>
      <span className="shrink-0 pt-0.5 text-[11px] text-muted">{dataset.updatedLabel}</span>
    </span>
    <span className="mt-1 block font-mono text-[11.5px] text-muted">{dataset.table}</span>
    {selected && <span className="mt-2 block text-[12.5px] leading-relaxed text-body">{dataset.description}</span>}
    <span className="mt-2.5 block">
      <DatasetTags dataset={dataset} />
    </span>
  </button>
);

export const DatasetList = ({
  datasets,
  selectedId,
  onSelect,
  className,
}: {
  datasets: Dataset[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}) => {
  const move = (from: number, delta: number) => {
    const next = datasets[Math.min(datasets.length - 1, Math.max(0, from + delta))];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(`ds-${next.id}`)?.focus();
  };

  if (datasets.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center",
          className,
        )}
      >
        <DatabaseZap className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] font-medium text-ink">Không có tập dữ liệu phù hợp</p>
        <p className="text-[12px] text-muted">Thử tìm theo tên cột, ví dụ “tenant_id”.</p>
      </div>
    );
  }

  return (
    <ul
      className={cn("m-0 min-h-0 list-none space-y-3 overflow-y-auto p-0.5 pr-1", className)}
      aria-label="Tập dữ liệu"
    >
      {datasets.map((d, i) => (
        <li key={d.id}>
          <DatasetCard
            dataset={d}
            selected={d.id === selectedId}
            onSelect={() => onSelect(d.id)}
            onKeyNav={(delta) => move(i, delta)}
          />
        </li>
      ))}
    </ul>
  );
};
