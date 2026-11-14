# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

"""Quản lý dự án và kế hoạch (ADR #66), mô-đun `project`.

- **Dự án** (`pm.project`): thông tin chung và văn bản kế hoạch chi tiết (mục tiêu, phạm vi, sản phẩm bàn giao, cách triển
  khai, rủi ro, các bên liên quan); in thành văn bản PDF kèm bảng WBS, mốc và sơ đồ Gantt (`pm_plan_pdf`). Thành viên có
  vai trò quản lý / thành viên / chỉ xem; mỗi dự án có một nhóm nhắn tin riêng (ADR #65) đồng bộ theo thành viên.
- **Công việc** (`pm.task`): cây WBS, công việc tổng hợp lấy ngày và % hoàn thành từ con, mốc (không kéo dài), người phụ
  trách, phụ thuộc kết thúc→bắt đầu có độ trễ. Lưu công việc thì **tự dời** các công việc phụ thuộc phía sau (giữ thời
  lượng) cho đến khi mọi ràng buộc thỏa; chỉ dời về sau, không kéo sớm ngày người lập đã đặt. Đường găng (critical path)
  và thời gian dự trữ tính lại mỗi lần đọc. Người phụ trách tự cập nhật % hoàn thành của việc mình.
- **Đường cơ sở**: chốt ngày hiện tại của mọi công việc để so lệch; **báo cáo tiến độ** theo kỳ chụp số liệu (kế hoạch %,
  thực hiện %, SPI, việc trễ) lúc lập, không sửa được, in PDF.
"""

import datetime as dt
import json
import uuid
from collections import defaultdict
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from . import documents, forms, i18n
from .common import ActionError, Context, bind_session, session_identity

STATUSES = ("PLANNING", "ACTIVE", "ON_HOLD", "DONE", "CANCELLED")
ROLES = ("MANAGER", "MEMBER", "VIEWER")
HEALTH = ("GREEN", "AMBER", "RED")
PLAN_FIELDS = ("objective", "scope", "deliverables", "approach", "risks", "stakeholders")
MAX_TASKS = 2000
MAX_MEMBERS = 200
STATUS_LABEL = {
    "PLANNING": "Đang lập kế hoạch",
    "ACTIVE": "Đang thực hiện",
    "ON_HOLD": "Tạm dừng",
    "DONE": "Hoàn thành",
    "CANCELLED": "Đã hủy",
}
ROLE_LABEL = {"MANAGER": "Người quản lý dự án", "MEMBER": "Thành viên", "VIEWER": "Theo dõi"}
HEALTH_LABEL = {"GREEN": "Đúng tiến độ", "AMBER": "Có nguy cơ chậm", "RED": "Chậm tiến độ"}


def today() -> dt.date:
    return dt.datetime.now(dt.UTC).astimezone(dt.timezone(dt.timedelta(hours=7))).date()


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


def _date(value, label: str) -> dt.date:
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ActionError(f"{label} có dạng YYYY-MM-DD") from exc


def _text(value, limit: int, label: str, required: bool = False) -> str | None:
    text = str(value or "").strip()
    if required and not text:
        raise ActionError(f"Cần nhập {label}")
    if len(text) > limit:
        raise ActionError(f"{label.capitalize()} dài tối đa {limit} ký tự")
    return text or None


def _project(conn: psycopg.Connection, tenant: str, project_id, lock: bool = False) -> dict:
    row = (
        conn.cursor(row_factory=dict_row)
        .execute(
            f"SELECT * FROM pm.project WHERE id = %s AND tenant_id = %s{' FOR UPDATE' if lock else ''}",
            (_uuid(project_id, "dự án"), tenant),
        )
        .fetchone()
    )
    if not row:
        raise ActionError("Không tìm thấy dự án", "not-found", 404)
    return row


def _can(conn: psycopg.Connection, fn: str, project_id, person: str) -> bool:
    return conn.execute(f"SELECT pm.{fn}(%s, %s)", (project_id, person)).fetchone()[0]


def _readable(conn, tenant: str, person: str, project_id, lock: bool = False) -> dict:
    project = _project(conn, tenant, project_id, lock)
    if not _can(conn, "can_read", project["id"], person):
        raise ActionError("Không tìm thấy dự án", "not-found", 404)
    return project


def _manageable(conn, tenant: str, person: str, project_id) -> dict:
    project = _readable(conn, tenant, person, project_id, lock=True)
    if not _can(conn, "can_manage", project["id"], person):
        raise ActionError("Chỉ người quản lý dự án sửa được kế hoạch", "forbidden", 403)
    return project


def duration(t: dict) -> int:
    return 0 if t["milestone"] else (t["end_date"] - t["start_date"]).days + 1


def _gap(pred: dict) -> int:
    """Số ngày từ ngày kết thúc của việc trước tới ngày bắt đầu sớm nhất của việc sau (mốc: cùng ngày được)."""
    return 0 if pred["milestone"] else 1


def _children(tasks: dict[str, dict]) -> dict[str | None, list[str]]:
    kids: dict[str | None, list[str]] = defaultdict(list)
    for t in sorted(tasks.values(), key=lambda t: (t["seq"], t["start_date"], t["name"])):
        kids[t["parent_id"]].append(t["id"])
    return kids


def rollup(tasks: dict[str, dict]) -> None:
    """Công việc tổng hợp: ngày = khoảng phủ các con, % hoàn thành = bình quân theo số ngày của các việc lá bên dưới."""
    kids = _children(tasks)

    def visit(tid: str) -> tuple[int, int]:
        t = tasks[tid]
        if not kids.get(tid):
            w = duration(t)
            return w, w * t["progress"]
        weight = done = 0
        for c in kids[tid]:
            w, d = visit(c)
            weight += w
            done += d
        ch = [tasks[c] for c in kids[tid]]
        t["start_date"] = min(c["start_date"] for c in ch)
        t["end_date"] = max(c["end_date"] for c in ch)
        t["milestone"] = False
        t["progress"] = round(done / weight) if weight else round(sum(c["progress"] for c in ch) / len(ch))
        return weight, done

    for root in kids.get(None, []):
        visit(root)


def _shift(tasks: dict[str, dict], kids, tid: str, days: int, moved: set[str]) -> None:
    t = tasks[tid]
    t["start_date"] += dt.timedelta(days=days)
    t["end_date"] += dt.timedelta(days=days)
    moved.add(tid)
    for c in kids.get(tid, []):
        _shift(tasks, kids, c, days, moved)


def _topological(tasks: dict[str, dict], deps: list[dict]) -> list[dict]:
    """Phụ thuộc xếp theo thứ tự tô-pô của việc trước trên đồ thị (phụ thuộc + con→cha), để việc dời lan truyền xuôi
    trong một vòng thay vì hàng chục vòng khi đọc theo thứ tự uuid (ADR #67)."""
    succ: dict[str, list[str]] = defaultdict(list)
    indeg = dict.fromkeys(tasks, 0)
    for d in deps:
        succ[d["predecessor_id"]].append(d["successor_id"])
        indeg[d["successor_id"]] += 1
    for t in tasks.values():
        if t["parent_id"]:
            succ[t["id"]].append(t["parent_id"])
            indeg[t["parent_id"]] += 1
    queue = [tid for tid, n in indeg.items() if n == 0]
    rank: dict[str, int] = {}
    while queue:
        tid = queue.pop()
        rank[tid] = len(rank)
        for nxt in succ.get(tid, []):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
    return sorted(deps, key=lambda d: rank.get(d["predecessor_id"], len(tasks)))


def schedule(tasks: dict[str, dict], deps: list[dict]) -> set[str]:
    """Dời công việc phía sau cho thỏa mọi phụ thuộc kết thúc→bắt đầu (giữ thời lượng, chỉ dời về sau).

    Công việc tổng hợp bị dời thì cả cây con dời theo, và ngày của các việc tổng hợp bên trên cập nhật ngay. Phụ thuộc
    xét theo thứ tự tô-pô nên thường một vòng là xong; lặp tới khi ổn định, ràng buộc mâu thuẫn thì báo lỗi. Trả tập
    công việc đã dời.
    """
    kids = _children(tasks)
    moved: set[str] = set()
    ordered = _topological(tasks, deps)
    rollup(tasks)

    def refresh_up(tid: str) -> None:
        parent = tasks[tid]["parent_id"]
        while parent:
            p, ch = tasks[parent], [tasks[c] for c in kids[parent]]
            p["start_date"] = min(c["start_date"] for c in ch)
            p["end_date"] = max(c["end_date"] for c in ch)
            parent = p["parent_id"]

    for _ in range(len(tasks) + 1):
        changed = False
        for d in ordered:
            pred, succ = tasks[d["predecessor_id"]], tasks[d["successor_id"]]
            earliest = pred["end_date"] + dt.timedelta(days=_gap(pred) + d["lag_days"])
            if succ["start_date"] < earliest:
                _shift(tasks, kids, succ["id"], (earliest - succ["start_date"]).days, moved)
                refresh_up(succ["id"])
                changed = True
        if not changed:
            rollup(tasks)
            return moved
    raise ActionError("Không lập được lịch: phụ thuộc mâu thuẫn")


def analyze(tasks: dict[str, dict], deps: list[dict], at: dt.date) -> None:
    """Thêm WBS, cấp, dự trữ (ngày), găng, trễ, lệch đường cơ sở cho mỗi công việc (đã rollup)."""
    kids = _children(tasks)
    succs: dict[str, list[dict]] = defaultdict(list)
    for d in deps:
        succs[d["predecessor_id"]].append(d)
    finish = max((t["end_date"] for t in tasks.values()), default=at)
    late_finish: dict[str, dt.date] = {}
    visiting: set[str] = set()

    def lf(tid: str) -> dt.date:
        if tid in late_finish:
            return late_finish[tid]
        if tid in visiting:
            return finish
        visiting.add(tid)
        t = tasks[tid]
        best = finish
        if t["parent_id"]:
            best = min(best, lf(t["parent_id"]))
        for d in succs.get(tid, []):
            s = tasks[d["successor_id"]]
            late_start = lf(s["id"]) - dt.timedelta(days=(s["end_date"] - s["start_date"]).days)
            best = min(best, late_start - dt.timedelta(days=_gap(t) + d["lag_days"]))
        visiting.discard(tid)
        late_finish[tid] = best
        return best

    def number(parent, prefix: str, level: int) -> None:
        for i, tid in enumerate(kids.get(parent, []), start=1):
            t = tasks[tid]
            t["wbs"] = f"{prefix}{i}"
            t["level"] = level
            t["has_children"] = bool(kids.get(tid))
            number(tid, f"{prefix}{i}.", level + 1)

    number(None, "", 0)
    for t in tasks.values():
        t["slack_days"] = (lf(t["id"]) - t["end_date"]).days
        t["critical"] = t["slack_days"] <= 0
        t["late"] = t["progress"] < 100 and t["end_date"] < at
        t["slip_days"] = (t["end_date"] - t["baseline_end"]).days if t.get("baseline_end") else None


def _load(conn: psycopg.Connection, project_id) -> tuple[dict[str, dict], list[dict]]:
    cur = conn.cursor(row_factory=dict_row)
    rows = cur.execute(
        """SELECT t.id::text, t.parent_id::text, t.seq, t.name, t.description, t.start_date, t.end_date, t.milestone,
                  t.progress, t.assignee_id::text, p.full_name AS assignee_name, t.baseline_start, t.baseline_end
           FROM pm.task t LEFT JOIN core.person p ON p.id = t.assignee_id
           WHERE t.project_id = %s""",
        (project_id,),
    ).fetchall()
    deps = cur.execute(
        """SELECT predecessor_id::text, successor_id::text, lag_days FROM pm.dependency WHERE project_id = %s
           ORDER BY predecessor_id, successor_id""",
        (project_id,),
    ).fetchall()
    return {r["id"]: dict(r) for r in rows}, deps


def _ordered(tasks: dict[str, dict]) -> list[dict]:
    kids = _children(tasks)
    out: list[dict] = []

    def walk(parent) -> None:
        for tid in kids.get(parent, []):
            out.append(tasks[tid])
            walk(tid)

    walk(None)
    return out


def _json(value):
    if isinstance(value, dt.date | dt.datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _clean(row: dict) -> dict:
    return {k: _json(v) for k, v in row.items()}


def stats(conn: psycopg.Connection, project_id, at: dt.date | None = None) -> dict:
    row = (
        conn.cursor(row_factory=dict_row)
        .execute("SELECT * FROM pm.stats(%s, %s)", (project_id, at or today()))
        .fetchone()
    )
    return _clean(row)


def suggest_health(s: dict) -> str:
    """Gợi ý tình trạng: xanh khi SPI ≥ 0,95 và không việc trễ; đỏ khi SPI < 0,8; còn lại vàng."""
    spi = s.get("spi")
    if spi is None:
        return "GREEN" if not s.get("late_tasks") else "AMBER"
    if spi >= 0.95 and not s.get("late_tasks"):
        return "GREEN"
    return "RED" if spi < 0.8 else "AMBER"


def pm_project_detail(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    project = _readable(conn, tenant, person, args.get("id"))
    cur = conn.cursor(row_factory=dict_row)
    tasks, deps = _load(conn, project["id"])
    rollup(tasks)
    at = today()
    analyze(tasks, deps, at)
    members = cur.execute(
        """SELECT m.person_id::text, p.full_name, m.role, m.added_at FROM pm.member m
           JOIN core.person p ON p.id = m.person_id WHERE m.project_id = %s
           ORDER BY array_position(ARRAY['MANAGER', 'MEMBER', 'VIEWER'], m.role), p.full_name""",
        (project["id"],),
    ).fetchall()
    reports = cur.execute(
        """SELECT r.id::text, r.period_from, r.period_to, r.health, r.summary, r.accomplishments, r.next_steps, r.issues,
                  r.planned_pct, r.actual_pct, r.spi, r.late_tasks, r.created_at, p.full_name AS created_by_name
           FROM pm.report r JOIN core.person p ON p.id = r.created_by
           WHERE r.project_id = %s ORDER BY r.period_to DESC, r.created_at DESC""",
        (project["id"],),
    ).fetchall()
    extra = cur.execute(
        """SELECT u.name AS org_unit_name, m.full_name AS manager_name FROM pm.project j
           JOIN core.org_unit u ON u.id = j.org_unit_id JOIN core.person m ON m.id = j.manager_id WHERE j.id = %s""",
        (project["id"],),
    ).fetchone()
    warnings = []
    if tasks:
        last = max(t["end_date"] for t in tasks.values())
        if last > project["end_date"]:
            warnings.append(
                f"Kế hoạch kết thúc {i18n.date(last)}, sau ngày kết thúc dự án {i18n.date(project['end_date'])}"
            )
    s = stats(conn, project["id"], at)
    return {
        "project": _clean({**project, **extra}),
        "members": [_clean(m) for m in members],
        "tasks": [_clean(t) for t in _ordered(tasks)],
        "dependencies": deps,
        "stats": {**s, "suggested_health": suggest_health(s), "today": at.isoformat()},
        "reports": [_clean(r) for r in reports],
        "can_manage": _can(conn, "can_manage", project["id"], person),
        "my_role": next((m["role"] for m in members if m["person_id"] == person), None),
        "warnings": warnings,
    }


def _sync_chat(conn: psycopg.Connection, tenant: str, project: dict) -> None:
    """Nhóm nhắn tin của dự án có đúng các thành viên dự án (ADR #65); người quản lý là chủ nhóm."""
    conv = project["conversation_id"]
    title = f"Dự án {project['code']}: {project['name']}"[:120]
    if conv is None:
        conv = conn.execute(
            "INSERT INTO chat.conversation (tenant_id, kind, title, created_by) VALUES (%s, 'GROUP', %s, %s) RETURNING id",
            (tenant, title, project["manager_id"]),
        ).fetchone()[0]
        conn.execute("UPDATE pm.project SET conversation_id = %s WHERE id = %s", (conv, project["id"]))
    else:
        conn.execute("UPDATE chat.conversation SET title = %s WHERE id = %s", (title, conv))
    conn.execute(
        """INSERT INTO chat.member (tenant_id, conversation_id, person_id, role)
           SELECT %(t)s, %(c)s, m.person_id, CASE WHEN m.role = 'MANAGER' THEN 'OWNER' ELSE 'MEMBER' END
           FROM pm.member m WHERE m.project_id = %(p)s
           ON CONFLICT (conversation_id, person_id) DO UPDATE SET left_at = NULL, role = EXCLUDED.role""",
        {"t": tenant, "c": conv, "p": project["id"]},
    )
    conn.execute(
        """UPDATE chat.member SET left_at = now()
           WHERE conversation_id = %s AND left_at IS NULL
             AND person_id NOT IN (SELECT person_id FROM pm.member WHERE project_id = %s)""",
        (conv, project["id"]),
    )


def pm_project_save(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    data = args.get("project") or {}
    if not isinstance(data, dict):
        raise ActionError("Thiếu nội dung dự án")
    code = str(data.get("code") or "").strip().upper()
    if not code or not code.replace("-", "").replace("_", "").isalnum() or not 2 <= len(code) <= 20:
        raise ActionError("Mã dự án 2–20 ký tự chữ, số, gạch nối (ví dụ ERP-2027)")
    start = _date(data.get("start_date"), "Ngày bắt đầu")
    end = _date(data.get("end_date"), "Ngày kết thúc")
    if end < start or (end - start).days > 3660:
        raise ActionError("Ngày kết thúc phải sau ngày bắt đầu và trong vòng 10 năm")
    status = data.get("status") or "PLANNING"
    if status not in STATUSES:
        raise ActionError("Trạng thái dự án không hợp lệ")
    unit = _uuid(data.get("org_unit_id"), "đơn vị chủ trì")
    manager = _uuid(data.get("manager_id") or person, "người quản lý")
    found = conn.execute(
        """SELECT (SELECT count(*) FROM core.org_unit WHERE id = %s AND tenant_id = %s),
                  (SELECT count(*) FROM core.person WHERE id = %s AND tenant_id = %s)""",
        (unit, tenant, manager, tenant),
    ).fetchone()
    if found != (1, 1):
        raise ActionError("Không tìm thấy đơn vị chủ trì hoặc người quản lý trong công ty", "not-found", 404)
    budget = data.get("budget")
    if budget not in (None, ""):
        try:
            budget = Decimal(str(budget))
        except ArithmeticError as exc:
            raise ActionError("Ngân sách là số tiền (đồng)") from exc
        if budget < 0:
            raise ActionError("Ngân sách không âm")
    else:
        budget = None
    fields = {
        "code": code,
        "name": _text(data.get("name"), 200, "tên dự án", required=True),
        "org_unit_id": unit,
        "manager_id": manager,
        "status": status,
        "start_date": start,
        "end_date": end,
        "budget": budget,
        **{f: _text(data.get(f), 8000, f) for f in PLAN_FIELDS},
    }
    cur = conn.cursor(row_factory=dict_row)
    if data.get("id"):
        old = _manageable(conn, tenant, person, data["id"])
        cur.execute(
            f"""UPDATE pm.project SET {", ".join(f"{k} = %({k})s" for k in fields)}, updated_at = now()
                WHERE id = %(id)s RETURNING *""",
            {**fields, "id": old["id"]},
        )
        project = cur.fetchone()
        created = False
    else:
        if conn.execute("SELECT 1 FROM pm.project WHERE tenant_id = %s AND code = %s", (tenant, code)).fetchone():
            raise ActionError(f"Mã dự án {code} đã có trong công ty")
        cur.execute(
            f"""INSERT INTO pm.project (tenant_id, created_by, {", ".join(fields)})
                VALUES (%(tenant)s, %(me)s, {", ".join(f"%({k})s" for k in fields)}) RETURNING *""",
            {**fields, "tenant": tenant, "me": person},
        )
        project = cur.fetchone()
        created = True
        if manager != person:
            conn.execute(
                "INSERT INTO pm.member (tenant_id, project_id, person_id, role) VALUES (%s, %s, %s, 'MANAGER')",
                (tenant, project["id"], person),
            )
    conn.execute(
        """INSERT INTO pm.member (tenant_id, project_id, person_id, role) VALUES (%s, %s, %s, 'MANAGER')
           ON CONFLICT (project_id, person_id) DO UPDATE SET role = 'MANAGER'""",
        (tenant, project["id"], manager),
    )
    _sync_chat(conn, tenant, project)
    return {"id": str(project["id"]), "created": created}


def pm_members_set(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    project = _manageable(conn, tenant, person, args.get("project_id"))
    wanted: dict[str, str] = {}
    for m in args.get("members") or []:
        role = (m or {}).get("role") or "MEMBER"
        if role not in ROLES:
            raise ActionError("Vai trò gồm MANAGER, MEMBER, VIEWER")
        wanted[_uuid(m.get("person_id"), "người")] = role
    wanted[str(project["manager_id"])] = "MANAGER"
    if len(wanted) > MAX_MEMBERS:
        raise ActionError(f"Dự án tối đa {MAX_MEMBERS} thành viên")
    n = conn.execute(
        "SELECT count(*) FROM core.person WHERE tenant_id = %s AND id = ANY(%s::uuid[])", (tenant, list(wanted))
    ).fetchone()[0]
    if n != len(wanted):
        raise ActionError("Có người không thuộc công ty", "not-found", 404)
    before = {
        str(r[0]) for r in conn.execute("SELECT person_id FROM pm.member WHERE project_id = %s", (project["id"],))
    }
    conn.execute(
        "DELETE FROM pm.member WHERE project_id = %s AND NOT (person_id = ANY(%s::uuid[]))",
        (project["id"], list(wanted)),
    )
    for pid, role in wanted.items():
        conn.execute(
            """INSERT INTO pm.member (tenant_id, project_id, person_id, role) VALUES (%s, %s, %s, %s)
               ON CONFLICT (project_id, person_id) DO UPDATE SET role = EXCLUDED.role""",
            (tenant, project["id"], pid, role),
        )
    for pid in set(wanted) - before:
        conn.execute(
            "SELECT collab.notify(%s, %s, 'PROJECT_TASK', 'pm.project', %s, %s, %s, %s)",
            (tenant, pid, project["id"], f"Bạn được thêm vào dự án {project['code']}", project["name"], person),
        )
    _sync_chat(conn, tenant, project)
    return {"members": len(wanted)}


def _task_fields(data: dict, old: dict | None) -> dict:
    base = old or {}
    start = _date(data.get("start_date", base.get("start_date")), "Ngày bắt đầu")
    milestone = bool(data.get("milestone", base.get("milestone", False)))
    end = start if milestone else _date(data.get("end_date", base.get("end_date")), "Ngày kết thúc")
    if end < start:
        raise ActionError("Ngày kết thúc công việc phải sau ngày bắt đầu")
    progress = data.get("progress", base.get("progress", 0))
    if not isinstance(progress, int) or not 0 <= progress <= 100:
        raise ActionError("% hoàn thành là số nguyên 0–100")
    return {
        "name": _text(data.get("name", base.get("name")), 300, "tên công việc", required=True),
        "description": _text(data.get("description", base.get("description")), 4000, "mô tả"),
        "start_date": start,
        "end_date": end,
        "milestone": milestone,
        "progress": progress,
    }


def _persist(conn: psycopg.Connection, tasks: dict[str, dict], moved: set[str], original: dict[str, tuple]) -> int:
    """Ghi ngày mới của mọi công việc đổi trong một câu lệnh (trước đây một câu mỗi công việc, ADR #67)."""
    changed = [t for tid, t in tasks.items() if tid in original and original[tid] != (t["start_date"], t["end_date"])]
    if changed:
        conn.execute(
            """UPDATE pm.task t SET start_date = c.s, end_date = c.e
               FROM unnest(%s::uuid[], %s::date[], %s::date[]) AS c(id, s, e) WHERE t.id = c.id""",
            ([t["id"] for t in changed], [t["start_date"] for t in changed], [t["end_date"] for t in changed]),
        )
    return sum(1 for t in changed if t["id"] in moved)


def _reschedule(conn: psycopg.Connection, project_id) -> int:
    tasks, deps = _load(conn, project_id)
    original = {tid: (t["start_date"], t["end_date"]) for tid, t in tasks.items()}
    moved = schedule(tasks, deps)
    return _persist(conn, tasks, moved, original)


def pm_task_save(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    data = args.get("task") or {}
    if not isinstance(data, dict):
        raise ActionError("Thiếu nội dung công việc")
    cur = conn.cursor(row_factory=dict_row)
    old = None
    if data.get("id"):
        old = cur.execute(
            "SELECT * FROM pm.task WHERE id = %s AND tenant_id = %s", (_uuid(data["id"], "công việc"), tenant)
        ).fetchone()
        if not old:
            raise ActionError("Không tìm thấy công việc", "not-found", 404)
        project = _readable(conn, tenant, person, old["project_id"], lock=True)
    else:
        project = _readable(conn, tenant, person, data.get("project_id"), lock=True)
    manager = _can(conn, "can_manage", project["id"], person)
    if not manager:
        own = old is not None and str(old["assignee_id"]) == person
        allowed = {"id", "progress", "project_id"}
        if not own or set(data) - allowed:
            raise ActionError(
                "Chỉ người quản lý dự án sửa kế hoạch; người phụ trách chỉ cập nhật % hoàn thành", "forbidden", 403
            )
    fields = _task_fields(data, old)
    assignee = data.get("assignee_id", old["assignee_id"] if old else None)
    if assignee:
        assignee = _uuid(assignee, "người phụ trách")
        if not conn.execute(
            "SELECT 1 FROM pm.member WHERE project_id = %s AND person_id = %s AND role <> 'VIEWER'",
            (project["id"], assignee),
        ).fetchone():
            raise ActionError("Người phụ trách phải là thành viên dự án (không phải người theo dõi)")
    parent = data.get("parent_id", old["parent_id"] if old else None)
    if parent:
        parent = _uuid(parent, "công việc cha")
        if not conn.execute(
            "SELECT 1 FROM pm.task WHERE id = %s AND project_id = %s", (parent, project["id"])
        ).fetchone():
            raise ActionError("Công việc cha không thuộc dự án")
    if old:
        tid = str(old["id"])
        cur.execute(
            """UPDATE pm.task SET name = %(name)s, description = %(description)s, start_date = %(start_date)s,
                   end_date = %(end_date)s, milestone = %(milestone)s, progress = %(progress)s, assignee_id = %(a)s,
                   parent_id = %(parent)s,
                   seq = CASE WHEN parent_id IS DISTINCT FROM %(parent)s
                              THEN (SELECT coalesce(max(seq), 0) + 1 FROM pm.task
                                    WHERE project_id = %(p)s AND parent_id IS NOT DISTINCT FROM %(parent)s::uuid)
                              ELSE seq END
               WHERE id = %(id)s""",
            {**fields, "a": assignee, "parent": parent, "id": tid, "p": project["id"]},
        )
    else:
        count = conn.execute("SELECT count(*) FROM pm.task WHERE project_id = %s", (project["id"],)).fetchone()[0]
        if count >= MAX_TASKS:
            raise ActionError(f"Một dự án tối đa {MAX_TASKS} công việc")
        tid = str(
            cur.execute(
                """INSERT INTO pm.task (tenant_id, project_id, parent_id, seq, name, description, start_date, end_date,
                       milestone, progress, assignee_id)
                   VALUES (%(t)s, %(p)s, %(parent)s,
                           (SELECT coalesce(max(seq), 0) + 1 FROM pm.task
                            WHERE project_id = %(p)s AND parent_id IS NOT DISTINCT FROM %(parent)s::uuid),
                           %(name)s, %(description)s, %(start_date)s, %(end_date)s, %(milestone)s, %(progress)s, %(a)s)
                   RETURNING id""",
                {**fields, "t": tenant, "p": project["id"], "parent": parent, "a": assignee},
            ).fetchone()["id"]
        )
    if manager and "predecessors" in data:
        preds = data.get("predecessors") or []
        conn.execute("DELETE FROM pm.dependency WHERE successor_id = %s", (tid,))
        for p in preds:
            pid = _uuid((p or {}).get("id"), "công việc trước")
            lag = (p or {}).get("lag_days", 0)
            if not isinstance(lag, int):
                raise ActionError("Độ trễ là số ngày nguyên")
            conn.execute(
                """INSERT INTO pm.dependency (tenant_id, project_id, predecessor_id, successor_id, lag_days)
                   VALUES (%s, %s, %s, %s, %s)""",
                (tenant, project["id"], pid, tid, lag),
            )
    if assignee and assignee != person and (not old or str(old["assignee_id"]) != assignee):
        conn.execute(
            "SELECT collab.notify(%s, %s, 'PROJECT_TASK', 'pm.project', %s, %s, %s, %s)",
            (
                tenant,
                assignee,
                project["id"],
                f"Việc mới trong dự án {project['code']}: {fields['name']}",
                f"{i18n.date(fields['start_date'])} – {i18n.date(fields['end_date'])}",
                person,
            ),
        )
    shifted = _reschedule(conn, project["id"])
    conn.execute("UPDATE pm.project SET updated_at = now() WHERE id = %s", (project["id"],))
    return {"id": tid, "shifted": shifted}


def pm_task_delete(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    task = conn.execute(
        "SELECT project_id FROM pm.task WHERE id = %s AND tenant_id = %s", (_uuid(args.get("id"), "công việc"), tenant)
    ).fetchone()
    if not task:
        raise ActionError("Không tìm thấy công việc", "not-found", 404)
    _manageable(conn, tenant, person, task[0])
    deleted = conn.execute(
        """WITH RECURSIVE sub(id) AS (SELECT %s::uuid UNION SELECT t.id FROM pm.task t JOIN sub ON t.parent_id = sub.id)
           SELECT count(*) FROM sub""",
        (args["id"],),
    ).fetchone()[0]
    conn.execute("DELETE FROM pm.task WHERE id = %s", (args["id"],))
    return {"deleted": deleted}


def pm_task_reorder(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Lên/xuống trong cùng cấp, thụt vào (làm con của việc liền trên) hoặc lùi ra (ngang hàng với cha)."""
    person, tenant = _who(conn, session)
    direction = args.get("direction")
    if direction not in ("up", "down", "indent", "outdent"):
        raise ActionError("Hướng gồm up, down, indent, outdent")
    cur = conn.cursor(row_factory=dict_row)
    task = cur.execute(
        "SELECT * FROM pm.task WHERE id = %s AND tenant_id = %s", (_uuid(args.get("id"), "công việc"), tenant)
    ).fetchone()
    if not task:
        raise ActionError("Không tìm thấy công việc", "not-found", 404)
    _manageable(conn, tenant, person, task["project_id"])
    siblings = cur.execute(
        """SELECT id, seq FROM pm.task WHERE project_id = %s AND parent_id IS NOT DISTINCT FROM %s
           ORDER BY seq, start_date, name""",
        (task["project_id"], task["parent_id"]),
    ).fetchall()
    ids = [s["id"] for s in siblings]
    i = ids.index(task["id"])
    if direction in ("up", "down"):
        j = i - 1 if direction == "up" else i + 1
        if 0 <= j < len(ids):
            ids[i], ids[j] = ids[j], ids[i]
            for n, sid in enumerate(ids, start=1):
                conn.execute("UPDATE pm.task SET seq = %s WHERE id = %s", (n, sid))
    elif direction == "indent":
        if i == 0:
            raise ActionError("Không có công việc liền trên cùng cấp để thụt vào")
        new_parent = ids[i - 1]
        if conn.execute(
            "SELECT 1 FROM pm.dependency WHERE (predecessor_id, successor_id) IN ((%s, %s), (%s, %s))",
            (new_parent, task["id"], task["id"], new_parent),
        ).fetchone():
            raise ActionError("Hai công việc đang phụ thuộc nhau, không lồng được")
        conn.execute(
            """UPDATE pm.task SET parent_id = %s,
                   seq = (SELECT coalesce(max(seq), 0) + 1 FROM pm.task WHERE parent_id = %s) WHERE id = %s""",
            (new_parent, new_parent, task["id"]),
        )
    else:
        if task["parent_id"] is None:
            raise ActionError("Công việc đã ở cấp cao nhất")
        parent = cur.execute("SELECT parent_id, seq FROM pm.task WHERE id = %s", (task["parent_id"],)).fetchone()
        conn.execute(
            """UPDATE pm.task SET seq = seq + 1 WHERE project_id = %s AND parent_id IS NOT DISTINCT FROM %s
               AND seq > %s""",
            (task["project_id"], parent["parent_id"], parent["seq"]),
        )
        conn.execute(
            "UPDATE pm.task SET parent_id = %s, seq = %s WHERE id = %s",
            (parent["parent_id"], parent["seq"] + 1, task["id"]),
        )
    _reschedule(conn, task["project_id"])
    return {"id": str(task["id"])}


def pm_baseline_set(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    project = _manageable(conn, tenant, person, args.get("project_id"))
    n = conn.execute(
        "UPDATE pm.task SET baseline_start = start_date, baseline_end = end_date WHERE project_id = %s",
        (project["id"],),
    ).rowcount
    conn.execute("UPDATE pm.project SET baseline_at = now() WHERE id = %s", (project["id"],))
    return {"tasks": n}


def pm_report_create(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    data = args.get("report") or {}
    if not isinstance(data, dict):
        raise ActionError("Thiếu nội dung báo cáo")
    project = _manageable(conn, tenant, person, data.get("project_id"))
    start = _date(data.get("period_from"), "Đầu kỳ")
    end = _date(data.get("period_to"), "Cuối kỳ")
    if end < start:
        raise ActionError("Cuối kỳ phải sau đầu kỳ")
    s = stats(conn, project["id"], min(end, today()))
    health = data.get("health") or suggest_health(s)
    if health not in HEALTH:
        raise ActionError("Tình trạng gồm GREEN, AMBER, RED")
    tasks, deps = _load(conn, project["id"])
    rollup(tasks)
    analyze(tasks, deps, min(end, today()))
    snapshot = [
        {
            "wbs": t["wbs"],
            "name": t["name"],
            "start_date": t["start_date"].isoformat(),
            "end_date": t["end_date"].isoformat(),
            "progress": t["progress"],
            "assignee": t["assignee_name"],
            "late": t["late"],
            "milestone": t["milestone"],
            "level": t["level"],
        }
        for t in _ordered(tasks)
    ]
    rid = conn.execute(
        """INSERT INTO pm.report (tenant_id, project_id, period_from, period_to, health, summary, accomplishments,
               next_steps, issues, planned_pct, actual_pct, spi, late_tasks, snapshot, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            tenant,
            project["id"],
            start,
            end,
            health,
            _text(data.get("summary"), 8000, "tóm tắt", required=True),
            _text(data.get("accomplishments"), 8000, "kết quả đạt được"),
            _text(data.get("next_steps"), 8000, "kế hoạch kỳ tới"),
            _text(data.get("issues"), 8000, "vướng mắc"),
            s["planned_pct"],
            s["actual_pct"],
            s["spi"],
            s["late_tasks"],
            json.dumps(snapshot, ensure_ascii=False),
            person,
        ),
    ).fetchone()[0]
    for (pid,) in conn.execute(
        "SELECT person_id FROM pm.member WHERE project_id = %s AND person_id <> %s", (project["id"], person)
    ).fetchall():
        conn.execute(
            "SELECT collab.notify(%s, %s, 'PROJECT_REPORT', 'pm.project', %s, %s, %s, %s)",
            (
                tenant,
                pid,
                project["id"],
                f"Báo cáo tiến độ {project['code']} kỳ {i18n.date(start)} – {i18n.date(end)}",
                f"{HEALTH_LABEL[health]} · thực hiện {s['actual_pct']}% / kế hoạch {s['planned_pct']}%",
                person,
            ),
        )
    return {"id": str(rid), "health": health, **{k: s[k] for k in ("planned_pct", "actual_pct", "spi", "late_tasks")}}


def gantt_rows(tasks: list[dict], start: dt.date, end: dt.date) -> list[dict]:
    """Vị trí thanh Gantt theo % chiều rộng khung thời gian, cho mẫu in (HTML/CSS, không cần thư viện vẽ)."""
    span = max((end - start).days + 1, 1)
    out = []
    for t in tasks:
        s = (t["start_date"] - start).days
        w = (t["end_date"] - t["start_date"]).days + 1
        out.append({**t, "left": round(max(s, 0) * 100 / span, 3), "width": round(max(w, 1) * 100 / span, 3)})
    return out


def _months(start: dt.date, end: dt.date) -> list[dict]:
    span = (end - start).days + 1
    out, cur = [], start.replace(day=1)
    while cur <= end:
        nxt = (cur.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        a, b = max(cur, start), min(nxt - dt.timedelta(days=1), end)
        out.append({"label": i18n.month(cur), "width": round(((b - a).days + 1) * 100 / span, 3)})
        cur = nxt
    return out


def pm_plan_pdf(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    documents._need_pdf(ctx)
    i18n.for_session(conn, session)
    detail = pm_project_detail(conn, session, {"id": args.get("project_id")}, ctx)
    p = detail["project"]
    tasks = [
        {**t, "start_date": dt.date.fromisoformat(t["start_date"]), "end_date": dt.date.fromisoformat(t["end_date"])}
        for t in detail["tasks"]
    ]
    start = min([dt.date.fromisoformat(p["start_date"]), *(t["start_date"] for t in tasks)])
    end = max([dt.date.fromisoformat(p["end_date"]), *(t["end_date"] for t in tasks)])
    tenant = conn.execute("SELECT name FROM core.tenant WHERE id = %s", (p["tenant_id"],)).fetchone()[0]
    html = forms._env.get_template("ke_hoach_du_an.html").render(
        p=p,
        tenant_name=tenant,
        status=i18n.t(STATUS_LABEL[p["status"]]),
        members=[{**m, "role_label": i18n.t(ROLE_LABEL[m["role"]])} for m in detail["members"]],
        tasks=gantt_rows(tasks, start, end),
        milestones=[t for t in tasks if t["milestone"]],
        months=_months(start, end),
        today_left=round(((today() - start).days) * 100 / max((end - start).days + 1, 1), 3)
        if start <= today() <= end
        else None,
        stats=detail["stats"],
        printed=today(),
    )
    digest = documents._digest(html)
    out = documents._publish(
        ctx, f"{p['tenant_id']}/pm.project/{p['id']}", digest, html, p["code"], f"ke-hoach-{p['code'].lower()}.pdf"
    )
    return {"project_id": p["id"], **out}


def pm_report_pdf(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    documents._need_pdf(ctx)
    i18n.for_session(conn, session)
    person, tenant = _who(conn, session)
    report = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT r.*, p.full_name AS created_by_name FROM pm.report r JOIN core.person p ON p.id = r.created_by
               WHERE r.id = %s AND r.tenant_id = %s""",
            (_uuid(args.get("report_id"), "báo cáo"), tenant),
        )
        .fetchone()
    )
    if not report:
        raise ActionError("Không tìm thấy báo cáo", "not-found", 404)
    project = _readable(conn, tenant, person, report["project_id"])
    unit = conn.execute("SELECT name FROM core.org_unit WHERE id = %s", (project["org_unit_id"],)).fetchone()[0]
    manager = conn.execute("SELECT full_name FROM core.person WHERE id = %s", (project["manager_id"],)).fetchone()[0]
    tenant_name = conn.execute("SELECT name FROM core.tenant WHERE id = %s", (tenant,)).fetchone()[0]
    html = forms._env.get_template("bao_cao_tien_do.html").render(
        r=_clean(report),
        p={**_clean(project), "org_unit_name": unit, "manager_name": manager},
        tenant_name=tenant_name,
        health=i18n.t(HEALTH_LABEL[report["health"]]),
        tasks=report["snapshot"],
    )
    digest = documents._digest(html)
    doc_no = f"{project['code']}-{report['period_to']:%Y%m%d}"
    out = documents._publish(
        ctx, f"{tenant}/pm.report/{report['id']}", digest, html, doc_no, f"bao-cao-tien-do-{doc_no.lower()}.pdf"
    )
    return {"report_id": str(report["id"]), **out}


HANDLERS = {
    "pm_project_detail": pm_project_detail,
    "pm_project_save": pm_project_save,
    "pm_members_set": pm_members_set,
    "pm_task_save": pm_task_save,
    "pm_task_delete": pm_task_delete,
    "pm_task_reorder": pm_task_reorder,
    "pm_baseline_set": pm_baseline_set,
    "pm_report_create": pm_report_create,
    "pm_plan_pdf": pm_plan_pdf,
    "pm_report_pdf": pm_report_pdf,
}
