import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

import { tr } from "../../i18n";

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

export type Mode = "day" | "week" | "month" | "quarter";
export type View = "all" | "mine" | "unit";
export type Kind = "MEETING" | "WORK" | "TRIP" | "LEAVE" | "DEADLINE" | "OTHER";
export type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
export type Response = "PENDING" | "ACCEPTED" | "DECLINED" | "TENTATIVE";

export type CalEvent = {
  id: string;
  source: "event" | "project";
  title: string;
  description: string | null;
  location: string | null;
  kind: Kind;
  starts_at: string;
  ends_at: string;
  series_start: string;
  series_end: string;
  all_day: boolean;
  recurrence: Recurrence;
  recur_until: string | null;
  scope: "PERSONAL" | "UNIT";
  org_unit_id: string | null;
  org_unit_name: string | null;
  organizer_id: string;
  organizer_name: string | null;
  reminder_minutes: number | null;
  attendees: { person_id: string; name: string; response: Response }[];
  my_response: Response | null;
  can_edit: boolean;
  project_id: string | null;
};

export const KIND_LABEL: Record<Kind, string> = {
  MEETING: tr("Họp"),
  WORK: tr("Công việc"),
  TRIP: tr("Công tác"),
  LEAVE: tr("Nghỉ phép"),
  DEADLINE: tr("Hạn chót"),
  OTHER: tr("Khác"),
};

/** Màu theo loại lịch: nền nhạt + viền đậm, đọc được ở cả nền sáng và tối. */
export const KIND_STYLE: Record<Kind, string> = {
  MEETING: "border-l-bamboo-600 bg-bamboo-50 text-bamboo-900",
  WORK: "border-l-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
  TRIP: "border-l-violet-600 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100",
  LEAVE: "border-l-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  DEADLINE: "border-l-red-500 bg-red-50 text-red-900",
  OTHER: "border-l-gray-400 bg-gray-50 text-gray-800 dark:bg-white/5 dark:text-gray-200",
};

export const KIND_DOT: Record<Kind, string> = {
  MEETING: "bg-bamboo-600",
  WORK: "bg-sky-600",
  TRIP: "bg-violet-600",
  LEAVE: "bg-amber-500",
  DEADLINE: "bg-red-500",
  OTHER: "bg-gray-400",
};

export const RESPONSE_LABEL: Record<Response, string> = {
  PENDING: tr("Chưa trả lời"),
  ACCEPTED: tr("Tham dự"),
  DECLINED: tr("Không tham dự"),
  TENTATIVE: tr("Chưa chắc"),
};

/** Khoảng thời gian cần tải cho một chế độ xem: tuần bắt đầu thứ Hai, tháng phủ đủ 6 hàng tuần. */
export const rangeOf = (mode: Mode, cursor: Dayjs): { from: Dayjs; to: Dayjs } => {
  switch (mode) {
    case "day":
      return { from: cursor.startOf("day"), to: cursor.startOf("day").add(1, "day") };
    case "week":
      return { from: cursor.startOf("isoWeek"), to: cursor.startOf("isoWeek").add(7, "day") };
    case "month": {
      const from = cursor.startOf("month").startOf("isoWeek");
      return { from, to: from.add(42, "day") };
    }
    case "quarter": {
      const from = cursor.startOf("quarter");
      return { from, to: from.add(3, "month") };
    }
  }
};

export const step = (mode: Mode, cursor: Dayjs, dir: 1 | -1) =>
  mode === "quarter" ? cursor.add(3 * dir, "month") : cursor.add(dir, mode);

export const titleOf = (mode: Mode, cursor: Dayjs) => {
  switch (mode) {
    case "day":
      return cursor.format("dddd, DD/MM/YYYY");
    case "week": {
      const from = cursor.startOf("isoWeek");
      return `${tr("Tuần")} ${from.isoWeek()} · ${from.format("DD/MM")} – ${from.add(6, "day").format("DD/MM/YYYY")}`;
    }
    case "month":
      return cursor.format("MMMM YYYY");
    case "quarter":
      return `${tr("Quý")} ${cursor.quarter()}/${cursor.year()}`;
  }
};

/** Sự kiện có phủ ngày `d` không (giờ địa phương, ngày kết thúc loại trừ). */
export const onDay = (e: CalEvent, d: Dayjs) => {
  const start = dayjs(e.starts_at);
  const end = dayjs(e.ends_at);
  const dayStart = d.startOf("day");
  const dayEnd = dayStart.add(1, "day");
  return start.isBefore(dayEnd) && (end.isAfter(dayStart) || (end.isSame(start) && start.isSame(dayStart, "day")));
};

export type Placed = { event: CalEvent; top: number; height: number; col: number; cols: number };

/**
 * Xếp sự kiện có giờ trong một ngày thành cột không chồng nhau (kiểu lịch Outlook): các sự kiện giao nhau thành một cụm,
 * mỗi sự kiện vào cột trống đầu tiên, độ rộng chia đều theo số cột của cụm. `top`, `height` tính bằng phút từ 00:00.
 */
export const layoutDay = (events: CalEvent[], day: Dayjs): Placed[] => {
  const dayStart = day.startOf("day");
  const items = events
    .filter((e) => !e.all_day && onDay(e, day))
    .map((e) => {
      const s = Math.max(0, dayjs(e.starts_at).diff(dayStart, "minute"));
      const f = Math.min(24 * 60, dayjs(e.ends_at).diff(dayStart, "minute"));
      return { event: e, top: s, end: Math.max(f, s + 20) };
    })
    .sort((a, b) => a.top - b.top || b.end - a.end);
  const out: Placed[] = [];
  let cluster: { item: (typeof items)[number]; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster)
      out.push({ event: c.item.event, top: c.item.top, height: c.item.end - c.item.top, col: c.col, cols });
    cluster = [];
  };
  for (const item of items) {
    if (item.top >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.item.end > item.top).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return out;
};

const icsTime = (iso: string) =>
  dayjs(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const icsDate = (iso: string) => dayjs(iso).format("YYYYMMDD");
const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
const RRULE: Record<Recurrence, string> = { NONE: "", DAILY: "DAILY", WEEKLY: "WEEKLY", MONTHLY: "MONTHLY" };

/** Tệp iCalendar (RFC 5545) để thêm vào lịch điện thoại, Outlook, Google Calendar. Lịch lặp xuất một lần kèm RRULE. */
export const toIcs = (events: CalEvent[]) => {
  const seen = new Set<string>();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bamboo DX-OS//Lich cong tac//VI", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@bamboo`, `DTSTAMP:${icsTime(new Date().toISOString())}`);
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.series_start)}`, `DTEND;VALUE=DATE:${icsDate(e.series_end)}`);
    } else {
      lines.push(`DTSTART:${icsTime(e.series_start)}`, `DTEND:${icsTime(e.series_end)}`);
    }
    if (e.recurrence !== "NONE" && e.recur_until) {
      lines.push(`RRULE:FREQ=${RRULE[e.recurrence]};UNTIL=${e.recur_until.replace(/-/g, "")}T235959Z`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.reminder_minutes != null) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${e.reminder_minutes}M`,
        "DESCRIPTION:Reminder",
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

export const download = (name: string, content: string, type = "text/calendar;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
