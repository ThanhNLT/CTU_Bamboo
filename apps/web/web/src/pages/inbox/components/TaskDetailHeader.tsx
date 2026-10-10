// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dot } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { InboxTask } from "../types";
import { capitalize, SLA_PILL, SLA_TONE } from "./slaStyle";

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border border-line bg-canvas px-1 font-sans text-[10.5px] text-muted">{children}</kbd>
);

const navBtn =
  "inline-flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-canvas " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bamboo-500 disabled:cursor-default disabled:text-muted/60 disabled:hover:bg-transparent";

/** Mã · bước duyệt, tiêu đề, nhãn SLA và nút Trước (K) / Kế tiếp (J). */
export const TaskDetailHeader = ({
  task, onPrev, onNext, hasPrev, hasNext,
}: {
  task: InboxTask;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) => (
  <header className="flex flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-4 shadow-card md:flex-row md:items-center">
    <div className="min-w-0 flex-1">
      <div className="font-mono text-[11.5px] tracking-tight text-muted">
        {task.code} · Duyệt cấp {task.level}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="text-[18px] font-semibold leading-snug text-ink">{task.title}</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium",
            SLA_PILL[task.sla.level],
          )}
        >
          <Dot tone={SLA_TONE[task.sla.level]} />
          {capitalize(task.sla.label)}
        </span>
      </div>
    </div>

    <div className="flex shrink-0 self-start overflow-hidden rounded-full border border-line bg-white md:self-auto">
      <button type="button" onClick={onPrev} disabled={!hasPrev} className={navBtn} aria-label="Việc trước (phím K)">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Trước <Kbd>K</Kbd>
      </button>
      <span className="w-px self-stretch bg-line" aria-hidden />
      <button type="button" onClick={onNext} disabled={!hasNext} className={navBtn} aria-label="Việc kế tiếp (phím J)">
        Kế tiếp <Kbd>J</Kbd>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  </header>
);
