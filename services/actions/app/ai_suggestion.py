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

"""Đề xuất của tác tử AI mức `suggest` (ADR #85): người nhận xem, sửa rồi chấp nhận hoặc bỏ qua.

Chấp nhận thì hệ thống thực hiện dưới phiên của chính người nhận, qua đúng đường nghiệp vụ sẵn có: trả lại chứng từ
bằng act_on_task (wf.act RETURN), tạo công việc bằng projects.pm_task_save, bình luận / thông báo / webhook bằng
ai_agent_runner.execute. Lỗi nghiệp vụ khi thực hiện → đề xuất FAILED kèm lý do, phần nghiệp vụ rollback (savepoint).
"""

import datetime as dt
import logging

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import ai_agent_runner, projects
from .common import ActionError, Context, bind_session

log = logging.getLogger("ai_suggestion")

STATUSES = ("PENDING", "ACCEPTED", "DISMISSED", "FAILED", "EXPIRED")
EDITABLE = {
    "return_for_info": ("note",),
    "project_task": ("name", "description", "days"),
    "comment": ("text",),
    "notify": ("message",),
    "webhook": (),
}
NOTE_PREFIX = "[Đề xuất AI] "
MAX_REASON = 500
LIST_LIMIT = 100

_SELECT = """
SELECT s.id, s.agent_id, a.name AS agent_name, s.run_id, s.entity_type, s.entity_id,
       CASE WHEN s.entity_type IS NOT NULL AND s.entity_id IS NOT NULL
            THEN collab.entity_label(s.entity_type, s.entity_id) END AS entity_label,
       s.action, s.status, s.reason, s.result, r.assessment, r.risk, p.code AS project_code, p.name AS project_name,
       s.created_at, s.expires_at, s.decided_at
FROM core.ai_suggestion s
JOIN core.ai_agent a ON a.id = s.agent_id
JOIN core.ai_agent_run r ON r.id = s.run_id
LEFT JOIN pm.project p ON p.tenant_id = s.tenant_id AND p.id::text = s.action ->> 'project_id'
"""


def _identity(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    person = session.get("x-hasura-user-id")
    tenant = session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    bind_session(conn, session)
    return person, tenant


def _out(row: dict) -> dict:
    return {
        **row,
        **{k: str(row[k]) for k in ("id", "agent_id", "run_id") if row.get(k)},
        "entity_id": str(row["entity_id"]) if row.get("entity_id") else None,
        **{k: row[k].isoformat() if row.get(k) else None for k in ("created_at", "expires_at", "decided_at")},
    }


def ai_suggestion_list(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> list[dict]:
    """Đề xuất gửi cho người gọi; mặc định chỉ đề xuất đang chờ. Hết hạn được tính lại trước khi đọc."""
    person, tenant = _identity(conn, session)
    status = str(args.get("status") or "PENDING").upper()
    if status != "ALL" and status not in STATUSES:
        raise ActionError(f"Trạng thái đề xuất không hợp lệ: {status}")
    conn.execute("SELECT core.ai_suggestion_expire(now(), %s)", (person,))
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            _SELECT
            + """WHERE s.tenant_id = %(t)s AND s.recipient_id = %(p)s
                   AND (%(type)s::text IS NULL OR s.entity_type = %(type)s)
                   AND (%(eid)s::uuid IS NULL OR s.entity_id = %(eid)s::uuid)
                   AND (%(status)s::text IS NULL OR s.status = %(status)s)
                 ORDER BY s.created_at DESC LIMIT %(limit)s""",
            {
                "t": tenant,
                "p": person,
                "type": args.get("entity_type") or None,
                "eid": args.get("entity_id") or None,
                "status": None if status == "ALL" else status,
                "limit": LIST_LIMIT,
            },
        )
        .fetchall()
    )
    return [_out(r) for r in rows]


def apply_edits(action: dict, edits) -> dict:
    """Áp phần người nhận sửa (chỉ trường văn bản cho phép) rồi kiểm lại toàn bộ hành động."""
    if edits is None:
        edits = {}
    if not isinstance(edits, dict):
        raise ActionError("Phần sửa phải là đối tượng JSON")
    allowed = EDITABLE.get(action.get("type"), ())
    bad = [k for k in edits if k not in allowed]
    if bad:
        raise ActionError(f"Không sửa được trường {', '.join(map(str, bad))} của đề xuất")
    try:
        return ai_agent_runner.check_action({**action, **edits}, cut=False)
    except ValueError as exc:
        message = str(exc)
        raise ActionError(message[:1].upper() + message[1:]) from exc


def _one(conn: psycopg.Connection, sql: str, params: tuple) -> dict | None:
    return conn.cursor(row_factory=dict_row).execute(sql, params).fetchone()


def _open_task(conn: psycopg.Connection, s: dict, person: str):
    row = _one(
        conn,
        """SELECT t.id FROM wf.task t JOIN wf.approval_step st ON st.id = t.step_id
           WHERE st.entity_type = %s AND st.entity_id = %s AND t.status = 'OPEN' AND t.assignee_id = %s
           ORDER BY t.created_at LIMIT 1""",
        (s["entity_type"], s["entity_id"], person),
    )
    if not row:
        raise ActionError("Bạn không còn việc duyệt mở trên chứng từ này", "conflict", 409)
    return row["id"]


def _perform(conn: psycopg.Connection, session: dict, s: dict, action: dict, person: str, ctx: Context) -> dict:
    kind = action["type"]
    if kind == "return_for_info":
        from .main import ENTITY_TABLES, act_on_task

        if s["entity_type"] not in ENTITY_TABLES:
            raise ActionError("Loại chứng từ này chưa hỗ trợ trả lại để bổ sung")
        return act_on_task(conn, session, str(_open_task(conn, s, person)), "RETURN", NOTE_PREFIX + action["note"])
    if kind == "project_task":
        if not _one(conn, "SELECT core.module_enabled(%s, 'project') AS ok", (s["tenant_id"],))["ok"]:
            raise ActionError("Chức năng dự án chưa được bật cho công ty", "module-disabled", 403)
        start = projects.today()
        description = action.get("description") or ""
        if s.get("entity_label"):
            source = f"Nguồn: {s['entity_label']} (đề xuất của tác tử {s['agent_name']})"
            room = ai_agent_runner.MAX_TASK_DESCRIPTION - len(source) - 2
            description = f"{description[:room]}\n\n{source}" if description else source
        return projects.pm_task_save(
            conn,
            session,
            {
                "task": {
                    "project_id": action.get("project_id"),
                    "name": action["name"],
                    "description": description or None,
                    "start_date": start.isoformat(),
                    "end_date": (start + dt.timedelta(days=action["days"] - 1)).isoformat(),
                }
            },
            ctx,
        )
    if s["entity_type"] and s["entity_id"] and kind == "comment":
        readable = _one(conn, "SELECT wf.entity_can_read(%s, %s, %s) AS ok", (s["entity_type"], s["entity_id"], person))
        if not readable["ok"]:
            raise ActionError("Không tìm thấy chứng từ", "not-found", 404)
    run = {
        "id": s["run_id"],
        "tenant_id": s["tenant_id"],
        "agent_id": s["agent_id"],
        "agent_name": s["agent_name"],
        "owner": person,
        "event": s["event"],
        "entity_type": s["entity_type"],
        "entity_id": s["entity_id"],
        "payload": s["payload"],
        "webhook_url": s["webhook_url"],
    }
    plan = {"actions": [action], "assessment": s["assessment"], "risk": s["risk"]}
    [out] = ai_agent_runner.execute(conn, run, plan, ctx.webhook_allow_private)
    if not out.get("ok"):
        raise ActionError(out.get("error") or "Không thực hiện được hành động", "rejected")
    return out


def ai_suggestion_decide(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Chấp nhận (ACCEPT, có thể kèm edits) hoặc bỏ qua (DISMISS) một đề xuất; chỉ người nhận, chỉ khi còn chờ."""
    person, tenant = _identity(conn, session)
    decision = str(args.get("decision") or "").upper()
    if decision not in ("ACCEPT", "DISMISS"):
        raise ActionError("Quyết định phải là ACCEPT hoặc DISMISS")
    reason = str(args.get("reason") or "").strip() or None
    if reason and len(reason) > MAX_REASON:
        raise ActionError(f"Lý do tối đa {MAX_REASON} ký tự")
    conn.execute("SELECT core.ai_suggestion_expire(now(), %s)", (person,))
    cur = conn.cursor(row_factory=dict_row)
    s = cur.execute(
        """SELECT s.*, a.name AS agent_name, a.webhook_url, r.event, r.payload, r.assessment, r.risk,
                  CASE WHEN s.entity_type IS NOT NULL AND s.entity_id IS NOT NULL
                       THEN collab.entity_label(s.entity_type, s.entity_id) END AS entity_label
           FROM core.ai_suggestion s JOIN core.ai_agent a ON a.id = s.agent_id
           JOIN core.ai_agent_run r ON r.id = s.run_id
           WHERE s.id = %s AND s.tenant_id = %s FOR UPDATE OF s""",
        (args.get("id"), tenant),
    ).fetchone()
    if not s:
        raise ActionError("Không tìm thấy đề xuất", "not-found", 404)
    if str(s["recipient_id"]) != person:
        raise ActionError("Chỉ người nhận đề xuất mới chấp nhận hoặc bỏ qua được", "forbidden", 403)
    if s["status"] == "EXPIRED":
        raise ActionError(f"Đề xuất đã hết hạn: {s['reason']}", "conflict", 409)
    if s["status"] != "PENDING":
        raise ActionError("Đề xuất đã được xử lý", "conflict", 409)

    action, result = s["action"], None
    if decision == "DISMISS":
        status = "DISMISSED"
    else:
        action = apply_edits(s["action"], args.get("edits"))
        try:
            with conn.transaction():
                result = _perform(conn, session, s, action, person, ctx)
            status = "ACCEPTED"
        except ActionError as exc:
            if exc.status >= 500:
                raise
            status, reason, result = "FAILED", str(exc)[:MAX_REASON], {"error": str(exc)[:MAX_REASON]}
        except (psycopg.errors.RaiseException, psycopg.errors.DataError, psycopg.errors.IntegrityError) as exc:
            message = (exc.diag.message_primary or str(exc))[:MAX_REASON]
            status, reason, result = "FAILED", message, {"error": message}
        bind_session(conn, session)
    row = cur.execute(
        """UPDATE core.ai_suggestion SET status = %s, decided_by = %s, decided_at = now(), reason = %s, result = %s,
                  action = %s
           WHERE id = %s RETURNING id, status, reason, result, action""",
        (status, person, reason, Jsonb(result) if result is not None else None, Jsonb(action), s["id"]),
    ).fetchone()
    if status == "FAILED":
        log.info("đề xuất %s thực hiện lỗi: %s", s["id"], reason)
    return {**row, "id": str(row["id"])}


HANDLERS = {
    "ai_suggestion_list": ai_suggestion_list,
    "ai_suggestion_decide": ai_suggestion_decide,
}
