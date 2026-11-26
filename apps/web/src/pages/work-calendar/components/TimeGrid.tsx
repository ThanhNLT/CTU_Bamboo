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
import { Repeat } from "lucide-react";
import { useEffect, useRef } from "react";

import { tr } from "../../../i18n";
import { cn } from "../../../utils/cn";
import { KIND_STYLE, layoutDay, onDay, type CalEvent } from "../model";

const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GUTTER = "overflow-y-hidden [scrollbar-gutter:stable]";

const Chip = ({ e, onOpen }: { e: CalEvent; onOpen: (e: CalEvent) => void }) => (
  <button
    type="button"
    onClick={(ev) => {
      ev.stopPropagation();
      onOpen(e);
    }}
    className={cn(
      "w-full truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11.5px] font-medium",
      KIND_STYLE[e.kind],
      e.my_response === "DECLINED" && "line-through opacity-60",
    )}
    title={e.title}
  >
    {e.title}
  </button>
);

export const TimeGrid = ({
  days,
  events,
  onOpen,
  onCreate,
}: {
  days: Dayjs[];
  events: CalEvent[];
  onOpen: (e: CalEvent) => void;
  onCreate: (start: Dayjs, allDay?: boolean) => void;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const now = dayjs();

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX;
  }, []);

  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn("grid border-b border-line", GUTTER)} style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const today = d.isSame(now, "day");
          return (
            <div key={d.toString()} className="flex flex-col items-center border-l border-line py-1.5 text-[12px]">
              <span className="font-medium capitalize text-muted">{d.format("ddd")}</span>
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-[14px] font-semibold",
                  today ? "bg-bamboo-600 text-white" : "text-ink",
                )}
              >
                {d.date()}
              </span>
            </div>
          );
        })}
      </div>
      <div className={cn("grid border-b border-line", GUTTER)} style={{ gridTemplateColumns: cols }}>
        <div className="px-1 py-1 text-right text-[10.5px] text-muted">{tr("Cả ngày")}</div>
        {days.map((d) => (
          <div
            key={d.toString()}
            className="flex min-h-7 flex-col gap-0.5 border-l border-line p-0.5"
            onDoubleClick={() => onCreate(d.startOf("day"), true)}
          >
            {events
              .filter((e) => e.all_day && onDay(e, d))
              .map((e) => (
                <Chip key={`${e.id}-${e.starts_at}`} e={e} onOpen={onOpen} />
              ))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10.5px] text-muted"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(events, d);
            const today = d.isSame(now, "day");
            return (
              <div
                key={d.toString()}
                className="relative border-l border-line"
                onClick={(ev) => {
                  const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const minutes = Math.floor(((ev.clientY - rect.top) / HOUR_PX) * 2) * 30;
                  onCreate(d.startOf("day").add(minutes, "minute"));
                }}
                role="presentation"
              >
                {HOURS.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: h * HOUR_PX }} />
                ))}
                {today && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: (now.diff(d.startOf("day"), "minute") / 60) * HOUR_PX }}
                    aria-hidden
                  />
                )}
                {placed.map((p) => (
                  <button
                    key={`${p.event.id}-${p.event.starts_at}`}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(p.event);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left text-[11.5px] leading-tight shadow-sm",
                      KIND_STYLE[p.event.kind],
                      p.event.my_response === "DECLINED" && "opacity-55",
                    )}
                    style={{
                      top: (p.top / 60) * HOUR_PX + 1,
                      height: Math.max((p.height / 60) * HOUR_PX - 2, 18),
                      left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                      width: `calc(${100 / p.cols}% - 4px)`,
                    }}
                    title={p.event.title}
                  >
                    <span className="flex items-center gap-1 font-semibold">
                      {p.event.recurrence !== "NONE" && <Repeat className="h-3 w-3 shrink-0" aria-hidden />}
                      <span className="truncate">{p.event.title}</span>
                    </span>
                    <span className="block truncate opacity-80">
                      {dayjs(p.event.starts_at).format("HH:mm")}–{dayjs(p.event.ends_at).format("HH:mm")}
                      {p.event.location ? ` · ${p.event.location}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
