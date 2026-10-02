"""Hasura Actions: mọi thao tác chuyển trạng thái chứng từ đi qua hàm CSDL (ADR #31).

Hasura gửi payload {action, input, session_variables}; người gọi và tenant lấy
từ session_variables. Lỗi trả về 400 {message, extensions.code} để Hasura chuyển
nguyên cho giao diện.
"""

import json
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from psycopg_pool import ConnectionPool

from . import config

DECISIONS = {"APPROVE", "REJECT", "RETURN"}


class ActionError(Exception):
    def __init__(self, message: str, code: str = "bad-request", status: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def session_identity(session: dict, tenant_id) -> str:
    """Trả về person.id của người gọi; chặn khi chứng từ thuộc tenant khác phiên."""
    person = session.get("x-hasura-user-id")
    tenant = session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    if tenant_id is None or str(tenant_id) != tenant:
        raise ActionError("Không tìm thấy chứng từ", "not-found", 404)
    return person


def _bind_session(conn: psycopg.Connection, session: dict) -> None:
    # Cùng biến Hasura đặt cho mutation, để trigger và nhật ký biết người gọi.
    conn.execute("SELECT set_config('hasura.user', %s, true)", (json.dumps(session),))


def submit_purchase_request(conn: psycopg.Connection, session: dict, request_id: str) -> dict:
    row = conn.execute("SELECT tenant_id FROM proc.purchase_request WHERE id = %s", (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    _bind_session(conn, session)
    conn.execute("SELECT proc.submit_purchase_request(%s, %s)", (request_id, person))
    status = conn.execute("SELECT status FROM proc.purchase_request WHERE id = %s", (request_id,)).fetchone()[0]
    return {"request_id": request_id, "status": status}


def act_on_task(conn: psycopg.Connection, session: dict, task_id: str, decision: str, note: str | None) -> dict:
    if decision not in DECISIONS:
        raise ActionError(f"Quyết định không hợp lệ: {decision}")
    note = (note or "").strip() or None
    if decision in ("REJECT", "RETURN") and note is None:
        raise ActionError("Từ chối hoặc trả về phải ghi lý do", "note-required")
    row = conn.execute(
        """SELECT t.tenant_id, s.entity_type, s.entity_id
           FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id WHERE t.id = %s""",
        (task_id,),
    ).fetchone()
    person = session_identity(session, row[0] if row else None)
    _bind_session(conn, session)
    conn.execute("SELECT wf.act(%s, %s, %s, %s)", (task_id, person, decision, note))
    entity_type, entity_id = row[1], row[2]
    status = conn.execute("SELECT status FROM proc.purchase_request WHERE id = %s", (entity_id,)).fetchone()[0]
    return {"request_id": str(entity_id), "status": status}


HANDLERS = {
    "submit_purchase_request": lambda conn, session, args: submit_purchase_request(
        conn, session, args["request_id"]),
    "act_on_task": lambda conn, session, args: act_on_task(
        conn, session, args["task_id"], args["decision"], args.get("note")),
}


def run_action(pool: ConnectionPool, name: str, payload: dict) -> dict:
    handler = HANDLERS.get(name)
    if handler is None:
        raise ActionError(f"Không có action {name}", "not-found", 404)
    session = {k.lower(): v for k, v in (payload.get("session_variables") or {}).items()}
    try:
        with pool.connection() as conn, conn.transaction():
            return handler(conn, session, payload.get("input") or {})
    except psycopg.errors.InvalidTextRepresentation as exc:
        raise ActionError("Mã không hợp lệ", "bad-request") from exc
    except (psycopg.errors.RaiseException, psycopg.errors.DataError, psycopg.errors.IntegrityError) as exc:
        # Lỗi nghiệp vụ từ hàm CSDL (RAISE EXCEPTION, mã 22000) hoặc vi phạm ràng buộc.
        raise ActionError(exc.diag.message_primary or str(exc), "rejected") from exc


def create_app(settings: config.Settings | None = None, pool: ConnectionPool | None = None) -> FastAPI:
    settings = settings or config.load()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = pool or ConnectionPool(settings.database_url, min_size=1, max_size=10, open=True)
        yield
        if pool is None:
            app.state.pool.close()

    app = FastAPI(title="Bamboo actions", lifespan=lifespan)

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.post("/actions/{name}")
    async def action(name: str, request: Request, x_actions_secret: str | None = Header(default=None)):
        if x_actions_secret != settings.actions_secret:
            return JSONResponse({"message": "Sai mã bí mật actions", "extensions": {"code": "unauthorized"}}, 401)
        payload = await request.json()
        try:
            result = run_action(app.state.pool, name, payload)
        except ActionError as exc:
            return JSONResponse({"message": exc.message, "extensions": {"code": exc.code}}, exc.status)
        return result

    return app


app = create_app()
