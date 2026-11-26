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

"""Mô-đun ngoài do bên thứ ba viết, nối qua cổng API (ADR #58).

- **Đăng ký** (Action `ext_register`, quản trị nền tảng hoặc chủ sở hữu máy chủ): manifest khai mã `x_…`, tên, URL dịch
  vụ, menu, mô-đun dựng sẵn cần có, phạm vi dữ liệu. Trả **khóa mô-đun** một lần; khóa = HMAC(ACTIONS_SECRET, mã + muối).
- **Giao diện**: Action `ext_launch` cấp phiên ký HMAC (người, công ty, mô-đun, hạn 8 giờ) nằm trong đường dẫn
  `/ext/<mã>/s/<phiên>/…`; cổng API chuyển tới đây, actions chuyển tiếp tới dịch vụ của mô-đun kèm định danh người dùng
  và chữ ký `X-Bamboo-Signature`. Phản hồi bị ép `Content-Security-Policy: sandbox` nên trang của mô-đun chạy ở origin
  riêng, không đọc được token, bộ nhớ hay cửa sổ của Bamboo dù cùng tên miền.
- **API cho mô-đun** `/ext-api/v1/*`: `Authorization: Bearer <khóa mô-đun>` + `X-Bamboo-Tenant`; chỉ công ty đã bật mô-đun,
  chỉ phạm vi đã khai lúc đăng ký (quản trị công ty thấy và đồng ý khi bật).
"""

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
import urllib.parse
from collections.abc import Callable

import httpx
import psycopg
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from . import config, modules
from .common import ActionError, Context

log = logging.getLogger("ext")

SESSION_TTL = 8 * 3600
SCOPES = {
    "org.read": "Đọc cơ cấu tổ chức (đơn vị, vị trí)",
    "people.read": "Đọc danh sách nhân sự (họ tên, mã nhân viên, vị trí)",
    "notify.send": "Gửi thông báo cho người trong công ty",
}
_CODE = re.compile(r"^x_[a-z0-9_]{2,30}$")
_PATH = re.compile(r"^/[A-Za-z0-9._~!$&'()*+,;=:@/%-]*$")
_REQUEST_HEADERS = ("accept", "accept-language", "content-type", "range", "if-none-match", "if-modified-since")
_RESPONSE_HEADERS = (
    "content-type",
    "content-length",
    "content-encoding",
    "cache-control",
    "etag",
    "last-modified",
    "content-disposition",
    "content-range",
    "accept-ranges",
)
SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-downloads allow-modals"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def module_key(secret: str, code: str, salt: bytes) -> str:
    return "bmk_" + _b64(
        hmac.new(secret.encode(), b"ext-module:" + code.encode() + b":" + salt, hashlib.sha256).digest()
    )


def _session_key(secret: str) -> bytes:
    return hmac.new(secret.encode(), b"ext-session", hashlib.sha256).digest()


def issue_session(secret: str, code: str, tenant: str, person: str, ttl: int = SESSION_TTL) -> str:
    body = _b64(
        json.dumps({"m": code, "t": tenant, "p": person, "e": int(time.time()) + ttl}, separators=(",", ":")).encode()
    )
    return f"{body}.{_b64(hmac.new(_session_key(secret), body.encode(), hashlib.sha256).digest()[:24])}"


def read_session(secret: str, token: str, code: str) -> dict | None:
    body, _, sig = token.partition(".")
    expected = _b64(hmac.new(_session_key(secret), body.encode(), hashlib.sha256).digest()[:24])
    if not sig or not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(_unb64(body))
    except ValueError:
        return None
    if data.get("m") != code or data.get("e", 0) < time.time():
        return None
    return data


def sign_request(key: str, ts: str, method: str, path: str, tenant: str, person: str) -> str:
    """Chữ ký mô-đun dùng để kiểm yêu cầu đúng là Bamboo chuyển tới (xem tài liệu viết mô-đun ngoài)."""
    message = "\n".join((ts, method.upper(), path, tenant, person)).encode()
    return hmac.new(key.encode(), message, hashlib.sha256).hexdigest()


def _text(data: dict, key: str, label: str, max_len: int, required: bool = True) -> str | None:
    value = str(data.get(key) or "").strip()
    if not value and required:
        raise ActionError(f"Manifest thiếu {key} ({label})")
    if len(value) > max_len:
        raise ActionError(f"{key} quá dài (tối đa {max_len} ký tự)")
    return value or None


def _path(value, key: str, default: str | None) -> str | None:
    if value in (None, ""):
        return default
    if not isinstance(value, str) or not _PATH.match(value) or ".." in value:
        raise ActionError(f"{key} phải là đường dẫn bắt đầu bằng /")
    return value


def parse_manifest(data) -> dict:
    if not isinstance(data, dict):
        raise ActionError("Manifest phải là đối tượng JSON")
    code = str(data.get("code") or "").strip()
    if not _CODE.match(code):
        raise ActionError("code bắt đầu bằng x_, chữ thường không dấu, số, gạch dưới; 4-32 ký tự (ví dụ x_kho_vat_tu)")
    base_url = str(data.get("base_url") or "").strip().rstrip("/")
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.query or parsed.fragment:
        raise ActionError("base_url phải là địa chỉ http(s) của dịch vụ mô-đun, ví dụ http://kho-vat-tu:8080")
    depends = data.get("depends") or []
    if not isinstance(depends, list) or any(d not in modules.BY_CODE for d in depends):
        raise ActionError(f"depends chỉ gồm mô-đun dựng sẵn: {', '.join(modules.BY_CODE)}")
    scopes = data.get("scopes") or []
    if not isinstance(scopes, list) or any(sc not in SCOPES for sc in scopes):
        raise ActionError(f"scopes chỉ gồm: {', '.join(SCOPES)}")
    menu = data.get("menu") or [{"label": data.get("name"), "path": "/"}]
    if not isinstance(menu, list) or not 1 <= len(menu) <= 8:
        raise ActionError("menu là danh sách 1-8 mục {label, path}")
    items = []
    for item in menu:
        if not isinstance(item, dict):
            raise ActionError("Mỗi mục menu là {label, path}")
        items.append(
            {"label": _text(item, "label", "nhãn menu", 40), "path": _path(item.get("path"), "menu.path", "/")}
        )
    return {
        "code": code,
        "name": _text(data, "name", "tên mô-đun", 80),
        "description": _text(data, "description", "mô tả", 500, required=False) or "",
        "vendor": _text(data, "vendor", "nhà phát triển", 120, required=False),
        "version": _text(data, "version", "phiên bản", 40, required=False),
        "base_url": base_url,
        "entry_path": _path(data.get("entry_path"), "entry_path", "/"),
        "health_path": _path(data.get("health_path"), "health_path", None),
        "depends": sorted(set(depends)),
        "scopes": sorted(set(scopes)),
        "menu": items,
    }


def _reachable(m: dict) -> tuple[bool, str]:
    url = m["base_url"] + (m["health_path"] or m["entry_path"])
    try:
        resp = httpx.get(url, timeout=3.0, follow_redirects=False)
    except httpx.HTTPError as exc:
        return False, f"Chưa gọi được {url}: {exc}"
    return resp.status_code < 500, f"{url} trả {resp.status_code}"


def _platform(conn: psycopg.Connection, session: dict, ctx: Context) -> modules.Manager:
    manager = modules.Manager(conn, session, ctx)
    manager.require_platform()
    return manager


def ext_register(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    manager = _platform(conn, session, ctx)
    m = parse_manifest(args.get("manifest"))
    manager.lock()
    old = conn.execute("SELECT scopes FROM core.external_module WHERE module = %s", (m["code"],)).fetchone()
    exists = old is not None
    salt = secrets.token_bytes(16)
    key = module_key(ctx.actions_secret, m["code"], salt)
    values = (
        m["name"],
        m["description"],
        m["vendor"],
        m["version"],
        m["base_url"],
        m["entry_path"],
        m["health_path"],
        m["depends"],
        m["scopes"],
        Jsonb(m["menu"]),
    )
    notes = []
    if exists:
        conn.execute(
            """UPDATE core.external_module SET name = %s, description = %s, vendor = %s, version = %s, base_url = %s,
                      entry_path = %s, health_path = %s, depends = %s, scopes = %s, menu = %s WHERE module = %s""",
            (*values, m["code"]),
        )
        key = None
        if set(m["scopes"]) - set(old[0]):
            off = conn.execute("DELETE FROM core.tenant_module WHERE module = %s", (m["code"],)).rowcount
            if off:
                notes.append(f"Mô-đun xin thêm phạm vi dữ liệu nên đã tắt ở {off} công ty; quản trị công ty bật lại")
    else:
        conn.execute(
            "INSERT INTO core.module_install (module, installed_by) VALUES (%s, %s)",
            (m["code"], f"person:{manager.person}"),
        )
        conn.execute(
            """INSERT INTO core.external_module (name, description, vendor, version, base_url, entry_path,
                                                 health_path, depends, scopes, menu, module, key_salt, key_sha256,
                                                 registered_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (*values, m["code"], salt, hashlib.sha256(key.encode()).digest(), f"person:{manager.person}"),
        )
    for dep in m["depends"]:
        if dep not in modules.installed_modules(conn):
            manager.install(dep)
    for dep in m["depends"]:
        enabled = conn.execute("SELECT tenant_id FROM core.tenant_module WHERE module = %s", (m["code"],)).fetchall()
        for (tenant,) in enabled:
            conn.execute(
                "INSERT INTO core.tenant_module (tenant_id, module) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (tenant, dep),
            )
    reachable, message = _reachable(m)
    log.info("đăng ký mô-đun ngoài %s (%s)", m["code"], message)
    return {
        "code": m["code"],
        "api_key": key,
        "reachable": reachable,
        "message": "; ".join([message, *notes]),
        "updated": exists,
    }


def ext_rotate_key(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    _platform(conn, session, ctx)
    code = args["code"]
    salt = secrets.token_bytes(16)
    key = module_key(ctx.actions_secret, code, salt)
    row = conn.execute(
        """UPDATE core.external_module SET key_salt = %s, key_sha256 = %s WHERE module = %s
           RETURNING base_url, entry_path, health_path""",
        (salt, hashlib.sha256(key.encode()).digest(), code),
    ).fetchone()
    if row is None:
        raise ActionError(f"Không có mô-đun ngoài {code}", "not-found", 404)
    return {
        "code": code,
        "api_key": key,
        "reachable": True,
        "message": "Đã đổi khóa; khóa cũ hết hiệu lực",
        "updated": True,
    }


def ext_launch(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = session.get("x-hasura-user-id"), session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    code = args["code"]
    row = conn.execute(
        """SELECT e.entry_path, e.name FROM core.external_module e
           JOIN core.tenant_module tm ON tm.module = e.module AND tm.tenant_id = %s WHERE e.module = %s""",
        (tenant, code),
    ).fetchone()
    if row is None:
        raise ActionError("Mô-đun chưa được bật cho công ty", "module-disabled", 403)
    path = _path(args.get("path"), "path", None) or row[0]
    token = issue_session(ctx.actions_secret, code, tenant, person)
    return {"path": f"{code}/s/{token}{path}", "name": row[1]}


HANDLERS = {
    "ext_register": ext_register,
    "ext_rotate_key": ext_rotate_key,
    "ext_launch": ext_launch,
}


def _target(conn: psycopg.Connection, code: str, tenant: str, person: str, secret: str) -> dict | None:
    row = conn.execute(
        """SELECT e.base_url, e.key_salt, p.full_name
           FROM core.external_module e
           JOIN core.tenant_module tm ON tm.module = e.module AND tm.tenant_id = %s
           JOIN core.person p ON p.id = %s AND p.tenant_id = tm.tenant_id
           WHERE e.module = %s""",
        (tenant, person, code),
    ).fetchone()
    if row is None:
        return None
    return {"base_url": row[0], "key": module_key(secret, code, bytes(row[1])), "person_name": row[2]}


def _cors(headers: dict) -> dict:
    return headers | {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Disposition"}


def _security(headers: dict, web_origin: str = "") -> dict:
    ancestors = " ".join(["'self'", *([web_origin] if web_origin else [])])
    return _cors(headers) | {
        "Content-Security-Policy": f"{SANDBOX}; frame-ancestors {ancestors}",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
    }


def router(pool_of: Callable[[], ConnectionPool], settings: config.Settings) -> APIRouter:
    api = APIRouter()
    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0), follow_redirects=False)
    secret = settings.actions_secret
    origin = settings.web_origin.rstrip("/")

    def secure(headers: dict) -> dict:
        return _security(headers, origin)

    @api.api_route(
        "/ext/{code}/s/{token}/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    )
    async def proxy(code: str, token: str, path: str, request: Request):
        if request.method == "OPTIONS":
            return Response(
                status_code=204,
                headers=_cors(
                    {
                        "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE",
                        "Access-Control-Allow-Headers": "Content-Type, Accept",
                        "Access-Control-Max-Age": "600",
                    }
                ),
            )
        session = read_session(secret, token, code)
        if session is None:
            return JSONResponse({"message": "Phiên mô-đun hết hạn; mở lại từ menu Bamboo"}, 403, headers=secure({}))

        def lookup():
            with pool_of().connection() as conn:
                return _target(conn, code, session["t"], session["p"], secret)

        target = await run_in_threadpool(lookup)
        if target is None:
            return JSONResponse({"message": "Mô-đun chưa được bật cho công ty"}, 403, headers=secure({}))
        upstream_path = "/" + path + (f"?{request.url.query}" if request.url.query else "")
        ts = str(int(time.time()))
        headers = {k: v for k in _REQUEST_HEADERS if (v := request.headers.get(k))}
        headers |= {
            "X-Bamboo-Module": code,
            "X-Bamboo-Tenant": session["t"],
            "X-Bamboo-Person": session["p"],
            "X-Bamboo-Person-Name": urllib.parse.quote(target["person_name"]),
            "X-Bamboo-Timestamp": ts,
            "X-Bamboo-Signature": sign_request(
                target["key"], ts, request.method, upstream_path, session["t"], session["p"]
            ),
            "X-Bamboo-Base": f"/ext/{code}/s/{token}",
        }
        body = await request.body()
        upstream = client.build_request(
            request.method, target["base_url"] + upstream_path, headers=headers, content=body or None
        )
        try:
            resp = await client.send(upstream, stream=True)
        except httpx.HTTPError as exc:
            log.warning("mô-đun %s không trả lời: %s", code, exc)
            return JSONResponse({"message": "Mô-đun tạm thời không truy cập được"}, 502, headers=secure({}))
        out = {k: v for k in _RESPONSE_HEADERS if (v := resp.headers.get(k))}
        location = resp.headers.get("location")
        if location and location.startswith("/") and not location.startswith("//"):
            out["Location"] = f"/ext/{code}/s/{token}{location}"
        elif location:
            out["Location"] = location
        return StreamingResponse(
            resp.aiter_raw(), status_code=resp.status_code, headers=secure(out), background=BackgroundTask(resp.aclose)
        )

    def _caller(conn: psycopg.Connection, request: Request, scope: str) -> tuple[str, str]:
        header = request.headers.get("authorization", "")
        tenant = request.headers.get("x-bamboo-tenant", "")
        if not header.lower().startswith("bearer ") or not tenant:
            raise ActionError("Cần Authorization: Bearer <khóa mô-đun> và X-Bamboo-Tenant", "unauthorized", 401)
        digest = hashlib.sha256(header[7:].strip().encode()).digest()
        try:
            row = conn.execute(
                """SELECT e.module, e.scopes, tm.tenant_id IS NOT NULL
                   FROM core.external_module e
                   LEFT JOIN core.tenant_module tm ON tm.module = e.module AND tm.tenant_id = %s::uuid
                   WHERE e.key_sha256 = %s""",
                (tenant, digest),
            ).fetchone()
        except psycopg.errors.InvalidTextRepresentation as exc:
            raise ActionError("X-Bamboo-Tenant không hợp lệ", "bad-request") from exc
        if row is None:
            raise ActionError("Khóa mô-đun không đúng", "unauthorized", 401)
        code, scopes, enabled = row
        if not enabled:
            raise ActionError("Công ty chưa bật mô-đun này", "module-disabled", 403)
        if scope not in scopes:
            raise ActionError(f"Mô-đun chưa khai phạm vi {scope}", "forbidden", 403)
        return code, tenant

    async def _run(request: Request, scope: str, work):
        def job():
            with pool_of().connection() as conn, conn.transaction():
                code, tenant = _caller(conn, request, scope)
                return work(conn, code, tenant)

        try:
            return await run_in_threadpool(job)
        except ActionError as exc:
            return JSONResponse({"message": exc.message, "code": exc.code}, exc.status)

    @api.get("/ext-api/v1/org-units")
    async def org_units(request: Request):
        return await _run(
            request,
            "org.read",
            lambda conn, _code, tenant: [
                dict(
                    zip(
                        ("id", "code", "name", "parent_id", "type"),
                        (str(r[0]), r[1], r[2], r[3] and str(r[3]), r[4]),
                        strict=True,
                    )
                )
                for r in conn.execute(
                    """SELECT u.id, u.code, u.name, u.parent_id, c.name FROM core.org_unit u
                       LEFT JOIN core.catalog_item c ON c.id = u.unit_type_id
                       WHERE u.tenant_id = %s AND u.valid_period @> now() ORDER BY u.path""",
                    (tenant,),
                )
            ],
        )

    @api.get("/ext-api/v1/people")
    async def people(request: Request, q: str = ""):
        def work(conn, _code, tenant):
            rows = conn.execute(
                """SELECT p.id, p.full_name, p.employee_code, pos.name, pos.org_unit_id
                   FROM core.person p
                   LEFT JOIN LATERAL (SELECT po.name, po.org_unit_id FROM core.assignment a
                                      JOIN core.position po ON po.id = a.position_id
                                      WHERE a.person_id = p.id AND a.valid_period @> now()
                                      ORDER BY a.assignment_type = 'PRIMARY' DESC LIMIT 1) pos ON true
                   WHERE p.tenant_id = %s AND (%s = '' OR p.full_name ILIKE '%%' || %s || '%%')
                   ORDER BY p.full_name LIMIT 500""",
                (tenant, q, q),
            )
            keys = ("id", "full_name", "employee_code", "position", "org_unit_id")
            return [dict(zip(keys, (str(r[0]), r[1], r[2], r[3], r[4] and str(r[4])), strict=True)) for r in rows]

        return await _run(request, "people.read", work)

    @api.post("/ext-api/v1/notifications")
    async def notify(request: Request):
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict) or not body.get("person_id") or not str(body.get("title") or "").strip():
            return JSONResponse({"message": "Cần person_id và title"}, 400)

        def work(conn, code, tenant):
            name = conn.execute("SELECT name FROM core.external_module WHERE module = %s", (code,)).fetchone()[0]
            try:
                found = conn.execute(
                    "SELECT 1 FROM core.person WHERE tenant_id = %s AND id = %s::uuid", (tenant, str(body["person_id"]))
                ).fetchone()
            except psycopg.errors.InvalidTextRepresentation as exc:
                raise ActionError("person_id không hợp lệ") from exc
            if found is None:
                raise ActionError("Không có người này trong công ty", "not-found", 404)
            conn.execute(
                "SELECT collab.notify(%s, %s, 'EXTERNAL', %s, NULL, %s, %s)",
                (
                    tenant,
                    str(body["person_id"]),
                    code,
                    f"[{name}] {str(body['title'])[:200]}",
                    str(body.get("body") or "")[:2000] or None,
                ),
            )
            return {"ok": True}

        return await _run(request, "notify.send", work)

    return api
