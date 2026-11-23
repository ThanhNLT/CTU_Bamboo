# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Lịch công tác theo ngày/tuần/tháng/quý (ADR #65).

- Sự kiện **cá nhân** (người tổ chức và người được mời thấy) hoặc **lịch đơn vị** (mọi người trong cây con của đơn vị thấy,
  ví dụ lịch công tác tuần của Ban giám đốc). Lịch đơn vị do trưởng đơn vị (hoặc đơn vị cấp trên) hay người có quyền
  `cal.unit.manage` đặt.
- Lặp theo ngày/tuần/tháng đến một ngày cuối (tối đa hai năm); máy chủ trải các lần diễn ra trong khoảng đang xem
  (`cal.occurrences`), nên giao diện ngày/tuần/tháng/quý chỉ cần một lần gọi `calendar_events`.
- Lưu lịch báo trùng giờ của người tổ chức và người được mời (không chặn), mời người mới thì gửi thông báo, đổi giờ thì
  báo người đã mời và đặt lại trả lời; nhắc lịch trước N phút do flow-sync gửi mỗi phút (`cal.send_reminders`).
- Hạn công việc dự án (Không gian P, ADR #66) giao cho người xem hiện cùng lịch, chỉ đọc.
"""

import datetime as dt
import uuid
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

from .common import ActionError, Context, bind_session, session_identity

TZ = ZoneInfo("Asia/Ho_Chi_Minh")
KINDS = ("MEETING", "WORK", "TRIP", "LEAVE", "DEADLINE", "OTHER")
RECURRENCES = ("NONE", "DAILY", "WEEKLY", "MONTHLY")
RESPONSES = ("ACCEPTED", "DECLINED", "TENTATIVE")
MAX_RANGE_DAYS = 400
MAX_ATTENDEES = 200
CONFLICT_HORIZON = dt.timedelta(days=90)


def _who(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    return person, tenant


def _uuid(value, label: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except ValueError as exc:
        raise ActionError(f"Mã {label} không hợp lệ") from exc


def parse_time(value, label: str) -> dt.datetime:
    """Thời điểm ISO 8601; không ghi múi giờ thì hiểu là giờ Việt Nam."""
    try:
        t = dt.datetime.fromisoformat(str(value))
    except ValueError as exc:
        raise ActionError(f"{label} không đúng định dạng ngày giờ") from exc
    return t if t.tzinfo else t.replace(tzinfo=TZ)


def _text(value, limit: int, label: str, required: bool = False) -> str | None:
    text = str(value or "").strip()
    if required and not text:
        raise ActionError(f"Cần nhập {label}")
    if len(text) > limit:
        raise ActionError(f"{label.capitalize()} dài tối đa {limit} ký tự")
    return text or None


def _iso(t: dt.datetime | None) -> str | None:
    return t.astimezone(TZ).isoformat() if t else None


def _event_out(r: dict, person: str) -> dict:
    attendees = r.get("attendees") or []
    mine = next((a["response"] for a in attendees if a["person_id"] == person), None)
    return {
        "id": str(r["id"]),
        "source": "event",
        "title": r["title"],
        "description": r["description"],
        "location": r["location"],
        "kind": r["kind"],
        "starts_at": _iso(r["occurs_at"]),
        "ends_at": _iso(r["occurs_end"]),
        "series_start": _iso(r["starts_at"]),
        "series_end": _iso(r["ends_at"]),
        "all_day": r["all_day"],
        "recurrence": r["recurrence"],
        "recur_until": r["recur_until"].isoformat() if r["recur_until"] else None,
        "scope": r["scope"],
        "org_unit_id": str(r["org_unit_id"]) if r["org_unit_id"] else None,
        "org_unit_name": r["org_unit_name"],
        "organizer_id": str(r["organizer_id"]),
        "organizer_name": r["organizer_name"],
        "reminder_minutes": r["reminder_minutes"],
        "attendees": attendees,
        "my_response": mine,
        "can_edit": bool(r["can_edit"]),
        "project_id": None,
    }


def calendar_events(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    start = parse_time(args.get("from"), "Ngày bắt đầu")
    end = parse_time(args.get("to"), "Ngày kết thúc")
    if end <= start or end - start > dt.timedelta(days=MAX_RANGE_DAYS):
        raise ActionError(f"Khoảng xem phải dương và không quá {MAX_RANGE_DAYS} ngày")
    view = args.get("view") or "all"
    if view not in ("all", "mine", "unit"):
        raise ActionError("Chế độ xem gồm all, mine, unit")
    unit = _uuid(args["unit_id"], "đơn vị") if view == "unit" and args.get("unit_id") else None
    if view == "unit" and not unit:
        raise ActionError("Cần chọn đơn vị để xem lịch đơn vị")
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT e.*, o.occurs_at, o.ends_at AS occurs_end, u.name AS org_unit_name, p.full_name AS organizer_name,
                      (e.organizer_id = %(me)s OR (e.scope = 'UNIT' AND cal.can_manage_unit(%(me)s, e.org_unit_id)))
                          AS can_edit,
                      coalesce((SELECT json_agg(json_build_object('person_id', a.person_id::text, 'name', ap.full_name,
                                                                  'response', a.response) ORDER BY ap.full_name)
                                FROM cal.attendee a JOIN core.person ap ON ap.id = a.person_id
                                WHERE a.event_id = e.id), '[]') AS attendees
               FROM cal.event e
               CROSS JOIN LATERAL cal.occurrences(e, %(from)s, %(to)s) o
               LEFT JOIN core.org_unit u ON u.id = e.org_unit_id
               JOIN core.person p ON p.id = e.organizer_id
               WHERE e.tenant_id = %(tenant)s AND e.cancelled_at IS NULL AND e.starts_at < %(to)s
                 AND cal.last_end(e.recurrence, e.ends_at, e.starts_at, e.recur_until) > %(from)s
                 AND cal.can_read(e.id, %(me)s)
                 AND (%(view)s = 'all'
                      OR (%(view)s = 'mine' AND (e.organizer_id = %(me)s OR EXISTS (
                              SELECT FROM cal.attendee a WHERE a.event_id = e.id AND a.person_id = %(me)s
                                                           AND a.response <> 'DECLINED')))
                      OR (%(view)s = 'unit' AND e.scope = 'UNIT' AND e.org_unit_id = %(unit)s))
               ORDER BY o.occurs_at, e.title
               LIMIT 2000""",
            {"me": person, "tenant": tenant, "from": start, "to": end, "view": view, "unit": unit},
        )
        .fetchall()
    )
    events = [_event_out(r, person) for r in rows]
    events += _project_deadlines(conn, person, tenant, start, end, view)
    events.sort(key=lambda e: (e["starts_at"], e["title"]))
    return {"events": events, "from": _iso(start), "to": _iso(end)}


def _project_deadlines(conn, person: str, tenant: str, start: dt.datetime, end: dt.datetime, view: str) -> list[dict]:
    """Công việc dự án giao cho người xem (Không gian P), khi mô-đun quản lý dự án đang bật cho công ty."""
    if view == "unit" or not conn.execute("SELECT to_regclass('pm.task') IS NOT NULL").fetchone()[0]:
        return []
    if not conn.execute("SELECT core.module_enabled(%s, 'project')", (tenant,)).fetchone()[0]:
        return []
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT t.id, t.name, t.start_date, t.end_date, t.milestone, t.progress, j.id AS project_id, j.code, j.name AS project
               FROM pm.task t JOIN pm.project j ON j.id = t.project_id
               WHERE t.tenant_id = %(tenant)s AND t.assignee_id = %(me)s AND j.status IN ('PLANNING', 'ACTIVE')
                 AND t.progress < 100
                 AND NOT EXISTS (SELECT FROM pm.task c WHERE c.parent_id = t.id)
                 AND t.end_date >= (%(from)s AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                 AND t.end_date < (%(to)s AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
               ORDER BY t.end_date LIMIT 500""",
            {"tenant": tenant, "me": person, "from": start, "to": end},
        )
        .fetchall()
    )
    out = []
    for r in rows:
        day = dt.datetime.combine(r["end_date"], dt.time(), TZ)
        out.append(
            {
                "id": f"task:{r['id']}",
                "source": "project",
                "title": f"{'◆ ' if r['milestone'] else ''}{r['name']}",
                "description": f"{r['code']} – {r['project']} · {r['progress']}%",
                "location": None,
                "kind": "DEADLINE",
                "starts_at": _iso(day),
                "ends_at": _iso(day + dt.timedelta(days=1)),
                "series_start": _iso(day),
                "series_end": _iso(day + dt.timedelta(days=1)),
                "all_day": True,
                "recurrence": "NONE",
                "recur_until": None,
                "scope": "PERSONAL",
                "org_unit_id": None,
                "org_unit_name": None,
                "organizer_id": person,
                "organizer_name": None,
                "reminder_minutes": None,
                "attendees": [],
                "my_response": None,
                "can_edit": False,
                "project_id": str(r["project_id"]),
            }
        )
    return out


def _fields(conn: psycopg.Connection, tenant: str, person: str, args: dict) -> dict:
    kind = args.get("kind") or "MEETING"
    if kind not in KINDS:
        raise ActionError("Loại lịch không hợp lệ")
    recurrence = args.get("recurrence") or "NONE"
    if recurrence not in RECURRENCES:
        raise ActionError("Kiểu lặp gồm NONE, DAILY, WEEKLY, MONTHLY")
    starts = parse_time(args.get("starts_at"), "Giờ bắt đầu")
    ends = parse_time(args.get("ends_at"), "Giờ kết thúc")
    if ends < starts:
        raise ActionError("Giờ kết thúc phải sau giờ bắt đầu")
    if ends - starts > dt.timedelta(days=62):
        raise ActionError("Một lần diễn ra dài tối đa 62 ngày")
    until = None
    if recurrence != "NONE":
        try:
            until = dt.date.fromisoformat(str(args.get("recur_until") or ""))
        except ValueError as exc:
            raise ActionError("Lịch lặp cần ngày cuối (YYYY-MM-DD)") from exc
        if until < starts.astimezone(TZ).date() or until > starts.astimezone(TZ).date() + dt.timedelta(days=731):
            raise ActionError("Ngày cuối của lịch lặp phải sau ngày bắt đầu và trong vòng hai năm")
    scope = args.get("scope") or "PERSONAL"
    unit = None
    if scope == "UNIT":
        unit = _uuid(args.get("org_unit_id"), "đơn vị")
        ok = conn.execute(
            "SELECT EXISTS (SELECT FROM core.org_unit WHERE id = %s AND tenant_id = %s)", (unit, tenant)
        ).fetchone()[0]
        if not ok:
            raise ActionError("Không tìm thấy đơn vị", "not-found", 404)
        if not conn.execute("SELECT cal.can_manage_unit(%s, %s)", (person, unit)).fetchone()[0]:
            raise ActionError(
                "Chỉ trưởng đơn vị (hoặc người có quyền cal.unit.manage) đặt được lịch chung của đơn vị",
                "forbidden",
                403,
            )
    elif scope != "PERSONAL":
        raise ActionError("Phạm vi lịch gồm PERSONAL, UNIT")
    reminder = args.get("reminder_minutes")
    if reminder is not None and not (isinstance(reminder, int) and 0 <= reminder <= 10080):
        raise ActionError("Nhắc trước 0–10080 phút")
    return {
        "title": _text(args.get("title"), 200, "tiêu đề", required=True),
        "description": _text(args.get("description"), 4000, "nội dung"),
        "location": _text(args.get("location"), 200, "địa điểm"),
        "kind": kind,
        "starts_at": starts,
        "ends_at": ends,
        "all_day": bool(args.get("all_day")),
        "recurrence": recurrence,
        "recur_until": until,
        "scope": scope,
        "org_unit_id": unit,
        "reminder_minutes": reminder,
    }


def _attendees(conn: psycopg.Connection, tenant: str, organizer: str, ids) -> list[str]:
    wanted = [i for i in dict.fromkeys(_uuid(i, "người") for i in ids or []) if i != organizer]
    if len(wanted) > MAX_ATTENDEES:
        raise ActionError(f"Mời tối đa {MAX_ATTENDEES} người")
    if wanted:
        n = conn.execute(
            "SELECT count(*) FROM core.person WHERE tenant_id = %s AND id = ANY(%s::uuid[])", (tenant, wanted)
        ).fetchone()[0]
        if n != len(wanted):
            raise ActionError("Có người được mời không thuộc công ty", "not-found", 404)
    return wanted


def _when(f: dict) -> str:
    start = f["starts_at"].astimezone(TZ)
    return start.strftime("%d/%m/%Y") if f["all_day"] else start.strftime("%H:%M %d/%m/%Y")


def conflicts(conn: psycopg.Connection, event_id: str) -> list[dict]:
    """Lịch khác của người tổ chức và người được mời trùng giờ với sự kiện (xét 90 ngày đầu nếu lịch lặp)."""
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """WITH me AS (SELECT * FROM cal.event WHERE id = %(id)s),
                    people AS (SELECT organizer_id AS person_id FROM me
                               UNION SELECT person_id FROM cal.attendee WHERE event_id = %(id)s AND response <> 'DECLINED'),
                    mine AS (SELECT o.* FROM cal.event x, cal.occurrences(x, x.starts_at, x.starts_at + %(h)s) o
                             WHERE x.id = %(id)s)
               SELECT DISTINCT ON (p.person_id, e.id) p.person_id::text, pe.full_name AS name, e.id::text AS event_id,
                      e.title, o.occurs_at
               FROM people p
               JOIN core.person pe ON pe.id = p.person_id
               JOIN cal.event e ON e.tenant_id = (SELECT tenant_id FROM me) AND e.id <> %(id)s AND e.cancelled_at IS NULL
                                AND e.kind <> 'DEADLINE'
                                AND e.starts_at < (SELECT starts_at FROM me) + %(h)s
                                AND cal.last_end(e.recurrence, e.ends_at, e.starts_at, e.recur_until)
                                    > (SELECT starts_at FROM me)
                                AND (e.organizer_id = p.person_id OR EXISTS (
                                    SELECT FROM cal.attendee a WHERE a.event_id = e.id AND a.person_id = p.person_id
                                                                 AND a.response <> 'DECLINED'))
               JOIN mine m ON true
               CROSS JOIN LATERAL cal.occurrences(e, m.occurs_at, m.ends_at) o
               ORDER BY p.person_id, e.id, o.occurs_at
               LIMIT 50""",
            {"id": event_id, "h": CONFLICT_HORIZON},
        )
        .fetchall()
    )
    return [{**r, "starts_at": _iso(r.pop("occurs_at"))} for r in rows]


def calendar_save(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    args = args.get("event") or {}
    if not isinstance(args, dict):
        raise ActionError("Thiếu nội dung lịch")
    f = _fields(conn, tenant, person, args)
    invited = _attendees(conn, tenant, person, args.get("attendee_ids"))
    cur = conn.cursor(row_factory=dict_row)
    if args.get("id"):
        old = cur.execute(
            "SELECT * FROM cal.event WHERE id = %s AND tenant_id = %s FOR UPDATE", (_uuid(args["id"], "lịch"), tenant)
        ).fetchone()
        if not old or old["cancelled_at"]:
            raise ActionError("Không tìm thấy lịch", "not-found", 404)
        allowed = str(old["organizer_id"]) == person or (
            old["scope"] == "UNIT"
            and conn.execute("SELECT cal.can_manage_unit(%s, %s)", (person, old["org_unit_id"])).fetchone()[0]
        )
        if not allowed:
            raise ActionError("Chỉ người tổ chức sửa được lịch", "forbidden", 403)
        invited = [i for i in invited if i != str(old["organizer_id"])]
        event_id = str(old["id"])
        cur.execute(
            """UPDATE cal.event SET title = %(title)s, description = %(description)s, location = %(location)s,
                   kind = %(kind)s, starts_at = %(starts_at)s, ends_at = %(ends_at)s, all_day = %(all_day)s,
                   recurrence = %(recurrence)s, recur_until = %(recur_until)s, scope = %(scope)s,
                   org_unit_id = %(org_unit_id)s, reminder_minutes = %(reminder_minutes)s
               WHERE id = %(id)s RETURNING starts_at, ends_at""",
            {**f, "id": event_id},
        )
        new = cur.fetchone()
        moved = (new["starts_at"], new["ends_at"], f["recurrence"], f["recur_until"]) != (
            old["starts_at"],
            old["ends_at"],
            old["recurrence"],
            old["recur_until"],
        )
        before = {
            str(r["person_id"])
            for r in cur.execute("SELECT person_id FROM cal.attendee WHERE event_id = %s", (event_id,))
        }
        if moved:
            conn.execute(
                "UPDATE cal.attendee SET response = 'PENDING', responded_at = NULL WHERE event_id = %s", (event_id,)
            )
            for p in before & set(invited):
                conn.execute(
                    "SELECT collab.notify(%s, %s, 'CALENDAR_CHANGED', 'cal.event', %s, %s, %s, %s)",
                    (tenant, p, event_id, f"Lịch đổi giờ: {f['title']}", _when(f), person),
                )
        conn.execute(
            "DELETE FROM cal.attendee WHERE event_id = %s AND NOT (person_id = ANY(%s::uuid[]))", (event_id, invited)
        )
        fresh = [p for p in invited if p not in before]
        created = False
    else:
        event_id = cur.execute(
            """INSERT INTO cal.event (tenant_id, organizer_id, title, description, location, kind, starts_at, ends_at,
                   all_day, recurrence, recur_until, scope, org_unit_id, reminder_minutes)
               VALUES (%(tenant)s, %(me)s, %(title)s, %(description)s, %(location)s, %(kind)s, %(starts_at)s,
                   %(ends_at)s, %(all_day)s, %(recurrence)s, %(recur_until)s, %(scope)s, %(org_unit_id)s,
                   %(reminder_minutes)s)
               RETURNING id""",
            {**f, "tenant": tenant, "me": person},
        ).fetchone()["id"]
        event_id = str(event_id)
        fresh = invited
        created = True
    if fresh:
        conn.execute(
            "INSERT INTO cal.attendee (tenant_id, event_id, person_id) SELECT %s, %s, unnest(%s::uuid[])",
            (tenant, event_id, fresh),
        )
        for p in fresh:
            conn.execute(
                "SELECT collab.notify(%s, %s, 'CALENDAR_INVITE', 'cal.event', %s, %s, %s, %s)",
                (tenant, p, event_id, f"Mời tham dự: {f['title']}", _when(f), person),
            )
    return {"id": event_id, "created": created, "invited": len(fresh), "conflicts": conflicts(conn, event_id)}


def _editable(conn: psycopg.Connection, tenant: str, person: str, event_id) -> dict:
    row = (
        conn.cursor(row_factory=dict_row)
        .execute(
            "SELECT * FROM cal.event WHERE id = %s AND tenant_id = %s FOR UPDATE", (_uuid(event_id, "lịch"), tenant)
        )
        .fetchone()
    )
    if not row or row["cancelled_at"]:
        raise ActionError("Không tìm thấy lịch", "not-found", 404)
    allowed = str(row["organizer_id"]) == person or (
        row["scope"] == "UNIT"
        and conn.execute("SELECT cal.can_manage_unit(%s, %s)", (person, row["org_unit_id"])).fetchone()[0]
    )
    if not allowed:
        raise ActionError("Chỉ người tổ chức hủy được lịch", "forbidden", 403)
    return row


def calendar_cancel(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    row = _editable(conn, tenant, person, args.get("id"))
    conn.execute("UPDATE cal.event SET cancelled_at = now() WHERE id = %s", (row["id"],))
    people = [
        r[0]
        for r in conn.execute(
            "SELECT person_id FROM cal.attendee WHERE event_id = %s AND response <> 'DECLINED'", (row["id"],)
        )
    ]
    for p in people:
        conn.execute(
            "SELECT collab.notify(%s, %s, 'CALENDAR_CHANGED', 'cal.event', %s, %s, %s, %s)",
            (tenant, p, row["id"], f"Lịch đã hủy: {row['title']}", _when(row), person),
        )
    return {"id": str(row["id"]), "cancelled": True, "notified": len(people)}


def calendar_respond(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    response = args.get("response")
    if response not in RESPONSES:
        raise ActionError("Trả lời gồm ACCEPTED, DECLINED, TENTATIVE")
    event_id = _uuid(args.get("id"), "lịch")
    cur = conn.execute(
        """UPDATE cal.attendee a SET response = %s, responded_at = now()
           FROM cal.event e
           WHERE a.event_id = e.id AND e.id = %s AND e.tenant_id = %s AND a.person_id = %s AND e.cancelled_at IS NULL""",
        (response, event_id, tenant, person),
    )
    if cur.rowcount == 0:
        raise ActionError("Bạn không được mời vào lịch này", "not-found", 404)
    return {"id": event_id, "response": response}


HANDLERS = {
    "calendar_events": calendar_events,
    "calendar_save": calendar_save,
    "calendar_cancel": calendar_cancel,
    "calendar_respond": calendar_respond,
}
