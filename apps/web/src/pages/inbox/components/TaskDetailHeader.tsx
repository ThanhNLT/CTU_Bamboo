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

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router";

import { Dot } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { InboxTask } from "../types";
import { capitalize, SLA_PILL, SLA_TONE } from "./slaStyle";
import { tr } from "../../../i18n";

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border border-line bg-canvas px-1 font-sans text-[10.5px] text-muted">{children}</kbd>
);

const navBtn =
  "inline-flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-canvas " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bamboo-500 disabled:cursor-default disabled:text-muted/60 disabled:hover:bg-transparent";

export const TaskDetailHeader = ({
  task,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  to,
}: {
  task: InboxTask;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  to?: string;
}) => (
  <header className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card md:flex-row md:items-center">
    <div className="min-w-0 flex-1">
      <div className="font-mono text-[11.5px] tracking-tight text-muted">
        {task.code} {tr(" · Duyệt cấp ")} {task.level}
        {to && (
          <Link
            to={to}
            className="ml-2 inline-flex items-center gap-1 font-sans text-bamboo-700 hover:underline underline-offset-2"
          >
            {tr("Mở chứng từ ")} <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        )}
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

    <div className="flex shrink-0 self-start overflow-hidden rounded-ui border border-line bg-surface md:self-auto">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        className={navBtn}
        aria-label={tr("Việc trước (phím K)")}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {tr("Trước ")} <Kbd>K</Kbd>
      </button>
      <span className="w-px self-stretch bg-line" aria-hidden />
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        className={navBtn}
        aria-label={tr("Việc kế tiếp (phím J)")}
      >
        {tr("Kế tiếp ")} <Kbd>J</Kbd>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  </header>
);
