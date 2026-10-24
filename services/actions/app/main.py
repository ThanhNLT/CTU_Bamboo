# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import hmac
import logging
import os
import pathlib
from contextlib import asynccontextmanager

import psycopg
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from psycopg_pool import ConnectionPool
from starlette.concurrency import run_in_threadpool

from . import (
    admin,
    ai_agent,
    attachments,
    audit,
    auth,
    config,
    forms,
    hr,
    hr_account,
    ic,
    kb,
    lakehouse_query,
    ledger,
    ocr,
    ops,
    pii_guard,
    process_design,
    search,
    trino,
    twin,
)
from .common import ActionError, Context, bind_session, require_read, session_identity
from .flow_sync import PROCESS_KEY, business_key
from .flowable import FlowableClient
from .ollama import Ollama
from .pii import PiiCipher
from .storage import Storage

DECISIONS = {"APPROVE", "REJECT", "RETURN"}
ENTITY_TABLES = {
    "proc.purchase_request": "proc.purchase_request",
    "hr.onboarding_request": "hr.onboarding_request",
    "hr.transfer_request": "hr.transfer_request",
    "hr.transfer_out": "hr.transfer_out",
    "hr.transfer_in": "hr.transfer_in",
    "hr.transfer_group": "hr.transfer_group",
    "collab.kb_document": "collab.kb_document",
}
BPMN = pathlib.Path(__file__).resolve().parents[3] / "platform/flowable/purchase_request.bpmn20.xml"
log = logging.getLogger("actions")

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
    row = conn.execute(
        "SELECT tenant_id, status, approval_round FROM proc.purchase_request WHERE id = %s", (request_id,)
    ).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, "proc.purchase_request", request_id, person)
    _, status, round_no = row
    sync = conn.execute(
        """SELECT process_instance_id FROM wf.flow_sync
           WHERE entity_type = 'proc.purchase_request' AND entity_id = %s AND round = %s""",
        (request_id, round_no),
    ).fetchone()
    process_id = sync[0] if sync else None
    result = {"request_id": request_id, "round": round_no, "status": status, "process_instance_id": process_id}

    if process_id and flowable is not None:
        try:
            instance = flowable.find_process(PROCESS_KEY, business_key(request_id, round_no))
            activities = flowable.historic_activities(process_id)
            completed = list(dict.fromkeys(a["activityId"] for a in activities if a.get("endTime")))
            active = list(dict.fromkeys(a["activityId"] for a in activities if not a.get("endTime")))
            return {
                **result,
                "bpmn_xml": flowable.process_definition_xml(instance["processDefinitionId"]),
                "completed_activity_ids": completed,
                "active_activity_ids": active,
                "source": "flowable",
            }
        except Exception as exc:  # noqa: BLE001
            log.warning("process_state: không đọc được Flowable cho %s: %s", request_id, exc)
    completed, active = _DB_ACTIVITIES.get(status, ([], []))
    return {
        **result,
        "bpmn_xml": BPMN.read_text(encoding="utf-8"),
        "completed_activity_ids": completed,
        "active_activity_ids": active,
        "source": "database",
    }


HANDLERS = {
    "my_tenants": lambda conn, session, args, _ctx: auth.my_tenants(conn, session),
    "submit_purchase_request": lambda conn, session, args, _ctx: submit_purchase_request(
        conn, session, args["request_id"]
    ),
    "act_on_task": lambda conn, session, args, _ctx: act_on_task(
        conn, session, args["task_id"], args["decision"], args.get("note")
    ),
    "cancel_purchase_request": lambda conn, session, args, _ctx: cancel_purchase_request(
        conn, session, args["request_id"], args["reason"]
    ),
    "process_state": lambda conn, session, args, ctx: process_state(conn, session, args["request_id"], ctx.flowable),
    "get_upload_url": attachments.get_upload_url,
    "confirm_upload": attachments.confirm_upload,
    "get_download_url": attachments.get_download_url,
    "delete_attachment": attachments.delete_attachment,
    "drive_usage": attachments.drive_usage,
    "search_documents": search.search_documents,
    "get_purchase_request_pdf": forms.get_purchase_request_pdf,
    **hr.HANDLERS,
    **ic.HANDLERS,
    **kb.HANDLERS,
    **ops.HANDLERS,
    **audit.HANDLERS,
    **twin.HANDLERS,
    "check_pii": pii_guard.check_pii,
    **admin.HANDLERS,
    **lakehouse_query.HANDLERS,
    **ledger.HANDLERS,
    **process_design.HANDLERS,
    **ai_agent.HANDLERS,
    **ocr.HANDLERS,
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
        raise ActionError(exc.diag.message_primary or str(exc), "rejected") from exc
    except (BotoCoreError, ClientError) as exc:
        log.warning("action %s: lỗi S3: %s", name, exc)
        raise ActionError("Kho lưu trữ tệp tạm thời không truy cập được", "storage-unavailable", 503) from exc


def _keycloak_users(settings: config.Settings) -> hr_account.KeycloakUsers | None:
    if not settings.keycloak_provisioner_secret:
        return None
    return hr_account.KeycloakUsers(settings.keycloak_url, "bms-provisioner", settings.keycloak_provisioner_secret)


def _lakehouse(settings: config.Settings) -> trino.Trino | None:
    if not settings.trino_password:
        return None
    try:
        return trino.client(settings)
    except OSError as exc:
        log.warning("không tạo được client Trino (CA %s): %s", settings.trino_ca_file, exc)
        return None


def _pii_cipher() -> PiiCipher | None:
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    return PiiCipher(addr, approle) if addr and approle else None


def create_app(
    settings: config.Settings | None = None,
    pool: ConnectionPool | None = None,
    verifier: auth.KeycloakVerifier | None = None,
    ctx: Context | None = None,
) -> FastAPI:
    settings = settings or config.load()
    ctx = ctx or Context(
        flowable=FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password, timeout=5.0),
        storage=Storage(settings),
        clamav_host=settings.clamav_host,
        clamav_port=settings.clamav_port,
        search=search.Meili(settings.meili_url, settings.meili_search_key, timeout=5.0),
        search_index=settings.meili_index,
        gotenberg_url=settings.gotenberg_url,
        pii=_pii_cipher(),
        users=_keycloak_users(settings),
        lakehouse=_lakehouse(settings),
        ai=Ollama(settings.ollama_url, timeout=10.0) if settings.ollama_url else None,
    )
    verifier = verifier or auth.KeycloakVerifier(
        settings.keycloak_jwks_url, settings.keycloak_issuer, set(settings.keycloak_clients)
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = pool or ConnectionPool(settings.database_url, min_size=1, max_size=10, open=True)
        pii_guard.warm_up()
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
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            return JSONResponse(
                {"message": "Cần đăng nhập", "extensions": {"code": "unauthorized"}},
                401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            claims = verifier.verify(header[7:].strip())
        except auth.AuthError as exc:
            return JSONResponse(
                {"message": str(exc), "extensions": {"code": "unauthorized"}},
                401,
                headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
            )
        return JSONResponse({"ok": True}, headers={"X-User-Sub": claims["sub"]})

    @app.get("/auth/hasura")
    def hasura_auth(request: Request):
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            return JSONResponse({"message": "Thiếu token"}, 401)
        try:
            claims = verifier.verify(header[7:].strip())
            with app.state.pool.connection() as conn:
                session = auth.session_for(
                    conn,
                    claims,
                    request.headers.get("x-bamboo-tenant"),
                    request.headers.get("x-hasura-role"),
                    memberships,
                )
        except auth.AuthError as exc:
            return JSONResponse({"message": str(exc)}, 401)
        except psycopg.errors.InvalidTextRepresentation:
            return JSONResponse({"message": "Mã tenant không hợp lệ"}, 401)
        return JSONResponse(session)

    @app.post("/actions/{name}")
    async def action(name: str, request: Request, x_actions_secret: str | None = Header(default=None)):
        if not hmac.compare_digest((x_actions_secret or "").encode(), settings.actions_secret.encode()):
            return JSONResponse({"message": "Sai mã bí mật actions", "extensions": {"code": "unauthorized"}}, 401)
        try:
            payload = await request.json()
        except ValueError:
            payload = None
        if not isinstance(payload, dict):
            return JSONResponse({"message": "Payload không hợp lệ", "extensions": {"code": "bad-request"}}, 400)
        try:
            result = await run_in_threadpool(run_action, app.state.pool, name, payload, ctx)
        except ActionError as exc:
            return JSONResponse({"message": exc.message, "extensions": {"code": exc.code}}, exc.status)
        return result

    return app


app = create_app()
