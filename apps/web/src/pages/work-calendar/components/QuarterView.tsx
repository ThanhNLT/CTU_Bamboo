import dayjs, { type Dayjs } from "dayjs";

import { tr, trf } from "../../../i18n";
import { cn } from "../../../utils/cn";
import { KIND_DOT, KIND_LABEL, onDay, type CalEvent, type Kind } from "../model";

const WEEKDAYS = [tr("T2"), tr("T3"), tr("T4"), tr("T5"), tr("T6"), tr("T7"), tr("CN")];

const MiniMonth = ({
  month,
  events,
  onDay: openDay,
}: {
  month: Dayjs;
  events: CalEvent[];
  onDay: (d: Dayjs) => void;
}) => {
  const from = month.startOf("month").startOf("isoWeek");
  const days = Array.from({ length: 42 }, (_, i) => from.add(i, "day"));
  const now = dayjs();
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 text-[14px] font-semibold first-letter:uppercase text-ink">{month.format("MMMM")}</h3>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10.5px] font-medium text-muted">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const inMonth = d.month() === month.month();
          const list = inMonth ? events.filter((e) => onDay(e, d)) : [];
          const kinds = [...new Set(list.map((e) => e.kind))].slice(0, 3) as Kind[];
          return (
            <button
              key={d.toString()}
              type="button"
              disabled={!inMonth}
              onClick={() => openDay(d)}
              className={cn(
                "flex h-10 flex-col items-center justify-center rounded-lg text-[12px] disabled:invisible",
                d.isSame(now, "day")
                  ? "bg-bamboo-600 font-semibold text-white"
                  : list.length
                    ? "bg-bamboo-50 font-semibold text-ink"
                    : "text-body hover:bg-bamboo-50",
              )}
              aria-label={trf("{0}: {1} lịch", [d.format("DD/MM"), list.length])}
            >
              {d.date()}
              <span className="flex h-1.5 gap-0.5">
                {kinds.map((k) => (
                  <span key={k} className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[k])} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Xem quý: ba tháng thu nhỏ (chấm màu theo loại lịch) và danh sách lịch của quý theo tháng. */
export const QuarterView = ({
  start,
  events,
  onOpen,
  onDay,
}: {
  start: Dayjs;
  events: CalEvent[];
  onOpen: (e: CalEvent) => void;
  onDay: (d: Dayjs) => void;
}) => {
  const months = [0, 1, 2].map((i) => start.add(i, "month"));
  const counts = events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  return (
    <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)]">
      <div className="grid content-start gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {months.map((m) => (
          <MiniMonth key={m.toString()} month={m} events={events} onDay={onDay} />
        ))}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted sm:col-span-3 lg:col-span-1 xl:col-span-3">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", KIND_DOT[k])} aria-hidden />
              {KIND_LABEL[k]} · {counts[k] ?? 0}
            </span>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        {months.map((m) => {
          const list = events.filter((e) => dayjs(e.starts_at).isSame(m, "month"));
          return (
            <section key={m.toString()} className="mb-4">
              <h3 className="mb-1 text-[13px] font-semibold first-letter:uppercase text-muted">
                {m.format("MMMM")} · {trf("{0} lịch", [list.length])}
              </h3>
              <ul className="m-0 list-none p-0">
                {list.map((e) => (
                  <li key={`${e.id}-${e.starts_at}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(e)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-bamboo-50"
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", KIND_DOT[e.kind])} aria-hidden />
                      <span className="w-[88px] shrink-0 text-[12px] text-muted">
                        {dayjs(e.starts_at).format(e.all_day ? "DD/MM" : "DD/MM HH:mm")}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 truncate text-[13px]",
                          e.my_response === "DECLINED" && "line-through opacity-60",
                        )}
                      >
                        {e.title}
                      </span>
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="px-2 py-1 text-[12.5px] text-muted">{tr("Không có lịch")}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};
