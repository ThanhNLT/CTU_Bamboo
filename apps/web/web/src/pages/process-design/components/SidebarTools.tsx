// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import { DND_MIME, PALETTE } from "../mock";
import type { NodeType, ProcessDef } from "../types";
import { NodeGlyph } from "./NodeGlyph";

/** Cột trái: danh sách quy trình + bảng thành phần kéo thả. */
export const SidebarTools = ({
  processes, activeId, onSelect,
}: {
  processes: ProcessDef[];
  activeId: string;
  onSelect: (id: string) => void;
}) => (
  <div className="flex min-w-0 flex-col gap-4">
    <nav aria-label="Quy trình" className="rounded-2xl border border-line bg-white p-2 shadow-card">
      <ul className="m-0 list-none p-0">
        {processes.map((p, i) => {
          const active = p.id === activeId;
          const divider = i > 0 && !active && processes[i - 1]?.id !== activeId;
          return (
            <li key={p.id} className="relative">
              {divider && <span className="absolute inset-x-3 top-0 h-px bg-line/80" aria-hidden />}
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "block w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                  active ? "bg-bamboo-50" : "hover:bg-canvas",
                )}
              >
                <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted">{p.note}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>

    <section aria-labelledby="palette-title" className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <h2 id="palette-title" className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        Kéo thả thành phần
      </h2>
      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {PALETTE.map(({ type, label }) => (
          <li key={type}>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_MIME, type satisfies NodeType);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title="Kéo vào canvas để thêm"
              className="flex h-9 cursor-grab select-none items-center gap-2.5 rounded-lg bg-canvas px-3 text-[12.5px] text-ink transition-colors hover:bg-bamboo-50 active:cursor-grabbing"
            >
              <NodeGlyph type={type} />
              {label}
            </div>
          </li>
        ))}
      </ul>
    </section>
  </div>
);
