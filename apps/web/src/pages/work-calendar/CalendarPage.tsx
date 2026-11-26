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

import { Alert, Segmented, Select, Spin, Tooltip } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useSession } from "../../auth/useSession";
import { primaryButtonClass, secondaryButtonClass } from "../../components/ui/buttons";
import { LiveBadge } from "../../live/LiveBadge";
import { useLiveTopics } from "../../live/useLive";
import { usePolling } from "../../live/usePolling";
import { tr } from "../../i18n";
import { fetchEvents, fetchUnits, type Unit } from "./api";
import { EventDetail } from "./components/EventDetail";
import { EventForm } from "./components/EventForm";
import { MonthGrid } from "./components/MonthGrid";
import { QuarterView } from "./components/QuarterView";
import { TimeGrid } from "./components/TimeGrid";
import { download, rangeOf, step, titleOf, toIcs, type CalEvent, type Mode, type View } from "./model";

const MODES: Mode[] = ["day", "week", "month", "quarter"];
const VIEW_KEY = "bamboo.calendar.mode";

const initialMode = (): Mode => {
  try {
    const saved = localStorage.getItem(VIEW_KEY) as Mode | null;
    if (saved && MODES.includes(saved)) return saved;
  } catch {}
  return window.matchMedia("(max-width: 767px)").matches ? "day" : "week";
};

export const CalendarPage = () => {
  const { tenant } = useSession();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [cursor, setCursor] = useState<Dayjs>(() => (params.get("d") ? dayjs(params.get("d")) : dayjs()));
  const [view, setView] = useState<View>("all");
  const [unit, setUnit] = useState<string | undefined>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalEvent | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [creating, setCreating] = useState<{ at: Dayjs; allDay?: boolean } | null>(null);
  const { from, to } = useMemo(() => rangeOf(mode, cursor), [mode, cursor]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {}
  }, [mode]);

  useEffect(() => {
    void fetchUnits()
      .then(setUnits)
      .catch(() => setUnits([]));
  }, []);

  const load = useCallback(async () => {
    if (view === "unit" && !unit) {
      setEvents([]);
      return;
    }
    try {
      setEvents(await fetchEvents(from, to, view, unit));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [from, to, view, unit]);

  useEffect(() => {
    setEvents(null);
    void load();
  }, [load]);

  const live = useLiveTopics(["calendar"], () => void load());
  usePolling(() => void load(), 60_000);

  useEffect(() => {
    const id = params.get("event");
    if (id && events) {
      const found = events.find((e) => e.id === id);
      if (found) setDetail(found);
      params.delete("event");
      setParams(params, { replace: true });
    }
  }, [events, params, setParams]);

  const openDay = (d: Dayjs) => {
    setCursor(d);
    setMode("day");
  };

  const days =
    mode === "day"
      ? [cursor.startOf("day")]
      : mode === "week"
        ? Array.from({ length: 7 }, (_, i) => from.add(i, "day"))
        : [];

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[520px] w-full max-w-[1400px] flex-col gap-3 max-md:h-auto">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bamboo-50 text-bamboo-700" aria-hidden>
          <CalendarDays className="h-5 w-5" />
        </span>
        <h1 className="mr-auto text-[22px] font-semibold capitalize tracking-[-0.01em] text-ink sm:text-[24px]">
          {titleOf(mode, cursor)}
        </h1>
        <LiveBadge connected={live.connected} changedAt={live.changedAt} />
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => setCreating({ at: dayjs().add(1, "hour").startOf("hour") })}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {tr("Tạo lịch")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className={secondaryButtonClass} onClick={() => setCursor(dayjs())}>
            {tr("Hôm nay")}
          </button>
          <Tooltip title={tr("Trước")}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-bamboo-50"
              onClick={() => setCursor(step(mode, cursor, -1))}
              aria-label={tr("Trước")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </Tooltip>
          <Tooltip title={tr("Sau")}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-bamboo-50"
              onClick={() => setCursor(step(mode, cursor, 1))}
              aria-label={tr("Sau")}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </Tooltip>
        </div>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "day", label: tr("Ngày") },
            { value: "week", label: tr("Tuần") },
            { value: "month", label: tr("Tháng") },
            { value: "quarter", label: tr("Quý") },
          ]}
        />
        <Select<View>
          value={view}
          onChange={setView}
          className="w-[210px]"
          options={[
            { value: "all", label: tr("Mọi lịch tôi xem được") },
            { value: "mine", label: tr("Lịch của tôi") },
            { value: "unit", label: tr("Lịch chung của đơn vị") },
          ]}
          aria-label={tr("Lọc lịch")}
        />
        {view === "unit" && (
          <Select
            value={unit}
            onChange={setUnit}
            showSearch
            optionFilterProp="label"
            className="w-[220px]"
            placeholder={tr("Chọn đơn vị")}
            options={units.map((u) => ({ value: u.id, label: u.name }))}
          />
        )}
        <Tooltip title={tr("Tải lịch đang xem về điện thoại, Outlook, Google Calendar (.ics)")}>
          <button
            type="button"
            className={`${secondaryButtonClass} ml-auto`}
            disabled={!events?.length}
            onClick={() =>
              events &&
              download(
                `lich-cong-tac-${from.format("YYYYMMDD")}.ics`,
                toIcs(events.filter((e) => e.source === "event")),
              )
            }
          >
            <Download className="h-4 w-4" aria-hidden />
            {tr("Xuất .ics")}
          </button>
        </Tooltip>
      </div>
      {error && <Alert type="error" showIcon message={tr("Không tải được lịch")} description={error} />}
      <div className="relative flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-2xl border bg-surface shadow-card">
        {events === null && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-surface/60">
            <Spin />
          </div>
        )}
        {(mode === "day" || mode === "week") && (
          <TimeGrid
            days={days}
            events={events ?? []}
            onOpen={setDetail}
            onCreate={(at, allDay) => setCreating({ at, allDay })}
          />
        )}
        {mode === "month" && (
          <MonthGrid
            month={cursor}
            from={from}
            events={events ?? []}
            onOpen={setDetail}
            onDay={openDay}
            onCreate={(at) => setCreating({ at })}
          />
        )}
        {mode === "quarter" && <QuarterView start={from} events={events ?? []} onOpen={setDetail} onDay={openDay} />}
      </div>
      <EventDetail
        event={detail}
        onClose={() => setDetail(null)}
        onEdit={(e) => {
          setDetail(null);
          setEditing(e);
        }}
        onChanged={() => {
          setDetail(null);
          void load();
        }}
      />
      <EventForm
        open={!!creating || !!editing}
        me={tenant.person_id}
        units={units}
        initial={editing}
        start={creating}
        onClose={() => {
          setCreating(null);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(null);
          setEditing(null);
          void load();
        }}
      />
    </div>
  );
};

export default CalendarPage;
