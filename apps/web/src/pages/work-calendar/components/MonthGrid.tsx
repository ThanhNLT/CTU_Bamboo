import dayjs, { type Dayjs } from "dayjs";

import { tr, trf } from "../../../i18n";
import { cn } from "../../../utils/cn";
import { KIND_DOT, KIND_STYLE, onDay, type CalEvent } from "../model";

const WEEKDAYS = [tr("T2"), tr("T3"), tr("T4"), tr("T5"), tr("T6"), tr("T7"), tr("CN")];

/** Lưới tháng 6 tuần × 7 ngày, mỗi ô tối đa 3 sự kiện rồi "+n". */
export const MonthGrid = ({
  month,
  from,
  events,
  onOpen,
  onDay: openDay,
  onCreate,
}: {
  month: Dayjs;
  from: Dayjs;
  events: CalEvent[];
  onOpen: (e: CalEvent) => void;
  onDay: (d: Dayjs) => void;
  onCreate: (d: Dayjs) => void;
}) => {
  const days = Array.from({ length: 42 }, (_, i) => from.add(i, "day"));
  const now = dayjs();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1.5 text-center text-[12px] font-medium text-muted">
            {w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const list = events.filter((e) => onDay(e, d));
          const inMonth = d.month() === month.month();
          return (
            <div
              key={d.toString()}
              className={cn(
                "flex min-h-[64px] min-w-0 flex-col gap-0.5 border-b border-l border-line p-1 md:min-h-[84px]",
                !inMonth && "bg-canvas/60",
              )}
              onDoubleClick={() => onCreate(d.hour(9))}
            >
              <button
                type="button"
                onClick={() => openDay(d)}
                className={cn(
                  "grid h-6 w-6 place-items-center self-end rounded-full text-[12px] font-semibold hover:bg-bamboo-50",
                  d.isSame(now, "day")
                    ? "bg-bamboo-600 text-white hover:bg-bamboo-700"
                    : inMonth
                      ? "text-ink"
                      : "text-muted",
                )}
                aria-label={d.format("DD/MM/YYYY")}
              >
                {d.date()}
              </button>
              {list.length > 0 && (
                <span className="flex flex-wrap justify-end gap-0.5 md:hidden" aria-hidden>
                  {list.slice(0, 6).map((e) => (
                    <span key={`${e.id}-${e.starts_at}`} className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[e.kind])} />
                  ))}
                </span>
              )}
              {list.slice(0, 3).map((e) => (
                <button
                  key={`${e.id}-${e.starts_at}`}
                  type="button"
                  onClick={() => onOpen(e)}
                  className={cn(
                    "flex min-w-0 items-center gap-1 truncate rounded-md px-1 py-px text-left text-[11.5px] max-md:hidden",
                    e.all_day ? cn("border-l-[3px] font-medium", KIND_STYLE[e.kind]) : "hover:bg-bamboo-50",
                    e.my_response === "DECLINED" && "line-through opacity-60",
                  )}
                  title={e.title}
                >
                  {!e.all_day && (
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT[e.kind])} aria-hidden />
                  )}
                  {!e.all_day && <span className="shrink-0 text-muted">{dayjs(e.starts_at).format("HH:mm")}</span>}
                  <span className="truncate">{e.title}</span>
                </button>
              ))}
              {list.length > 3 && (
                <button
                  type="button"
                  onClick={() => openDay(d)}
                  className="px-1 text-left text-[11px] font-semibold text-bamboo-700 max-md:hidden"
                >
                  {trf("+{0} lịch khác", [list.length - 3])}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
