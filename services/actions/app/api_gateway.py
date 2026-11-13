# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

"""Cổng dịch vụ API cho hệ thống bên ngoài (ADR #64).

- **Khóa API của công ty** (`api.api_key`): quản trị viên công ty tạo, chọn phạm vi, hạn dùng (tối đa 1 năm), dải IP được
  gọi; khóa `bak_…` hiện đúng một lần, máy chủ chỉ giữ SHA-256. Khóa gọi **thay mặt người tạo**: mọi kiểm quyền của Action
  vẫn chạy theo người đó, nên người tạo mất quyền hay nghỉ việc thì khóa cũng hết tác dụng. Thu hồi có hiệu lực ngay.
- **REST `/api/v1/*`** qua cổng API: mỗi endpoint gọi đúng một Action có sẵn (`run_action`) với phiên của người tạo khóa,
  nên chặn theo mô-đun, row filter Lakehouse, che dữ liệu cá nhân giữ nguyên. `GET /api/v1/openapi.json` mô tả đủ.
- **Đếm lượt gọi** theo khóa và ngày (`api.usage`), lần dùng cuối và IP cuối; cổng API giới hạn tần suất theo từng khóa.
"""

import base64
import datetime as dt
import hashlib
import ipaddress
import logging
import re
import secrets
from collections.abc import Callable
from dataclasses import dataclass

import psycopg
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from starlette.concurrency import run_in_threadpool

from .common import ActionError, Context

log = logging.getLogger("api_gateway")

KEY_PREFIX = "bak_"
MAX_DAYS = 365
MAX_KEYS = 50
MAX_IPS = 20
_NAME = re.compile(r"^[\w .:()/-]{1,80}$", re.UNICODE)

SCOPES = {
    "metrics.read": "Danh mục và truy vấn chỉ số của lớp ngữ nghĩa",
    "datasets.read": "Danh mục và xem trước tập dữ liệu Lakehouse",
    "kpi.read": "Số liệu KPI đã đóng băng",
    "ops.read": "Số liệu Trung tâm điều hành",
    "lineage.read": "Phả hệ và chất lượng dữ liệu",
    "search.read": "Tìm kiếm toàn văn chứng từ và tệp",
    "org.read": "Cơ cấu tổ chức (đơn vị)",
    "iot.read": "Thực thể bản sao số dạng NGSI-LD và giá trị đo mới nhất",
    "iot.write": "Gửi số đo thiết bị dạng NGSI-LD (người tạo khóa cần quyền iot.ingest)",
}


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str
    scope: str
    action: str | None
    summary: str
    params: tuple[tuple[str, str, str], ...] = ()
    body: bool = False


ENDPOINTS = (
    Endpoint("GET", "/api/v1/metrics", "metrics.read", "semantic_catalog", "Danh mục nguồn, chỉ số, chiều, chu kỳ"),
    Endpoint(
        "POST",
        "/api/v1/metrics/query",
        "metrics.read",
        "semantic_query",
        "Truy vấn chỉ số theo chiều; thân JSON như Action semantic_query",
        (
            ("metrics", "string[]", "Tên chỉ số cùng nguồn (tối đa 4)"),
            ("dimensions", "string[]", "Tối đa 3 chiều"),
            ("time_grain", "string", "day | week | month"),
            ("from", "string", "YYYY-MM-DD"),
            ("to", "string", "YYYY-MM-DD"),
            ("filters", "object[]", "[{dimension, values}]"),
            ("limit", "integer", "Tối đa 1000 dòng"),
        ),
        body=True,
    ),
    Endpoint("GET", "/api/v1/datasets", "datasets.read", "lakehouse_datasets", "Tập dữ liệu tầng silver và cột"),
    Endpoint(
        "GET",
        "/api/v1/datasets/{dataset}",
        "datasets.read",
        "lakehouse_preview",
        "Số dòng và 20 dòng thay đổi gần nhất (đã che dữ liệu cá nhân)",
        (("dataset", "string", "Tên tập dữ liệu, ví dụ proc_purchase_request"),),
    ),
    Endpoint(
        "GET",
        "/api/v1/kpi/{kpi_key}",
        "kpi.read",
        "kpi_snapshots",
        "Các kỳ đã đóng băng của một KPI, mới nhất trước",
        (("kpi_key", "string", "Mã KPI"), ("limit", "integer", "Tối đa 500")),
    ),
    Endpoint(
        "GET",
        "/api/v1/ops/{tab}",
        "ops.read",
        "ops_dashboard",
        "Số liệu một tab Trung tâm điều hành",
        (("tab", "string", "process | production | hospital | quality | sites"), ("days", "integer", "Số ngày")),
    ),
    Endpoint(
        "GET", "/api/v1/lineage", "lineage.read", "lineage_graph", "Phả hệ dữ liệu, kiểm tra chất lượng, lần chạy"
    ),
    Endpoint(
        "GET",
        "/api/v1/search",
        "search.read",
        "search_documents",
        "Tìm kiếm toàn văn trong chứng từ và tệp người tạo khóa được xem",
        (("query", "string", "Từ khóa"), ("kind", "string", "purchase_request | attachment"), ("limit", "integer", "")),
    ),
    Endpoint("GET", "/api/v1/org-units", "org.read", None, "Đơn vị tổ chức đang hiệu lực"),
    Endpoint(
        "GET",
        "/api/v1/ngsi-ld/v1/entities",
        "iot.read",
        "iot_entities",
        "Thực thể bản sao số (NGSI-LD dạng chuẩn)",
        (("type", "string", "Loại thực thể, ví dụ CleanRoom"), ("limit", "integer", "Tối đa 500")),
    ),
    Endpoint(
        "GET",
        "/api/v1/ngsi-ld/v1/entities/{entity_id}",
        "iot.read",
        "iot_entities",
        "Một thực thể theo URN hoặc mã thiết bị",
        (("entity_id", "string", "URN NGSI-LD hoặc mã thiết bị"),),
    ),
    Endpoint(
        "POST",
        "/api/v1/ngsi-ld/v1/entities/{entity_id}/attrs",
        "iot.write",
        "iot_ingest",
        "Gửi số đo: thân NGSI-LD {thuộc tính: {type: Property, value, observedAt}} hoặc {thuộc tính: số, observedAt}",
        (("entity_id", "string", "URN NGSI-LD hoặc mã thiết bị"),),
        body=True,
    ),
)


def _session(row) -> dict:
    return {
        "x-hasura-role": "user",
        "x-hasura-user-id": str(row["created_by"]),
        "x-hasura-tenant-id": str(row["tenant_id"]),
    }


def new_key() -> str:
    return KEY_PREFIX + base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()


def digest(key: str) -> bytes:
    return hashlib.sha256(key.encode()).digest()


def _identity(session: dict) -> tuple[str, str]:
    person, tenant = session.get("x-hasura-user-id"), session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    return person, tenant


def _require_admin(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    person, tenant = _identity(session)
    if not conn.execute(
        "SELECT EXISTS (SELECT 1 FROM core.v_admin WHERE tenant_id = %s AND person_id = %s)", (tenant, person)
    ).fetchone()[0]:
        raise ActionError("Chỉ quản trị viên công ty quản lý khóa API", "forbidden", 403)
    return person, tenant


def parse_ips(values) -> list[str]:
    out = []
    for v in list(values or [])[: MAX_IPS + 1]:
        try:
            out.append(str(ipaddress.ip_network(str(v).strip(), strict=False)))
        except ValueError as exc:
            raise ActionError(f"Địa chỉ IP hoặc dải CIDR không hợp lệ: {v}", "bad-request") from exc
    if len(out) > MAX_IPS:
        raise ActionError(f"Tối đa {MAX_IPS} dải IP")
    return out


def api_key_create(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _require_admin(conn, session)
    name = " ".join(str(args.get("name") or "").split())
    if not _NAME.match(name):
        raise ActionError("Tên khóa 1–80 ký tự (chữ, số, khoảng trắng, . : ( ) / -)", "bad-request")
    scopes = sorted(set(args.get("scopes") or []))
    unknown = [s for s in scopes if s not in SCOPES]
    if not scopes or unknown:
        raise ActionError(f"Phạm vi không hợp lệ: {', '.join(unknown) or 'chưa chọn'}", "bad-request")
    days = int(args.get("expires_days") or 90)
    if not 1 <= days <= MAX_DAYS:
        raise ActionError(f"Hạn dùng từ 1 đến {MAX_DAYS} ngày", "bad-request")
    ips = parse_ips(args.get("allowed_ips"))
    active = conn.execute(
        "SELECT count(*) FROM api.api_key WHERE tenant_id = %s AND revoked_at IS NULL AND expires_at > now()",
        (tenant,),
    ).fetchone()[0]
    if active >= MAX_KEYS:
        raise ActionError(f"Công ty đã có {MAX_KEYS} khóa còn hiệu lực; thu hồi khóa không dùng trước", "rejected")
    key = new_key()
    row = conn.execute(
        """INSERT INTO api.api_key (tenant_id, name, prefix, key_sha256, scopes, allowed_ips, created_by, expires_at)
           VALUES (%s, %s, %s, %s, %s, %s::cidr[], %s, now() + make_interval(days => %s))
           RETURNING id, prefix, expires_at""",
        (tenant, name, key[:10], digest(key), scopes, ips, person, days),
    ).fetchone()
    return {"id": str(row[0]), "key": key, "prefix": row[1], "expires_at": row[2].isoformat()}


def api_key_revoke(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _require_admin(conn, session)
    row = conn.execute(
        """UPDATE api.api_key SET revoked_at = now(), revoked_by = %s
           WHERE id = %s AND tenant_id = %s AND revoked_at IS NULL RETURNING id""",
        (person, args.get("id"), tenant),
    ).fetchone()
    if row is None:
        raise ActionError("Không tìm thấy khóa còn hiệu lực", "not-found", 404)
    return {"id": str(row[0]), "revoked": True}


def api_catalog(_conn: psycopg.Connection, _session: dict, _args: dict, _ctx: Context) -> dict:
    return {
        "scopes": [{"name": k, "label": v} for k, v in SCOPES.items()],
        "endpoints": [
            {
                "method": e.method,
                "path": e.path,
                "scope": e.scope,
                "summary": e.summary,
                "params": [{"name": n, "type": t, "description": d} for n, t, d in e.params],
                "body": e.body,
            }
            for e in ENDPOINTS
        ],
    }


def openapi() -> dict:
    """Mô tả OpenAPI 3.1 sinh từ ENDPOINTS: cùng một nguồn với trang Cổng dịch vụ API."""
    paths: dict = {}
    for e in ENDPOINTS:
        path_params = set(re.findall(r"{(\w+)}", e.path))
        op = {
            "summary": e.summary,
            "security": [{"apiKey": [e.scope]}],
            "tags": [e.scope.split(".")[0]],
            "responses": {
                "200": {"description": "Thành công", "content": {"application/json": {}}},
                "401": {"description": "Thiếu khóa, khóa sai, hết hạn hoặc đã thu hồi"},
                "403": {
                    "description": "Khóa không có phạm vi này, IP không được phép hoặc người tạo khóa không có quyền"
                },
                "429": {"description": "Vượt giới hạn tần suất của khóa"},
            },
        }
        params = [
            {
                "name": n,
                "in": "path" if n in path_params else "query",
                "required": n in path_params,
                "description": d,
                "schema": {"type": "integer" if t == "integer" else "string"},
            }
            for n, t, d in e.params
            if not e.body or n in path_params
        ]
        if params:
            op["parameters"] = params
        if e.body:
            op["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                n: {"type": "array", "items": {"type": "string" if t == "string[]" else "object"}}
                                if t.endswith("[]")
                                else {"type": t}
                                for n, t, _ in e.params
                            },
                        }
                    }
                },
            }
        paths.setdefault(e.path, {})[e.method.lower()] = op
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "Bamboo API",
            "version": "1",
            "description": "Gọi thay mặt người tạo khóa, trong phạm vi khóa.",
        },
        "servers": [{"url": "/"}],
        "components": {
            "securitySchemes": {
                "apiKey": {"type": "http", "scheme": "bearer", "description": "Authorization: Bearer bak_…"}
            }
        },
        "paths": paths,
    }


def client_ip(request: Request) -> str:
    """IP của bên gọi: cổng API nối địa chỉ nó thấy vào cuối X-Forwarded-For (actions không mở ra ngoài)."""
    forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    return forwarded[-1] if forwarded else (request.client.host if request.client else "")


def authorize(conn: psycopg.Connection, header: str, ip: str, scope: str) -> dict:
    if not header.lower().startswith("bearer ") or not header[7:].strip().startswith(KEY_PREFIX):
        raise ActionError("Cần Authorization: Bearer bak_…", "unauthorized", 401)
    row = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT id, tenant_id, created_by, scopes, allowed_ips, revoked_at, expires_at
           FROM api.api_key WHERE key_sha256 = %s""",
            (digest(header[7:].strip()),),
        )
        .fetchone()
    )
    if row is None or row["revoked_at"] is not None or row["expires_at"] <= dt.datetime.now(dt.UTC):
        raise ActionError("Khóa API không đúng, đã hết hạn hoặc đã bị thu hồi", "unauthorized", 401)
    if row["allowed_ips"]:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            addr = None
        if addr is None or not any(addr in ipaddress.ip_network(str(n)) for n in row["allowed_ips"]):
            raise ActionError("Địa chỉ IP không được phép dùng khóa này", "forbidden", 403)
    if scope not in row["scopes"]:
        raise ActionError(f"Khóa không có phạm vi {scope}", "forbidden", 403)
    return row


def record_use(conn: psycopg.Connection, key_id, ip: str, failed: bool) -> None:
    """Một câu lệnh mỗi lượt gọi, chỉ vào dòng đếm theo ngày (ADR #67): không sửa api.api_key nên không sinh nhật ký
    kiểm toán và không xếp hàng trên khóa đầu chuỗi hash của công ty."""
    conn.execute(
        """INSERT INTO api.usage (key_id, day, calls, errors, last_used_at, last_ip)
           VALUES (%s, current_date, 1, %s, now(), %s::inet)
           ON CONFLICT (key_id, day) DO UPDATE SET calls = api.usage.calls + 1, errors = api.usage.errors + EXCLUDED.errors,
               last_used_at = EXCLUDED.last_used_at, last_ip = EXCLUDED.last_ip""",
        (key_id, int(failed), ip or None),
    )


def org_units(conn: psycopg.Connection, session: dict) -> list[dict]:
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT u.id, u.code, u.name, u.parent_id, t.name AS type
           FROM core.org_unit u LEFT JOIN core.catalog_item t ON t.tenant_id = u.tenant_id AND t.id = u.unit_type_id
           WHERE u.tenant_id = %s AND u.valid_period @> now() ORDER BY u.path""",
            (session["x-hasura-tenant-id"],),
        )
        .fetchall()
    )
    return [{**r, "id": str(r["id"]), "parent_id": str(r["parent_id"]) if r["parent_id"] else None} for r in rows]


def router(
    pool_of: Callable[[], ConnectionPool], run_action: Callable[..., object], ctx_of: Callable[[], Context]
) -> APIRouter:
    api = APIRouter()

    async def call(request: Request, endpoint: Endpoint, args: dict):
        ip = client_ip(request)
        header = request.headers.get("authorization", "")

        def job():
            with pool_of().connection() as conn:
                with conn.transaction():
                    key = authorize(conn, header, ip, endpoint.scope)
                failed = True
                try:
                    session = _session(key)
                    if endpoint.action is None:
                        with conn.transaction():
                            result = org_units(conn, session)
                    else:
                        result = run_action(
                            pool_of(), endpoint.action, {"session_variables": session, "input": args}, ctx_of()
                        )
                    failed = False
                    return result
                finally:
                    with conn.transaction():
                        record_use(conn, key["id"], ip, failed)

        try:
            return await run_in_threadpool(job)
        except ActionError as exc:
            return JSONResponse({"message": exc.message, "code": exc.code}, exc.status)

    @api.get("/api/v1/openapi.json")
    async def spec():
        return openapi()

    by_path = {(e.method, e.path): e for e in ENDPOINTS}

    @api.get("/api/v1/metrics")
    async def metrics(request: Request):
        return await call(request, by_path[("GET", "/api/v1/metrics")], {})

    @api.post("/api/v1/metrics/query")
    async def metrics_query(request: Request):
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"message": "Thân yêu cầu phải là JSON object", "code": "bad-request"}, 400)
        allowed = {n for n, _, _ in by_path[("POST", "/api/v1/metrics/query")].params}
        return await call(
            request, by_path[("POST", "/api/v1/metrics/query")], {k: v for k, v in body.items() if k in allowed}
        )

    @api.get("/api/v1/datasets")
    async def datasets(request: Request):
        return await call(request, by_path[("GET", "/api/v1/datasets")], {})

    @api.get("/api/v1/datasets/{dataset}")
    async def dataset(request: Request, dataset: str):
        return await call(request, by_path[("GET", "/api/v1/datasets/{dataset}")], {"dataset": dataset})

    @api.get("/api/v1/kpi/{kpi_key}")
    async def kpi(request: Request, kpi_key: str, limit: int = 60):
        return await call(request, by_path[("GET", "/api/v1/kpi/{kpi_key}")], {"kpi_key": kpi_key, "limit": limit})

    ngsi = "/api/v1/ngsi-ld/v1/entities"

    @api.get(ngsi)
    async def ngsi_entities(request: Request, type: str | None = None, limit: int = 100):  # noqa: A002
        out = await call(request, by_path[("GET", ngsi)], {"type": type, "limit": limit})
        return out["entities"] if isinstance(out, dict) else out

    @api.get(ngsi + "/{entity_id}")
    async def ngsi_entity(request: Request, entity_id: str):
        out = await call(request, by_path[("GET", ngsi + "/{entity_id}")], {"id": entity_id})
        return out["entities"][0] if isinstance(out, dict) else out

    @api.post(ngsi + "/{entity_id}/attrs")
    async def ngsi_attrs(request: Request, entity_id: str):
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"message": "Thân yêu cầu phải là JSON object", "code": "bad-request"}, 400)
        out = await call(request, by_path[("POST", ngsi + "/{entity_id}/attrs")], {"entity": entity_id, "attrs": body})
        return out

    @api.get("/api/v1/ops/{tab}")
    async def ops(request: Request, tab: str, days: int = 30):
        return await call(request, by_path[("GET", "/api/v1/ops/{tab}")], {"tab": tab, "days": days})

    @api.get("/api/v1/lineage")
    async def lineage(request: Request):
        return await call(request, by_path[("GET", "/api/v1/lineage")], {})

    @api.get("/api/v1/search")
    async def search(request: Request, query: str = "", kind: str | None = None, limit: int = 20):
        return await call(request, by_path[("GET", "/api/v1/search")], {"query": query, "kind": kind, "limit": limit})

    @api.get("/api/v1/org-units")
    async def org(request: Request):
        return await call(request, by_path[("GET", "/api/v1/org-units")], {})

    return api


HANDLERS = {"api_key_create": api_key_create, "api_key_revoke": api_key_revoke, "api_catalog": api_catalog}
