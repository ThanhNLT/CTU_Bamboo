/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { ChevronDown, ChevronRight, Diamond } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { tr, trf } from "../../../i18n";
import { cn } from "../../../utils/cn";
import type { Dependency, Task } from "../types";

dayjs.extend(isoWeek);

export type Zoom = "day" | "week" | "month";

const PX: Record<Zoom, number> = { day: 30, week: 13, month: 4 };
const ROW = 36;
const HEAD = 48;

type Drag = { id: string; mode: "move" | "end"; x0: number; delta: number };

const fmt = (d: Dayjs) => d.format("DD-MMM-YYYY");

export const Gantt = ({
  tasks,
  deps,
  from,
  to,
  zoom,
  canEdit,
  showCritical,
  showBaseline,
  onOpen,
  onMove,
}: {
  tasks: Task[];
  deps: Dependency[];
  from: string;
  to: string;
  zoom: Zoom;
  canEdit: boolean;
  showCritical: boolean;
  showBaseline: boolean;
  onOpen: (t: Task) => void;
  onMove: (t: Task, start: string, end: string) => void;
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const px = PX[zoom];

  const start = useMemo(() => {
    const first = tasks.reduce((m, t) => (t.start_date < m ? t.start_date : m), from);
    return dayjs(first)
      .subtract(zoom === "month" ? 14 : 3, "day")
      .startOf(zoom === "day" ? "day" : "isoWeek");
  }, [tasks, from, zoom]);
  const end = useMemo(() => {
    const last = tasks.reduce((m, t) => (t.end_date > m ? t.end_date : m), to);
    return dayjs(last).add(zoom === "month" ? 45 : 14, "day");
  }, [tasks, to, zoom]);
  const days = end.diff(start, "day") + 1;
  const width = days * px;

  const visible = useMemo(() => {
    const hidden = new Set<string>();
    const out: Task[] = [];
    for (const t of tasks) {
      if (t.parent_id && (hidden.has(t.parent_id) || collapsed.has(t.parent_id))) {
        hidden.add(t.id);
        continue;
      }
      out.push(t);
    }
    return out;
  }, [tasks, collapsed]);
  const rowOf = useMemo(() => new Map(visible.map((t, i) => [t.id, i])), [visible]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const x = (date: string | Dayjs) => dayjs(date).diff(start, "day") * px;

  const shown = (t: Task) => {
    if (drag?.id !== t.id) return { s: t.start_date, e: t.end_date };
    const s = drag.mode === "move" ? dayjs(t.start_date).add(drag.delta, "day") : dayjs(t.start_date);
    let e = dayjs(t.end_date).add(drag.delta, "day");
    if (e.isBefore(s)) e = s;
    return { s: s.format("YYYY-MM-DD"), e: e.format("YYYY-MM-DD") };
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const today = dayjs();
    const target = today.isAfter(start) && today.isBefore(end) ? x(today) - 120 : 0;
    el.scrollLeft = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, start.valueOf()]);

  const beginDrag = (e: ReactPointerEvent, t: Task, mode: Drag["mode"]) => {
    if (!canEdit || t.has_children) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ id: t.id, mode, x0: e.clientX, delta: 0 });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x0) / px);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const endDrag = (t: Task) => {
    if (!drag) return;
    const { s, e } = shown(t);
    const changed = drag.delta !== 0;
    setDrag(null);
    if (changed) onMove(t, s, t.milestone ? s : e);
    else onOpen(t);
  };

  const ticks = useMemo(() => {
    const out: { d: Dayjs; major: boolean; label: string }[] = [];
    for (let i = 0; i < days; i++) {
      const d = start.add(i, "day");
      if (zoom === "day") out.push({ d, major: d.date() === 1 || i === 0, label: String(d.date()) });
      else if (zoom === "week" && d.isoWeekday() === 1)
        out.push({ d, major: d.date() <= 7, label: d.format("DD-MMM") });
      else if (zoom === "month" && d.date() === 1) out.push({ d, major: d.month() === 0, label: d.format("MMM-YYYY") });
    }
    return out;
  }, [start, days, zoom]);
  const months = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = [];
    let cur = start.startOf("month");
    while (cur.isBefore(end)) {
      const a = cur.isBefore(start) ? start : cur;
      const nxt = cur.add(1, "month");
      const b = nxt.isAfter(end) ? end : nxt;
      out.push({
        label: zoom === "month" ? cur.format("YYYY") : cur.format("MMM-YYYY"),
        left: a.diff(start, "day") * px,
        width: b.diff(a, "day") * px,
      });
      cur = nxt;
    }
    return out;
  }, [start, end, px, zoom]);

  const today = dayjs().startOf("day");
  const arrows = deps
    .map((d) => {
      const p = byId.get(d.predecessor_id);
      const s = byId.get(d.successor_id);
      const pr = rowOf.get(d.predecessor_id);
      const sr = rowOf.get(d.successor_id);
      if (!p || !s || pr === undefined || sr === undefined) return null;
      const ps = shown(p);
      const ss = shown(s);
      const x1 = p.milestone ? x(ps.s) + px / 2 + 6 : x(dayjs(ps.e).add(1, "day"));
      const y1 = pr * ROW + ROW / 2;
      const x2 = s.milestone ? x(ss.s) + px / 2 - 6 : x(ss.s);
      const y2 = sr * ROW + ROW / 2;
      const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 8));
      const path =
        x2 - 8 >= x1 + 8
          ? `M${x1},${y1} H${mid} V${y2} H${x2 - 1}`
          : `M${x1},${y1} H${x1 + 8} V${y1 + (y2 > y1 ? ROW / 2 : -ROW / 2)} H${x2 - 8} V${y2} H${x2 - 1}`;
      const critical = showCritical && p.critical && s.critical;
      return { key: `${d.predecessor_id}-${d.successor_id}`, path, critical };
    })
    .filter(Boolean) as { key: string; path: string; critical: boolean }[];

  return (
    <div
      ref={scroller}
      className="relative min-h-0 flex-1 overflow-auto"
      onPointerMove={moveDrag}
      role="grid"
      aria-label={tr("Sơ đồ Gantt")}
    >
      <div className="relative flex" style={{ width: `calc(var(--gantt-left) + ${width}px)` }}>
        <div className="sticky left-0 z-20 w-[var(--gantt-left)] shrink-0 border-r border-line bg-[var(--surface-solid)]">
          <div
            className="sticky top-0 z-10 grid grid-cols-[52px_1fr_44px] items-end border-b border-line bg-[var(--surface-solid)] px-2 pb-1.5 text-[11.5px] font-semibold text-muted md:grid-cols-[52px_1fr_120px_44px]"
            style={{ height: HEAD }}
          >
            <span>WBS</span>
            <span>{tr("Công việc")}</span>
            <span className="max-md:hidden">{tr("Phụ trách")}</span>
            <span className="text-right">%</span>
          </div>
          {visible.map((t) => (
            <div
              key={t.id}
              role="row"
              className={cn(
                "grid cursor-pointer grid-cols-[52px_1fr_44px] items-center border-b border-line/70 px-2 text-[12.5px] hover:bg-bamboo-50 md:grid-cols-[52px_1fr_120px_44px]",
                t.has_children && "font-semibold",
                t.late && "text-red-700",
              )}
              style={{ height: ROW }}
              onClick={() => onOpen(t)}
            >
              <span className="text-muted">{t.wbs}</span>
              <span className="flex min-w-0 items-center gap-1" style={{ paddingLeft: t.level * 14 }}>
                {t.has_children ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      });
                    }}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-bamboo-100"
                    aria-label={collapsed.has(t.id) ? tr("Mở rộng") : tr("Thu gọn")}
                  >
                    {collapsed.has(t.id) ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                {t.milestone && <Diamond className="h-3 w-3 shrink-0 fill-current text-bamboo-700" aria-hidden />}
                <span className="truncate" title={t.name}>
                  {t.name}
                </span>
              </span>
              <span className="truncate text-muted max-md:hidden">{t.assignee_name ?? "—"}</span>
              <span className="text-right tabular-nums">{t.progress}</span>
            </div>
          ))}
        </div>

        <div className="relative shrink-0" style={{ width, height: HEAD + visible.length * ROW }}>
          <div className="sticky top-0 z-10 border-b border-line bg-[var(--surface-solid)]" style={{ height: HEAD }}>
            {months.map((m) => (
              <div
                key={m.left}
                className="absolute top-0 truncate border-l border-line px-1.5 pt-1 text-[11.5px] font-semibold text-ink"
                style={{ left: m.left, width: m.width }}
              >
                {m.label}
              </div>
            ))}
            {ticks.map((t) => (
              <div
                key={t.d.valueOf()}
                className={cn(
                  "absolute bottom-0 border-l px-0.5 text-[10.5px] text-muted",
                  t.major ? "border-line" : "border-line/60",
                )}
                style={{ left: x(t.d), height: 20 }}
              >
                {zoom === "day" ? (
                  <span className={cn(t.d.isoWeekday() >= 6 && "text-red-500/80")}>{t.label}</span>
                ) : (
                  t.label
                )}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: HEAD }} aria-hidden>
            {zoom === "day" &&
              Array.from({ length: days }, (_, i) => start.add(i, "day"))
                .filter((d) => d.isoWeekday() >= 6)
                .map((d) => (
                  <div
                    key={d.valueOf()}
                    className="absolute inset-y-0 bg-black/[0.03]"
                    style={{ left: x(d), width: px }}
                  />
                ))}
            {ticks.map((t) => (
              <div
                key={t.d.valueOf()}
                className="absolute inset-y-0 border-l border-line/50"
                style={{ left: x(t.d) }}
              />
            ))}
            {!today.isBefore(start) && !today.isAfter(end) && (
              <div
                className="absolute inset-y-0 z-[5] border-l-2 border-red-500/80"
                style={{ left: x(today) + px / 2 }}
              />
            )}
          </div>
          <svg
            className="pointer-events-none absolute left-0 z-[6]"
            style={{ top: HEAD }}
            width={width}
            height={visible.length * ROW}
            aria-hidden
          >
            <defs>
              <marker
                id="gantt-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path
                key={a.key}
                d={a.path}
                fill="none"
                strokeWidth={1.4}
                markerEnd="url(#gantt-arrow)"
                className={a.critical ? "text-red-500" : "text-muted"}
                stroke="currentColor"
              />
            ))}
          </svg>
          <div className="absolute inset-x-0 z-[7]" style={{ top: HEAD }}>
            {visible.map((t, i) => {
              const { s, e } = shown(t);
              const left = x(s);
              const w = (dayjs(e).diff(dayjs(s), "day") + 1) * px;
              const top = i * ROW;
              const crit = showCritical && t.critical && !t.has_children;
              const label = `${t.name}: ${fmt(dayjs(s))} – ${fmt(dayjs(e))}, ${t.progress}%`;
              return (
                <div key={t.id} className="absolute inset-x-0" style={{ top, height: ROW }}>
                  {showBaseline && t.baseline_start && t.baseline_end && (
                    <div
                      className="absolute h-1 rounded-full bg-gray-400/60"
                      style={{
                        left: x(t.baseline_start),
                        width: (dayjs(t.baseline_end).diff(t.baseline_start, "day") + 1) * px,
                        top: ROW - 8,
                      }}
                      title={trf("Đường cơ sở: {0} – {1}", [fmt(dayjs(t.baseline_start)), fmt(dayjs(t.baseline_end))])}
                    />
                  )}
                  {t.milestone ? (
                    <button
                      type="button"
                      aria-label={label}
                      title={label}
                      onPointerDown={(ev) => beginDrag(ev, t, "move")}
                      onPointerUp={() => endDrag(t)}
                      onClick={() => !canEdit && onOpen(t)}
                      className={cn(
                        "absolute top-[9px] h-[18px] w-[18px] rotate-45 rounded-[3px] border-2 shadow-sm",
                        t.progress === 100
                          ? "border-bamboo-700 bg-bamboo-600"
                          : crit
                            ? "border-red-600 bg-red-100"
                            : "border-bamboo-700 bg-surface",
                        canEdit && "cursor-grab",
                      )}
                      style={{ left: left + px / 2 - 9 }}
                    />
                  ) : t.has_children ? (
                    <button
                      type="button"
                      aria-label={label}
                      title={label}
                      onClick={() => onOpen(t)}
                      className="absolute top-[12px] h-[10px]"
                      style={{ left, width: w }}
                    >
                      <span className="absolute inset-x-0 top-0 h-[6px] rounded-sm bg-ink/75" />
                      <span className="absolute left-0 top-0 h-[10px] w-[3px] rounded-b bg-ink/75" />
                      <span className="absolute right-0 top-0 h-[10px] w-[3px] rounded-b bg-ink/75" />
                      <span
                        className="absolute left-0 top-0 h-[6px] rounded-sm bg-bamboo-500"
                        style={{ width: `${t.progress}%` }}
                      />
                    </button>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={label}
                      title={label}
                      onPointerDown={(ev) => beginDrag(ev, t, "move")}
                      onPointerUp={() => endDrag(t)}
                      onClick={() => !canEdit && onOpen(t)}
                      onKeyDown={(ev) => ev.key === "Enter" && onOpen(t)}
                      className={cn(
                        "group absolute top-[7px] h-[22px] overflow-hidden rounded-md border text-[11px] leading-[20px] shadow-sm",
                        crit ? "border-red-500 bg-red-100" : "border-bamboo-500 bg-bamboo-100",
                        t.late && "ring-2 ring-red-400/60",
                        canEdit && "cursor-grab active:cursor-grabbing",
                        drag?.id === t.id && "opacity-80 ring-2 ring-bamboo-400",
                      )}
                      style={{ left, width: Math.max(w, 6) }}
                    >
                      <span
                        className={cn("absolute inset-y-0 left-0", crit ? "bg-red-400/70" : "bg-bamboo-500/80")}
                        style={{ width: `${t.progress}%` }}
                      />
                      {w > 60 && (
                        <span className="relative z-[1] block truncate px-1.5 font-medium text-ink">
                          {t.assignee_name ?? t.name}
                        </span>
                      )}
                      {canEdit && (
                        <span
                          onPointerDown={(ev) => beginDrag(ev, t, "end")}
                          className="absolute inset-y-0 right-0 z-[2] w-2 cursor-ew-resize bg-black/0 group-hover:bg-black/15"
                          aria-hidden
                        />
                      )}
                    </div>
                  )}
                  {drag?.id === t.id && (
                    <span
                      className="absolute top-[-14px] z-30 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10.5px] text-surface"
                      style={{ left }}
                    >
                      {fmt(dayjs(s))} → {fmt(dayjs(e))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
