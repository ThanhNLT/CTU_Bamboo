# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Hasura Actions: mọi thao tác chuyển trạng thái chứng từ đi qua hàm CSDL (ADR #31).

Hasura gửi payload {action, input, session_variables}; người gọi và tenant lấy
từ session_variables. Lỗi trả về 400 {message, extensions.code} để Hasura chuyển
nguyên cho giao diện.
"""

import logging
import os
import pathlib
from contextlib import asynccontextmanager

import psycopg
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from psycopg_pool import ConnectionPool

from . import attachments, auth, config, forms, hr, ic, search
from .common import ActionError, Context, bind_session, require_read, session_identity
from .flow_sync import PROCESS_KEY, business_key
from .flowable import FlowableClient
from .pii import PiiCipher
from .storage import Storage

DECISIONS = {"APPROVE", "REJECT", "RETURN"}
# Bảng của từng loại chứng từ được duyệt (trạng thái trả về sau khi xử lý việc duyệt).
ENTITY_TABLES = {"proc.purchase_request": "proc.purchase_request", "hr.onboarding_request": "hr.onboarding_request"}
BPMN = pathlib.Path(__file__).resolve().parents[3] / "platform/flowable/purchase_request.bpmn20.xml"
log = logging.getLogger("actions")

# Các phần tử BPMN đã đi qua theo trạng thái đề nghị, khi không hỏi được Flowable.
_PATH = ["submitted", "toApprove", "approveStep", "toDecision", "decision"]
_DB_ACTIVITIES = {
    "PENDING": (_PATH[:2], ["approveStep"]),
    "APPROVED": (_PATH + ["toApproved", "approved"], []),
    "REJECTED": (_PATH + ["toRejected", "rejected"], []),
    "RETURNED": (_PATH + ["toReturned", "returned"], []),
    "CANCELLED": (_PATH[:3], []),
}


def submit_purchase_request(conn: psycopg.Connection, session: dict, request_id: str) -> dict:
    row = conn.execute("SELECT tenant_id FROM proc.purchase_request WHERE id = %s", (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    bind_session(conn, session)
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
    bind_session(conn, session)
    conn.execute("SELECT wf.act(%s, %s, %s, %s)", (task_id, person, decision, note))
    entity_type, entity_id = row[1], row[2]
    status = conn.execute(f"SELECT status FROM {ENTITY_TABLES[entity_type]} WHERE id = %s", (entity_id,)).fetchone()[0]
    return {"request_id": str(entity_id), "status": status}


def cancel_purchase_request(conn: psycopg.Connection, session: dict, request_id: str, reason: str) -> dict:
    row = conn.execute("SELECT tenant_id FROM proc.purchase_request WHERE id = %s", (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    bind_session(conn, session)
    conn.execute("SELECT proc.cancel_purchase_request(%s, %s, %s)", (request_id, person, reason))
    return {"request_id": request_id, "status": "CANCELLED"}


def process_state(conn: psycopg.Connection, session: dict, request_id: str, flowable: FlowableClient | None) -> dict:
    """Sơ đồ và bước hiện tại của lần gửi duyệt gần nhất. Đọc từ Flowable (bản phản chiếu,
    ADR #31); Flowable chưa đồng bộ hoặc không truy cập được thì suy ra từ trạng thái trong CSDL."""
    row = conn.execute("SELECT tenant_id, status, approval_round FROM proc.purchase_request WHERE id = %s",
                       (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, 'proc.purchase_request', request_id, person)
    _, status, round_no = row
    sync = conn.execute(
        """SELECT process_instance_id FROM wf.flow_sync
           WHERE entity_type = 'proc.purchase_request' AND entity_id = %s AND round = %s""",
        (request_id, round_no)).fetchone()
    process_id = sync[0] if sync else None
    result = {"request_id": request_id, "round": round_no, "status": status, "process_instance_id": process_id}

    if process_id and flowable is not None:
        try:
            instance = flowable.find_process(PROCESS_KEY, business_key(request_id, round_no))
            activities = flowable.historic_activities(process_id)
            completed = list(dict.fromkeys(a["activityId"] for a in activities if a.get("endTime")))
            active = list(dict.fromkeys(a["activityId"] for a in activities if not a.get("endTime")))
            return {**result, "bpmn_xml": flowable.process_definition_xml(instance["processDefinitionId"]),
                    "completed_activity_ids": completed, "active_activity_ids": active, "source": "flowable"}
        except Exception as exc:  # noqa: BLE001 - Flowable là bản phản chiếu, lỗi thì dùng CSDL
            log.warning("process_state: không đọc được Flowable cho %s: %s", request_id, exc)
    completed, active = _DB_ACTIVITIES.get(status, ([], []))
    return {**result, "bpmn_xml": BPMN.read_text(encoding="utf-8"),
            "completed_activity_ids": completed, "active_activity_ids": active, "source": "database"}


def verify_audit_chain(conn: psycopg.Connection, session: dict) -> dict:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if not conn.execute("SELECT 1 FROM audit.v_reader WHERE tenant_id = %s AND person_id = %s",
                        (tenant, person)).fetchone():
        raise ActionError("Cần quyền audit.read để đối soát nhật ký", "forbidden", 403)
    problems = conn.execute("SELECT seq, log_id, problem FROM audit.verify_chain(%s)", (tenant,)).fetchall()
    checked = conn.execute("SELECT count(*) FROM audit.log WHERE tenant_id = %s", (tenant,)).fetchone()[0]
    head = conn.execute("SELECT seq, encode(hash, 'hex') FROM audit.chain_head WHERE tenant_id = %s",
                        (tenant,)).fetchone()
    return {"tenant_id": tenant, "ok": not problems, "checked": checked,
            "head_seq": head[0] if head else 0, "head_hash": head[1] if head else None,
            "problems": [{"seq": p[0], "log_id": p[1], "problem": p[2]} for p in problems]}


HANDLERS = {
    "my_tenants": lambda conn, session, args, _ctx: auth.my_tenants(conn, session),
    "submit_purchase_request": lambda conn, session, args, _ctx: submit_purchase_request(
        conn, session, args["request_id"]),
    "act_on_task": lambda conn, session, args, _ctx: act_on_task(
        conn, session, args["task_id"], args["decision"], args.get("note")),
    "cancel_purchase_request": lambda conn, session, args, _ctx: cancel_purchase_request(
        conn, session, args["request_id"], args["reason"]),
    "process_state": lambda conn, session, args, ctx: process_state(conn, session, args["request_id"], ctx.flowable),
    "verify_audit_chain": lambda conn, session, args, _ctx: verify_audit_chain(conn, session),
    "get_upload_url": attachments.get_upload_url,
    "confirm_upload": attachments.confirm_upload,
    "get_download_url": attachments.get_download_url,
    "delete_attachment": attachments.delete_attachment,
    "search_documents": search.search_documents,
    "get_purchase_request_pdf": forms.get_purchase_request_pdf,
    **hr.HANDLERS,
    **ic.HANDLERS,
}


def run_action(pool: ConnectionPool, name: str, payload: dict, ctx: Context | None = None) -> dict:
    handler = HANDLERS.get(name)
    if handler is None:
        raise ActionError(f"Không có action {name}", "not-found", 404)
    session = {k.lower(): v for k, v in (payload.get("session_variables") or {}).items()}
    args = payload.get("input") or {}
    try:
        with pool.connection() as conn, conn.transaction():
            return handler(conn, session, args, ctx or Context())
    except psycopg.errors.InvalidTextRepresentation as exc:
        raise ActionError("Mã không hợp lệ", "bad-request") from exc
    except (psycopg.errors.RaiseException, psycopg.errors.DataError, psycopg.errors.IntegrityError) as exc:
        # Lỗi nghiệp vụ từ hàm CSDL (RAISE EXCEPTION, mã 22000) hoặc vi phạm ràng buộc.
        raise ActionError(exc.diag.message_primary or str(exc), "rejected") from exc
    except (BotoCoreError, ClientError) as exc:
        log.warning("action %s: lỗi S3: %s", name, exc)
        raise ActionError("Kho lưu trữ tệp tạm thời không truy cập được", "storage-unavailable", 503) from exc


def _pii_cipher() -> PiiCipher | None:
    """Khóa transit `pii` đọc bằng AppRole của dịch vụ; ngoài compose (không có OpenBao) thì không mã hóa được."""
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    return PiiCipher(addr, approle) if addr and approle else None


def create_app(settings: config.Settings | None = None, pool: ConnectionPool | None = None,
               verifier: auth.KeycloakVerifier | None = None, ctx: Context | None = None) -> FastAPI:
    settings = settings or config.load()
    ctx = ctx or Context(
        flowable=FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password, timeout=5.0),
        storage=Storage(settings), clamav_host=settings.clamav_host, clamav_port=settings.clamav_port,
        search=search.Meili(settings.meili_url, settings.meili_search_key, timeout=5.0),
        search_index=settings.meili_index, gotenberg_url=settings.gotenberg_url, pii=_pii_cipher())
    verifier = verifier or auth.KeycloakVerifier(settings.keycloak_jwks_url, settings.keycloak_issuer,
                                                 set(settings.keycloak_clients))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = pool or ConnectionPool(settings.database_url, min_size=1, max_size=10, open=True)
        yield
        if pool is None:
            app.state.pool.close()

    app = FastAPI(title="Bamboo actions", lifespan=lifespan)
    memberships = auth.MembershipCache()

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.get("/auth/gateway")
    def gateway_auth(request: Request):
        """Cổng API (forward-auth, ADR #34): chặn tại biên request GraphQL không có token Keycloak hợp lệ.
        Chỉ kiểm token (chữ ký, hạn, issuer, client); tenant và quyền do Hasura webhook xử lý."""
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            return JSONResponse({"message": "Cần đăng nhập", "extensions": {"code": "unauthorized"}}, 401,
                                headers={"WWW-Authenticate": "Bearer"})
        try:
            claims = verifier.verify(header[7:].strip())
        except auth.AuthError as exc:
            return JSONResponse({"message": str(exc), "extensions": {"code": "unauthorized"}}, 401,
                                headers={"WWW-Authenticate": 'Bearer error="invalid_token"'})
        return JSONResponse({"ok": True}, headers={"X-User-Sub": claims["sub"]})

    @app.get("/auth/hasura")
    def hasura_auth(request: Request):
        """Hasura auth webhook (chế độ GET, Hasura chuyển nguyên header của client)."""
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            return JSONResponse({"message": "Thiếu token"}, 401)
        try:
            claims = verifier.verify(header[7:].strip())
            with app.state.pool.connection() as conn:
                session = auth.session_for(conn, claims, request.headers.get("x-bamboo-tenant"),
                                           request.headers.get("x-hasura-role"), memberships)
        except auth.AuthError as exc:
            return JSONResponse({"message": str(exc)}, 401)
        except psycopg.errors.InvalidTextRepresentation:
            return JSONResponse({"message": "Mã tenant không hợp lệ"}, 401)
        return JSONResponse(session)

    @app.post("/actions/{name}")
    async def action(name: str, request: Request, x_actions_secret: str | None = Header(default=None)):
        if x_actions_secret != settings.actions_secret:
            return JSONResponse({"message": "Sai mã bí mật actions", "extensions": {"code": "unauthorized"}}, 401)
        payload = await request.json()
        try:
            # Action gọi CSDL, Flowable, S3, Gotenberg bằng thư viện đồng bộ: chạy ở threadpool để một
            # Action chậm (in phiếu PDF) không chặn event loop, tức chặn cả auth webhook của mọi request khác.
            result = await run_in_threadpool(run_action, app.state.pool, name, payload, ctx)
        except ActionError as exc:
            return JSONResponse({"message": exc.message, "extensions": {"code": exc.code}}, exc.status)
        return result

    return app


app = create_app()
