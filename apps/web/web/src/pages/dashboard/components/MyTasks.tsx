// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Segmented } from "antd";
import { useState } from "react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { DueLevel, TaskItem } from "../types";
import { Panel, PanelLink } from "../../../components/ui";

type View = "list" | "kanban" | "calendar";

const VIEW_OPTIONS: Array<{ label: string; value: View }> = [
  { label: "Danh sách", value: "list" },
  { label: "Kanban", value: "kanban" },
  { label: "Lịch", value: "calendar" },
];

const DUE_STYLE: Record<DueLevel, { pill: string; dot: string; column: string }> = {
  overdue: { pill: "bg-red-50 text-red-700", dot: "bg-red-500", column: "Quá hạn" },
  urgent: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500", column: "Sắp đến hạn" },
  ok: { pill: "bg-bamboo-50 text-bamboo-700", dot: "bg-bamboo-500", column: "Trong hạn" },
};

const DueTag = ({ task }: { task: TaskItem }) => {
  const s = DUE_STYLE[task.dueLevel];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ui px-2.5 py-1 text-[11.5px] font-medium",
        s.pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-ui", s.dot)} aria-hidden />
      {task.dueLabel}
    </span>
  );
};

const Code = ({ children }: { children: string }) => (
  <span className="font-mono text-[11.5px] tracking-tight text-muted">{children}</span>
);

const TaskRow = ({ task }: { task: TaskItem }) => (
  <li>
    <Link
      to={task.to}
      className="-mx-2 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-canvas sm:grid-cols-[150px_minmax(0,1fr)_auto]"
    >
      <Code>{task.code}</Code>
      <span className="col-span-2 row-start-2 min-w-0 truncate text-[13.5px] font-medium text-ink sm:col-span-1 sm:row-start-auto">
        {task.title}
      </span>
      <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
        <DueTag task={task} />
      </span>
    </Link>
  </li>
);

const ListView = ({ tasks }: { tasks: TaskItem[] }) => (
  <ul className="m-0 list-none divide-y divide-line p-0">
    {tasks.map((t) => (
      <TaskRow key={t.code} task={t} />
    ))}
  </ul>
);

const KanbanView = ({ tasks }: { tasks: TaskItem[] }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {(Object.keys(DUE_STYLE) as DueLevel[]).map((level) => {
      const items = tasks.filter((t) => t.dueLevel === level);
      return (
        <div key={level} className="rounded-xl bg-canvas p-2.5">
          <div className="mb-2 flex items-center gap-2 px-1 text-[12px] font-semibold text-body">
            <span className={cn("h-1.5 w-1.5 rounded-ui", DUE_STYLE[level].dot)} aria-hidden />
            {DUE_STYLE[level].column}
            <span className="ml-auto font-medium tabular-nums text-muted">{items.length}</span>
          </div>
          <div className="space-y-2">
            {items.map((t) => (
              <Link
                key={t.code}
                to={t.to}
                className="block rounded-lg border border-line bg-surface p-2.5 shadow-card hover:border-bamboo-200"
              >
                <Code>{t.code}</Code>
                <div className="mt-1 text-[13px] font-medium leading-snug text-ink">{t.title}</div>
                <div className="mt-2">
                  <DueTag task={t} />
                </div>
              </Link>
            ))}
            {items.length === 0 && <div className="px-1 py-3 text-center text-[12px] text-muted">Không có việc</div>}
          </div>
        </div>
      );
    })}
  </div>
);

const CalendarView = ({ tasks }: { tasks: TaskItem[] }) => {
  const days = [...new Set(tasks.map((t) => t.dueDay))];
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div key={day}>
          <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{day}</div>
          <ListView tasks={tasks.filter((t) => t.dueDay === day)} />
        </div>
      ))}
    </div>
  );
};

export const MyTasks = ({ tasks, total, listLimit = 4 }: { tasks: TaskItem[]; total: number; listLimit?: number }) => {
  const [view, setView] = useState<View>("list");
  return (
    <Panel
      title="Việc của tôi"
      extra={<Segmented size="small" options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as View)} />}
      bodyClassName="px-5 pb-5 pt-1"
    >
      {tasks.length === 0 && <p className="py-6 text-center text-[13px] text-muted">Không có việc nào chờ bạn.</p>}
      {view === "list" && <ListView tasks={tasks.slice(0, listLimit)} />}
      {view === "kanban" && <KanbanView tasks={tasks} />}
      {view === "calendar" && <CalendarView tasks={tasks} />}
      <div className="mt-3">
        <PanelLink to="/p/tasks">Mở Hộp việc ({total})</PanelLink>
      </div>
    </Panel>
  );
};
