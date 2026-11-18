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

import hmac
import json
import logging
import os
import pathlib
import time
import uuid
from contextlib import asynccontextmanager

import psycopg
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from psycopg_pool import ConnectionPool
from starlette.concurrency import run_in_threadpool

from bamboo_common.flowable import FlowableClient
from bamboo_common.ollama import Ollama
from bamboo_common.pii import PiiCipher

from . import (
    admin,
    ai_agent,
    anchoring,
    api_gateway,
    attachments,
    audit,
    auth,
    chat,
    config,
    documents,
    ext,
    forms,
    hr,
    hr_account,
    i18n,
    ic,
    ingest,
    iot,
    kb,
    lakehouse_query,
    ledger,
    lineage_sync,
    messaging,
    modules,
    mqtt_admin,
    obs,
    ocr,
    ocr_import,
    ops,
    ownership,
    pii_guard,
    process_automation,
    process_design,
    process_regulation,
    projects,
    receipts,
    search,
    semantic,
    setup,
    telemetry,
    trino,
    twin,
    work_calendar,
)
from .common import ActionError, Context, bind_session, require_read, session_identity
from .flow_sync import PROCESS_KEY, business_key
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
BPMN = pathlib.Path(__file__).resolve().parents[3] / "infra/platform/flowable/purchase_request.bpmn20.xml"
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
    **documents.HANDLERS,
    **ic.HANDLERS,
    **kb.HANDLERS,
    **ops.HANDLERS,
    **audit.HANDLERS,
    **twin.HANDLERS,
    **iot.HANDLERS,
    "check_pii": pii_guard.check_pii,
    **admin.HANDLERS,
    **lakehouse_query.HANDLERS,
    **semantic.HANDLERS,
    **ledger.HANDLERS,
    **process_design.HANDLERS,
    **process_regulation.HANDLERS,
    **process_automation.HANDLERS,
    **messaging.HANDLERS,
    **anchoring.HANDLERS,
    **obs.HANDLERS,
    **ai_agent.HANDLERS,
    **ocr.HANDLERS,
    **ocr_import.HANDLERS,
    **modules.HANDLERS,
    **setup.HANDLERS,
    **ownership.HANDLERS,
    **ext.HANDLERS,
    **api_gateway.HANDLERS,
    **lineage_sync.HANDLERS,
    **chat.HANDLERS,
    **work_calendar.HANDLERS,
    **projects.HANDLERS,
}


def run_action(pool: ConnectionPool, name: str, payload: dict, ctx: Context | None = None) -> dict:
    handler = HANDLERS.get(name)
    if handler is None:
        raise ActionError(f"Không có action {name}", "not-found", 404)
    session = {k.lower(): v for k, v in (payload.get("session_variables") or {}).items()}
    args = payload.get("input") or {}
    try:
        with pool.connection() as conn, conn.transaction():
            modules.require_action(conn, session, name)
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


def _channels(settings: config.Settings) -> tuple[str, ...]:
    """Các kênh thông báo ngoài ứng dụng đã được cấu hình trên máy chủ."""
    out = ["WEBHOOK"]
    if settings.smtp_host:
        out.append("EMAIL")
    if settings.sms_gateway_url:
        out.append("SMS")
    return tuple(out)


class PathCORS:
    """CORS chỉ cho một tiền tố đường dẫn; /ext tự trả CORS cho trang mô-đun chạy ở origin riêng (ADR #58)."""

    def __init__(self, app, prefix: str, **options):
        self.app = app
        self.prefix = prefix
        self.cors = CORSMiddleware(app, **options)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith(self.prefix):
            return await self.cors(scope, receive, send)
        return await self.app(scope, receive, send)


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
        require_clamav=settings.scan_require_clamav,
        search=search.Meili(settings.meili_url, settings.meili_search_key, timeout=5.0),
        search_index=settings.meili_index,
        gotenberg_url=settings.gotenberg_url,
        tika_url=settings.tika_url,
        pii=_pii_cipher(),
        users=_keycloak_users(settings),
        lakehouse=_lakehouse(settings),
        ai=Ollama(settings.ollama_url, timeout=10.0) if settings.ollama_url else None,
        ai_chat_model=settings.ai_chat_model,
        channels=_channels(settings),
        signer=receipts.Signer.from_env(settings.actions_secret),
        anchor_signer=receipts.Signer.from_env(settings.actions_secret, "anchor"),
        anchor_url=settings.anchor_url,
        sleeper_url=settings.sleeper_url,
        signature_trust_dir=settings.signature_trust_dir,
        signature_online=settings.signature_online,
        actions_secret=settings.actions_secret,
        mqtt=mqtt_admin.Dynsec(
            settings.mqtt_host,
            settings.mqtt_port,
            settings.mqtt_admin_password,
            tls_dir=settings.mqtt_tls_dir,
            tls_port=settings.mqtt_tls_port,
        )
        if settings.mqtt_host
        else None,
    )
    verifier = verifier or auth.KeycloakVerifier(
        settings.keycloak_jwks_url, settings.keycloak_issuer, set(settings.keycloak_clients)
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = pool or ConnectionPool(settings.database_url, min_size=1, max_size=10, open=True)
        pii_guard.warm_up()
        if settings.obs_enabled:
            obs.install("actions", settings.database_url)
        yield
        if pool is None:
            app.state.pool.close()

    app = FastAPI(title="Bamboo actions", lifespan=lifespan)
    telemetry.register_queue_collector(lambda: app.state.pool)
    memberships = auth.MembershipCache()
    app.state.verifier, app.state.memberships = verifier, memberships
    app.include_router(ingest.router)
    app.include_router(setup.router(lambda: app.state.pool, settings, ctx))
    app.include_router(ext.router(lambda: app.state.pool, settings))
    app.include_router(api_gateway.router(lambda: app.state.pool, run_action, lambda: ctx))
    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if origins:
        app.add_middleware(
            PathCORS,
            prefix="/setup/",
            allow_origins=origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.get("/metrics")
    def metrics():
        """Số liệu Prometheus (ADR #75); cổng API không định tuyến đường này nên chỉ mạng nội bộ hỏi được."""
        body, content_type = telemetry.metrics_body()
        return Response(body, media_type=content_type)

    @app.get("/modules/services")
    def module_services():
        """Container nào phải chạy, phải dừng theo mô-đun đã cài; sleeper hỏi định kỳ (chỉ mạng nội bộ, ADR #56)."""
        with app.state.pool.connection() as conn:
            return modules.desired_services(conn)

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
                try:
                    auth.record_login(conn, session, request.headers)
                except psycopg.Error as exc:
                    log.warning("không ghi nhận được thiết bị đăng nhập: %s", exc)
        except auth.AuthError as exc:
            return JSONResponse({"message": str(exc)}, 401)
        except psycopg.errors.InvalidTextRepresentation:
            return JSONResponse({"message": "Mã tenant không hợp lệ"}, 401)
        return JSONResponse(session)

    @app.middleware("http")
    async def trace(request: Request, call_next):
        """Gắn mã truy vết (X-Request-Id do cổng cấp) vào mọi log của yêu cầu và ghi tóm tắt mỗi yêu cầu."""
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        i18n.set_locale(request.query_params.get("lang"))
        obs.bind(trace_id=request_id[:100])
        started = time.perf_counter()
        trace_id = telemetry.tag_request(request_id[:100])
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id[:100]
        if trace_id:
            response.headers["X-Trace-Id"] = trace_id
        route = getattr(request.scope.get("route"), "path", None) or "unmatched"
        if route not in ("/healthz", "/metrics"):
            telemetry.observe_http(request.method, route, response.status_code, time.perf_counter() - started)
        if request.url.path != "/healthz":
            ms = round((time.perf_counter() - started) * 1000)
            level = (
                logging.ERROR
                if response.status_code >= 500
                else logging.WARNING
                if response.status_code >= 400
                else logging.INFO
            )
            log.log(
                level,
                "%s %s -> %s (%d ms)",
                request.method,
                request.url.path,
                response.status_code,
                ms,
                extra={"fields": {"status": response.status_code, "ms": ms}},
            )
        return response

    @app.post("/obs/ingest")
    async def obs_ingest(request: Request, x_actions_secret: str | None = Header(default=None)):
        if not hmac.compare_digest((x_actions_secret or "").encode(), settings.actions_secret.encode()):
            return JSONResponse({"message": "Sai mã bí mật actions"}, 401)
        try:
            body = await request.body()
            text = body.decode("utf-8", "replace").strip()
            events = (
                json.loads(text)
                if text.startswith("[")
                else [json.loads(line) for line in text.splitlines() if line.strip()]
            )
        except ValueError:
            return JSONResponse({"message": "Cần mảng JSON hoặc NDJSON"}, 400)

        def write() -> int:
            with app.state.pool.connection() as conn, conn.transaction():
                return obs.ingest(conn, events)

        return {"accepted": await run_in_threadpool(write)}

    @app.post("/hooks/{token}")
    async def automation_hook(token: str, request: Request):
        """Webhook khởi chạy quy trình tự động. Mã trong đường dẫn là bí mật; thân JSON (nếu có) thành biến quy trình."""
        if ctx.flowable is None:
            return JSONResponse({"message": "Chưa cấu hình Flowable"}, 503)
        raw = await request.body()
        if len(raw) > 65536:
            return JSONResponse({"message": "Thân yêu cầu quá lớn"}, 413)
        try:
            body = json.loads(raw) if raw.strip() else {}
        except ValueError:
            return JSONResponse({"message": "Thân yêu cầu phải là JSON"}, 400)
        if not isinstance(body, dict):
            return JSONResponse({"message": "Thân yêu cầu phải là đối tượng JSON"}, 400)
        try:
            return await run_in_threadpool(
                process_automation.start_from_webhook, app.state.pool, ctx.flowable, token, body
            )
        except ActionError as exc:
            return JSONResponse({"message": str(exc)}, exc.status)

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
        variables = {str(k).lower(): v for k, v in (payload.get("session_variables") or {}).items()}
        obs.bind(tenant=variables.get("x-hasura-tenant-id"), person=variables.get("x-hasura-user-id"))
        started = time.perf_counter()
        try:
            result = await run_in_threadpool(run_action, app.state.pool, name, payload, ctx)
        except ActionError as exc:
            telemetry.observe_action(name, "rejected", time.perf_counter() - started)
            log.warning(
                "action %s bị từ chối: %s",
                name,
                exc.message,
                extra={
                    "fields": {"action": name, "code": exc.code, "ms": round((time.perf_counter() - started) * 1000)}
                },
            )
            return JSONResponse({"message": exc.message, "extensions": {"code": exc.code}}, exc.status)
        except Exception:
            telemetry.observe_action(name, "error", time.perf_counter() - started)
            log.exception("action %s lỗi không lường trước", name, extra={"fields": {"action": name}})
            raise
        telemetry.observe_action(name, "ok", time.perf_counter() - started)
        log.info(
            "action %s", name, extra={"fields": {"action": name, "ms": round((time.perf_counter() - started) * 1000)}}
        )
        return result

    telemetry.setup_tracing(app, "bamboo-actions")
    return app


app = create_app()
