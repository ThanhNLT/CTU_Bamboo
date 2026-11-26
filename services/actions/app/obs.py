# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

"""Gom nhật ký và mã truy vết tập trung vào `obs.log_event`.

Mọi bản ghi log của dịch vụ được gắn trace_id (lấy từ X-Request-Id do cổng API cấp), tenant và người dùng đang xử lý,
che thông tin cá nhân rồi ghi theo lô bằng một luồng riêng: ghi log không bao giờ làm chậm hay làm hỏng yêu cầu (hàng
đợi đầy thì bỏ bớt). Log của các container khác vào qua điểm nhận `/obs/ingest` (Vector).
"""

import contextvars
import datetime as dt
import json
import logging
import queue
import re
import sys
import threading
import time

import psycopg

from .common import ActionError, Context, session_identity

trace_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)
tenant_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("tenant_id", default=None)
person_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("person_id", default=None)

LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
EXCLUDED = ("psycopg", "psycopg.pool", "httpx", "httpcore", "obs", "uvicorn.access", "multipart")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"(?<!\d)(?:\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}(?!\d)")
_ID = re.compile(r"(?<!\d)\d{9}(?:\d{3})?(?!\d)")
_BEARER = re.compile(r"(?i)(bearer\s+|token=|secret=|password=)[^\s&\"']+")


def mask(text: str) -> str:
    """Che email, số điện thoại, số căn cước và token trong nội dung log."""
    text = _BEARER.sub(r"\1***", text)
    text = _EMAIL.sub(lambda m: m.group(0)[:1] + "***@" + m.group(0).split("@")[1], text)
    text = _PHONE.sub("***", text)
    return _ID.sub("***", text)


def bind(trace_id: str | None = None, tenant: str | None = None, person: str | None = None) -> None:
    if trace_id:
        trace_var.set(trace_id)
    if tenant:
        tenant_var.set(tenant)
    if person:
        person_var.set(person)


class DbHandler(logging.Handler):
    """Đệm bản ghi log trong bộ nhớ và ghi theo lô vào CSDL ở một luồng nền."""

    def __init__(
        self, service: str, database_url: str, level: int = logging.INFO, maxsize: int = 5000, interval: float = 2.0
    ):
        super().__init__(level)
        self.service, self.database_url, self.interval = service, database_url, interval
        self.queue: queue.Queue[tuple] = queue.Queue(maxsize)
        self.dropped = 0
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._conn: psycopg.Connection | None = None
        self._thread = threading.Thread(target=self._run, name="obs-log-writer", daemon=True)
        self._thread.start()

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith(EXCLUDED):
            return
        try:
            message = mask(record.getMessage())
            fields = dict(getattr(record, "fields", None) or {})
            if record.exc_info:
                fields["exception"] = mask(logging.Formatter().formatException(record.exc_info))[:2000]
            row = (
                dt.datetime.fromtimestamp(record.created, dt.UTC),
                self.service,
                record.levelname if record.levelname in LEVELS else "INFO",
                record.name[:120],
                message[:4000],
                trace_var.get(),
                tenant_var.get(),
                person_var.get(),
                json.dumps(fields, ensure_ascii=False, default=str) if fields else None,
            )
            self.queue.put_nowait(row)
        except queue.Full:
            self.dropped += 1
        except Exception:  # noqa: BLE001, S110
            pass

    def _write(self, rows: list[tuple]) -> None:
        with self._lock:
            if self._conn is None or self._conn.closed:
                self._conn = psycopg.connect(self.database_url, autocommit=True)
            self._conn.cursor().executemany(
                """INSERT INTO obs.log_event (ts, service, level, logger, message, trace_id, tenant_id, person_id, fields)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)""",
                rows,
            )

    def flush(self) -> None:
        rows: list[tuple] = []
        while len(rows) < 500:
            try:
                rows.append(self.queue.get_nowait())
            except queue.Empty:
                break
        if not rows:
            return
        try:
            self._write(rows)
        except Exception as exc:  # noqa: BLE001
            print(f"obs: không ghi được {len(rows)} dòng log: {exc}", file=sys.stderr)
            self._conn = None
            time.sleep(1)

    def _run(self) -> None:
        while not self._stop.is_set():
            self._stop.wait(self.interval)
            while not self.queue.empty():
                self.flush()

    def close(self) -> None:
        self._stop.set()
        self.flush()
        super().close()


_installed: DbHandler | None = None


class _MaskedFormatter(logging.Formatter):
    """Log WARNING trở lên ra stderr (`docker compose logs`) cũng che dữ liệu cá nhân như log tập trung."""

    def format(self, record: logging.LogRecord) -> str:
        return mask(super().format(record))


def install(service: str, database_url: str) -> DbHandler:
    """Gắn bộ ghi log tập trung vào logger gốc; gọi lại thì dùng lại bộ cũ."""
    global _installed
    if _installed is None:
        _installed = DbHandler(service, database_url)
        root = logging.getLogger()
        root.addHandler(_installed)
        if not any(type(h) is logging.StreamHandler for h in root.handlers):
            console = logging.StreamHandler(sys.stderr)
            console.setLevel(logging.WARNING)
            console.setFormatter(_MaskedFormatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
            root.addHandler(console)
        if root.level == logging.NOTSET or root.level > logging.INFO:
            root.setLevel(logging.INFO)
    return _installed


def purge_forever(database_url: str, every: float = 3600.0) -> threading.Thread:
    def loop() -> None:
        while True:
            try:
                with psycopg.connect(database_url, autocommit=True) as conn:
                    conn.execute("SELECT obs.purge()")
            except Exception as exc:  # noqa: BLE001
                print(f"obs: dọn log lỗi: {exc}", file=sys.stderr)
            time.sleep(every)

    thread = threading.Thread(target=loop, name="obs-purge", daemon=True)
    thread.start()
    return thread


def ingest(conn: psycopg.Connection, events: list[dict]) -> int:
    """Nhận lô sự kiện từ bộ thu log bên ngoài (Vector). Bỏ qua dòng sai định dạng."""
    rows = []
    for event in events[:500]:
        if not isinstance(event, dict):
            continue
        message = str(event.get("message") or "").strip()
        if not message:
            continue
        level = str(event.get("level") or "INFO").upper()
        level = {"WARN": "WARNING", "FATAL": "CRITICAL", "TRACE": "DEBUG"}.get(level, level)
        try:
            ts = dt.datetime.fromisoformat(str(event["timestamp"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            ts = dt.datetime.now(dt.UTC)
        rows.append(
            (
                ts,
                str(event.get("service") or "container")[:60],
                level if level in LEVELS else "INFO",
                str(event.get("logger") or "")[:120] or None,
                mask(message)[:4000],
                str(event.get("trace_id") or "")[:100] or None,
                json.dumps(event.get("fields"), ensure_ascii=False, default=str) if event.get("fields") else None,
            )
        )
    if rows:
        conn.cursor().executemany(
            """INSERT INTO obs.log_event (ts, service, level, logger, message, trace_id, fields)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)""",
            rows,
        )
    return len(rows)


def _reader(conn: psycopg.Connection, session: dict) -> str:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if not conn.execute(
        "SELECT 1 FROM audit.v_reader WHERE tenant_id = %s AND person_id = %s", (tenant, person)
    ).fetchone():
        raise ActionError("Cần quyền audit.read để xem nhật ký hệ thống", "forbidden", 403)
    return tenant


def obs_logs(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    tenant = _reader(conn, session)
    clauses = ["(tenant_id = %(tenant)s OR tenant_id IS NULL)", "ts > now() - make_interval(mins => %(mins)s)"]
    params: dict = {"tenant": tenant, "mins": min(max(int(args.get("since_minutes") or 60), 1), 60 * 24 * 60)}
    if args.get("service"):
        clauses.append("service = %(service)s")
        params["service"] = args["service"]
    if args.get("level"):
        order = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        level = str(args["level"]).upper()
        if level not in order:
            raise ActionError("Mức log không hợp lệ")
        clauses.append("level = ANY(%(levels)s)")
        params["levels"] = order[order.index(level) :]
    if args.get("trace_id"):
        clauses.append("trace_id = %(trace)s")
        params["trace"] = args["trace_id"]
    if args.get("q"):
        clauses.append("message ILIKE %(q)s")
        params["q"] = "%" + str(args["q"]).replace("%", r"\%").replace("_", r"\_") + "%"
    params["limit"] = min(max(int(args.get("limit") or 100), 1), 500)
    rows = conn.execute(
        f"""SELECT id, to_char(ts AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD-Mon HH24:MI:SS.MS'), service, level, logger,
                   message, trace_id, fields
            FROM obs.log_event WHERE {" AND ".join(clauses)}
            ORDER BY {"ts ASC" if args.get("trace_id") else "ts DESC"}, id DESC LIMIT %(limit)s""",
        params,
    ).fetchall()
    events = [
        {
            "id": r[0],
            "ts": r[1],
            "service": r[2],
            "level": r[3],
            "logger": r[4],
            "message": r[5],
            "trace_id": r[6],
            "fields": r[7],
        }
        for r in rows
    ]
    counts = conn.execute(
        """SELECT service, level, count(*)::int FROM obs.log_event
           WHERE (tenant_id = %s OR tenant_id IS NULL) AND ts > now() - interval '1 hour' GROUP BY 1, 2 ORDER BY 1, 2""",
        (tenant,),
    ).fetchall()
    return {"events": events, "last_hour": [{"service": c[0], "level": c[1], "n": c[2]} for c in counts]}


def backup_runs(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> list[dict]:
    _reader(conn, session)
    rows = conn.execute(
        """SELECT id, kind, status, location, size_bytes, detail,
                  to_char(started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD-Mon-YYYY HH24:MI:SS'),
                  to_char(finished_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD-Mon-YYYY HH24:MI:SS')
           FROM audit.backup_run ORDER BY id DESC LIMIT 30"""
    ).fetchall()
    keys = ("id", "kind", "status", "location", "size_bytes", "detail", "started_at", "finished_at")
    return [dict(zip(keys, r, strict=True)) for r in rows]


HANDLERS = {"obs_logs": obs_logs, "backup_runs": backup_runs}
