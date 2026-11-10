import { Inbox } from "lucide-react";

import { Dot } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { InboxTask } from "../types";
import { SLA_TONE } from "./slaStyle";
import { tr } from "../../../i18n";

export const TaskSidebar = ({
  tasks,
  selectedId,
  onSelect,
  me,
  className,
}: {
  tasks: InboxTask[];
  selectedId?: string;
  onSelect: (id: string) => void;
  me: string;
  className?: string;
}) => (
  <nav
    aria-label={tr("Danh sách việc")}
    className={cn("min-h-0 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-card", className)}
  >
    {tasks.length === 0 ? (
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
        <Inbox className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] font-medium text-ink">{tr("Hộp việc trống")}</p>
        <p className="text-[12px] text-muted">{tr("Bạn đã xử lý hết việc.")}</p>
      </div>
    ) : (
      <ul className="m-0 list-none p-0">
        {tasks.map((t, i) => {
          const selected = t.id === selectedId;
          const hideDivider = i === 0 || selected || tasks[i - 1]?.id === selectedId;
          return (
            <li key={t.id} className="relative">
              {!hideDivider && <span className="absolute inset-x-3 top-0 h-px bg-line/80" aria-hidden />}
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "block w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                  selected ? "bg-bamboo-50" : "hover:bg-canvas",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] tracking-tight text-muted">{t.code}</span>
                  <Dot tone={SLA_TONE[t.sla.level]} size="md" />
                </span>
                <span className="mt-1 block text-[13.5px] font-semibold leading-snug text-ink">{t.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-[11.5px]",
                    t.sla.level === "overdue" ? "text-red-700" : "text-muted",
                  )}
                >
                  {tr("Cấp ")} {t.level} · {t.sla.label}
                  {t.assignee !== me && ` · ${t.assignee}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </nav>
);
