# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Khởi tạo công ty lần đầu trên máy chủ tự cài và xác thực pháp lý bằng chữ ký số (ADR #57).

Luồng khởi tạo (công khai qua cổng API `/setup/*`, chỉ mở khi hệ thống chưa có công ty nào):
1. Người cài đặt nhập **mã thiết lập** (in ra log `bootstrap`, hoặc `python -m app.setup_code`) cùng thông tin doanh nghiệp,
   người đại diện theo pháp luật và tài khoản; hệ thống sinh **đơn đăng ký PDF** mang mã đơn chống dùng lại.
2. Người đại diện ký số đơn bằng chữ ký số của doanh nghiệp rồi tải lên; đơn hợp lệ thì công ty được tạo ở trạng thái
   VERIFIED. Máy chủ không có Internet hoặc chưa có chữ ký số thì (nếu SETUP_ALLOW_UNVERIFIED) tạo ở trạng thái UNVERIFIED
   và ký bổ sung sau từ bên trong (Action `legal_application`, `legal_verify`).
3. Người đại diện là **chủ sở hữu**: giữ ghế Giám đốc, là người duy nhất trao/thu hồi quyền quản trị (migration 043).
   Tài khoản chủ sở hữu và quản trị viên phải đổi mật khẩu và cài OTP ở lần đăng nhập đầu.
"""

import base64
import datetime as dt
import hashlib
import hmac
import logging
import re
import secrets
import unicodedata
import uuid
from collections.abc import Callable

import psycopg
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from starlette.concurrency import run_in_threadpool

from . import config, forms, legal_sign
from .common import ActionError, Context
from .hr_account import AccountConflict, KeycloakUsers, temporary_password

log = logging.getLogger("setup")

CODE_TTL = dt.timedelta(hours=24)
APPLICATION_TTL = dt.timedelta(minutes=30)
MAX_FAILURES = 10
MAX_PDF_BYTES = 5 * 1024 * 1024
ATTRIBUTE = "bamboo_setup_application"
FIRST_LOGIN = ("UPDATE_PASSWORD", "CONFIGURE_TOTP")
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,59}$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_TENANT_CODE = re.compile(r"^[A-Z][A-Z0-9_]{1,19}$")
TZ = dt.timezone(dt.timedelta(hours=7))


def _sha(value: str | bytes) -> bytes:
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).digest()


def _random_code(groups: int = 3) -> str:
    return "-".join("".join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(groups))


def _normalize_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())


def is_open(conn: psycopg.Connection) -> bool:
    return not conn.execute("SELECT EXISTS (SELECT FROM core.tenant)").fetchone()[0]


def new_code(conn: psycopg.Connection) -> str:
    """Sinh mã thiết lập mới, hủy mã cũ chưa dùng. Chỉ mã băm được lưu."""
    code = _random_code()
    conn.execute("UPDATE core.setup_code SET revoked_at = now() WHERE used_at IS NULL AND revoked_at IS NULL")
    conn.execute(
        "INSERT INTO core.setup_code (code_sha256, expires_at) VALUES (%s, now() + %s)",
        (_sha(_normalize_code(code)), CODE_TTL),
    )
    return code


def check_code(conn: psycopg.Connection, code: str) -> int:
    row = conn.execute(
        """SELECT id, code_sha256, failures FROM core.setup_code
           WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
           ORDER BY id DESC LIMIT 1 FOR UPDATE"""
    ).fetchone()
    if row is None:
        raise ActionError(
            "Không có mã thiết lập còn hiệu lực. Người quản trị máy chủ chạy "
            "`docker compose run --rm actions python -m app.setup_code` để lấy mã mới",
            "setup-code-expired",
            403,
        )
    code_id, digest, failures = row
    if failures >= MAX_FAILURES:
        raise ActionError("Nhập sai mã thiết lập quá nhiều lần; lấy mã mới trên máy chủ", "setup-code-locked", 403)
    if not hmac.compare_digest(bytes(digest), _sha(_normalize_code(code))):
        raise ActionError("Mã thiết lập không đúng", "setup-code-invalid", 403)
    return code_id


def record_failure(conn: psycopg.Connection) -> None:
    """Đếm lần nhập sai trên mã đang hiệu lực (giao dịch riêng, không bị hủy cùng yêu cầu lỗi)."""
    conn.execute(
        """UPDATE core.setup_code SET failures = failures + 1
           WHERE id = (SELECT max(id) FROM core.setup_code
                       WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now())"""
    )


def _text(data: dict, key: str, label: str, max_len: int, required: bool = True) -> str | None:
    value = unicodedata.normalize("NFC", str(data.get(key) or "")).strip()
    if not value:
        if required:
            raise ActionError(f"Thiếu {label}")
        return None
    if len(value) > max_len:
        raise ActionError(f"{label} quá dài (tối đa {max_len} ký tự)")
    return value


def _account(data: dict | None, label: str, with_name: bool) -> dict | None:
    if not data:
        return None
    username = (_text(data, "username", f"tên đăng nhập của {label}", 60) or "").lower()
    if not _USERNAME.match(username):
        raise ActionError(f"Tên đăng nhập của {label} chỉ gồm chữ thường không dấu, số, dấu chấm, gạch; 3-60 ký tự")
    email = _text(data, "email", f"email của {label}", 200, required=False)
    if email and not _EMAIL.match(email):
        raise ActionError(f"Email của {label} không hợp lệ")
    out = {"username": username, "email": email}
    if with_name:
        out["full_name"] = _text(data, "full_name", f"họ tên {label}", 200)
    return out


def parse_company(data: dict, with_code: bool = True) -> dict:
    tax_code = re.sub(r"\s", "", str(data.get("tax_code") or ""))
    if not legal_sign.TAX_CODE.match(tax_code):
        raise ActionError("Mã số thuế gồm 10 chữ số (hoặc 13 với chi nhánh, dạng 0101234567-001)")
    out = {
        "tax_code": tax_code,
        "legal_name": _text(data, "legal_name", "tên doanh nghiệp", 300),
        "short_name": _text(data, "short_name", "tên viết tắt", 120, required=False),
        "address": _text(data, "address", "địa chỉ trụ sở", 500),
        "legal_rep_name": _text(data, "legal_rep_name", "họ tên người đại diện theo pháp luật", 200),
        "legal_rep_title": _text(data, "legal_rep_title", "chức danh người đại diện", 100, required=False)
        or "Giám đốc",
    }
    if with_code:
        code = str(data.get("code") or "").strip().upper()
        if not _TENANT_CODE.match(code):
            raise ActionError("Mã công ty viết hoa không dấu, bắt đầu bằng chữ, 2-20 ký tự (ví dụ ABC)")
        out["code"] = code
    return out


def render_pdf(ctx: Context, application: dict) -> bytes:
    if not ctx.gotenberg_url:
        raise ActionError("Chưa cấu hình dịch vụ dựng PDF (Gotenberg)", "pdf-unavailable", 503)
    expires = dt.datetime.fromisoformat(application["expires_at"]).astimezone(TZ)
    today = dt.datetime.now(TZ)
    html = forms._env.get_template("don_dang_ky_su_dung.html").render(
        a=application,
        title="Đơn đăng ký sử dụng hệ thống"
        if application["purpose"] == "SETUP"
        else "Đơn xác thực thông tin doanh nghiệp",
        expires=expires.strftime("%H:%M ngày %d/%m/%Y"),
        place_date=f"Ngày {today.day} tháng {today.month} năm {today.year}",
    )
    try:
        return forms.html_to_pdf(
            ctx.gotenberg_url, html, forms.footer(application["company"]["tax_code"], application["nonce"])
        )
    except forms.PdfUnavailable as exc:
        raise ActionError("Dịch vụ dựng PDF tạm thời không truy cập được, thử lại sau", "pdf-unavailable", 503) from exc


def _new_application(
    conn: psycopg.Connection, ctx: Context, purpose: str, data: dict, tenant_id=None
) -> tuple[dict, str, bytes]:
    token = secrets.token_urlsafe(32)
    application = {
        **data,
        "purpose": purpose,
        "nonce": _random_code(4),
        "expires_at": (dt.datetime.now(dt.UTC) + APPLICATION_TTL).isoformat(),
    }
    pdf = render_pdf(ctx, application)
    application["id"] = str(
        conn.execute(
            """INSERT INTO core.setup_application (purpose, tenant_id, token_sha256, nonce, data, pdf, expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (purpose, tenant_id, _sha(token), application["nonce"], Jsonb(data), pdf, application["expires_at"]),
        ).fetchone()[0]
    )
    return application, token, pdf


def start(conn: psycopg.Connection, ctx: Context, body: dict) -> dict:
    conn.execute("SELECT pg_advisory_xact_lock(hashtext('core.setup'))")
    if not is_open(conn):
        raise ActionError("Hệ thống đã có công ty; đăng nhập để tiếp tục", "setup-closed", 409)
    code_id = check_code(conn, str(body.get("setup_code") or ""))
    company = parse_company(body.get("company") or {})
    owner = _account(body.get("owner") or {}, "chủ sở hữu", with_name=False)
    admin = _account(body.get("admin"), "quản trị viên", with_name=True)
    if admin and admin["username"] == owner["username"]:
        raise ActionError("Tài khoản quản trị viên phải khác tài khoản chủ sở hữu")
    data = {"company": company, "owner": owner, "admin": admin, "setup_code_id": code_id}
    application, token, _pdf = _new_application(conn, ctx, "SETUP", data)
    return {
        "application_id": application["id"],
        "token": token,
        "nonce": application["nonce"],
        "expires_at": application["expires_at"],
    }


def _application(conn: psycopg.Connection, application_id: str, token: str, purpose: str, tenant_id=None) -> dict:
    try:
        uuid.UUID(str(application_id))
    except ValueError as exc:
        raise ActionError("Không tìm thấy đơn", "not-found", 404) from exc
    row = conn.execute(
        """SELECT id, purpose, tenant_id, token_sha256, nonce, data, pdf, expires_at, finished_at
           FROM core.setup_application WHERE id = %s FOR UPDATE""",
        (application_id,),
    ).fetchone()
    if (
        row is None
        or row[1] != purpose
        or (tenant_id is not None and str(row[2]) != str(tenant_id))
        or (token is not None and not hmac.compare_digest(bytes(row[3]), _sha(token)))
    ):
        raise ActionError("Không tìm thấy đơn", "not-found", 404)
    if row[8] is not None:
        raise ActionError("Đơn đã được dùng", "application-used", 409)
    if row[7] < dt.datetime.now(dt.UTC):
        raise ActionError("Đơn đã hết hạn; lập đơn mới", "application-expired", 409)
    return {"id": str(row[0]), "nonce": row[4], "data": row[5], "pdf": bytes(row[6])}


def application_pdf(conn: psycopg.Connection, application_id: str, token: str) -> tuple[str, bytes]:
    a = _application(conn, application_id, token, "SETUP")
    return f"don-dang-ky-{a['data']['company']['tax_code']}-{a['nonce']}.pdf", a["pdf"]


def _verify(ctx: Context, signed: bytes, original: bytes, tax_code: str) -> legal_sign.Signer:
    if len(signed) > MAX_PDF_BYTES:
        raise ActionError("Tệp đã ký quá lớn (tối đa 5 MB)", "too-large", 413)
    roots = legal_sign.load_trust_roots(ctx.signature_trust_dir)
    try:
        return legal_sign.verify(signed, original, tax_code, roots, online=ctx.signature_online)
    except legal_sign.SignatureRejected as exc:
        raise ActionError(str(exc), "signature-rejected", 422) from exc


def _record(conn: psycopg.Connection, tenant_id, signer: legal_sign.Signer, document: bytes, person=None):
    return conn.execute(
        """INSERT INTO core.legal_verification (tenant_id, method, tax_code, signer_name, signer_subject, issuer,
                                                serial_number, signed_at, document_sha256, document, verified_by)
           VALUES (%s, 'DIGITAL_SIGNATURE', %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            tenant_id,
            signer.tax_code,
            signer.name,
            signer.subject,
            signer.issuer,
            signer.serial_number,
            signer.signed_at,
            signer.document_sha256,
            document,
            person,
        ),
    ).fetchone()[0]


def finish(
    pool: ConnectionPool,
    ctx: Context,
    allow_unverified: bool,
    application_id: str,
    token: str,
    signed: bytes | None,
) -> dict:
    users: KeycloakUsers | None = ctx.users
    with pool.connection() as conn, conn.transaction():
        if not is_open(conn):
            raise ActionError("Hệ thống đã có công ty; đăng nhập để tiếp tục", "setup-closed", 409)
        a = _application(conn, application_id, token, "SETUP")
    data, company = a["data"], a["data"]["company"]
    if signed is None:
        if not allow_unverified:
            raise ActionError("Máy chủ yêu cầu đơn đã ký số để khởi tạo công ty", "signature-required", 422)
        signer = None
    else:
        signer = _verify(ctx, signed, a["pdf"], company["tax_code"])
    if users is None:
        raise ActionError("Máy chủ chưa cấu hình tạo tài khoản đăng nhập (bms-provisioner)", "unavailable", 503)

    people = [("Chủ sở hữu", data["owner"] | {"full_name": company["legal_rep_name"]})]
    if data.get("admin"):
        people.append(("Quản trị viên", data["admin"]))
    accounts, created = [], []
    try:
        for label, person in people:
            password = temporary_password()
            subject = users.create(
                a["id"], person["username"], person["full_name"], person.get("email"), password, ATTRIBUTE, FIRST_LOGIN
            )
            created.append(subject)
            accounts.append({"role": label, "username": person["username"], "password": password, "subject": subject})
    except AccountConflict as exc:
        raise ActionError(f"{exc}: chọn tên đăng nhập hoặc email khác", "account-conflict", 409) from exc

    try:
        with pool.connection() as conn, conn.transaction():
            conn.execute("SELECT pg_advisory_xact_lock(hashtext('core.setup'))")
            if not is_open(conn):
                raise ActionError("Hệ thống đã có công ty; đăng nhập để tiếp tục", "setup-closed", 409)
            _application(conn, application_id, token, "SETUP")
            used = conn.execute(
                "UPDATE core.setup_code SET used_at = now() WHERE id = %s AND used_at IS NULL AND revoked_at IS NULL",
                (data["setup_code_id"],),
            )
            if used.rowcount != 1:
                raise ActionError("Mã thiết lập đã hết hiệu lực; lấy mã mới và lập lại đơn", "setup-code-expired", 403)
            tid, _root, director, admin_seat = conn.execute(
                "SELECT * FROM core.create_tenant(%s, %s)",
                (company["code"], company.get("short_name") or company["legal_name"]),
            ).fetchone()
            conn.execute(
                """UPDATE core.tenant SET tax_code = %s, legal_name = %s, address = %s, legal_rep_name = %s,
                          legal_status = %s WHERE id = %s""",
                (
                    company["tax_code"],
                    company["legal_name"],
                    company["address"],
                    company["legal_rep_name"],
                    "VERIFIED" if signer else "UNVERIFIED",
                    tid,
                ),
            )
            owner = conn.execute(
                "SELECT core.place_person(%s, %s, %s, %s, %s)",
                (tid, accounts[0]["subject"], company["legal_rep_name"], f"{company['code']}-0001", director),
            ).fetchone()[0]
            if len(accounts) > 1:
                conn.execute(
                    "SELECT core.place_person(%s, %s, %s, %s, %s)",
                    (tid, accounts[1]["subject"], data["admin"]["full_name"], f"{company['code']}-0002", admin_seat),
                )
            verification = _record(conn, tid, signer, signed) if signer else None
            conn.execute(
                "INSERT INTO core.tenant_owner (tenant_id, person_id, platform, verification_id) VALUES (%s, %s, true, %s)",
                (tid, owner, verification),
            )
            conn.execute(
                "UPDATE core.setup_application SET finished_at = now(), tenant_id = %s WHERE id = %s", (tid, a["id"])
            )
    except Exception:
        for subject in created:
            try:
                users.disable(subject)
            except Exception as exc:  # noqa: BLE001 - dọn tài khoản thừa, lỗi không che lỗi gốc
                log.warning("không vô hiệu hóa được tài khoản %s sau khi khởi tạo lỗi: %s", subject, exc)
        raise
    log.info("đã khởi tạo công ty %s (%s)", company["code"], "đã xác thực" if signer else "chưa xác thực")
    return {
        "tenant_code": company["code"],
        "tenant_name": company.get("short_name") or company["legal_name"],
        "legal_status": "VERIFIED" if signer else "UNVERIFIED",
        "signer": signer.subject if signer else None,
        "accounts": [{k: v for k, v in acc.items() if k != "subject"} for acc in accounts],
    }


# ----- API công khai /setup/* (cổng API giới hạn tần suất, không kiểm token) -----


def _error(exc: ActionError) -> JSONResponse:
    return JSONResponse({"message": exc.message, "code": exc.code}, exc.status)


def router(pool_of: Callable[[], ConnectionPool], settings: config.Settings, ctx: Context) -> APIRouter:
    api = APIRouter(prefix="/setup")

    @api.get("/status")
    def status():
        with pool_of().connection() as conn:
            return {
                "open": is_open(conn),
                "signature_ready": bool(legal_sign.load_trust_roots(ctx.signature_trust_dir)),
                "allow_unverified": settings.setup_allow_unverified,
            }

    @api.post("/applications")
    async def create(request: Request):
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"message": "Cần thân JSON"}, 400)

        def run():
            with pool_of().connection() as conn, conn.transaction():
                return start(conn, ctx, body)

        def failed():
            with pool_of().connection() as conn, conn.transaction():
                record_failure(conn)

        try:
            return await run_in_threadpool(run)
        except ActionError as exc:
            if exc.code == "setup-code-invalid":
                log.warning("nhập sai mã thiết lập từ %s", request.client.host if request.client else "?")
                await run_in_threadpool(failed)
            return _error(exc)

    @api.get("/applications/{application_id}/pdf")
    def pdf(application_id: str, token: str = ""):
        try:
            with pool_of().connection() as conn, conn.transaction():
                name, content = application_pdf(conn, application_id, token)
        except ActionError as exc:
            return _error(exc)
        return Response(
            content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'}
        )

    @api.post("/applications/{application_id}/finish")
    async def done(application_id: str, request: Request):
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"message": "Cần thân JSON"}, 400)
        signed = None
        if body.get("signed_pdf_base64"):
            try:
                signed = base64.b64decode(body["signed_pdf_base64"], validate=True)
            except ValueError:
                return JSONResponse({"message": "Tệp đã ký không đọc được"}, 400)
        try:
            return await run_in_threadpool(
                finish,
                pool_of(),
                ctx,
                settings.setup_allow_unverified,
                application_id,
                str(body.get("token") or ""),
                signed,
            )
        except ActionError as exc:
            return _error(exc)

    return api


# ----- Xác thực bổ sung từ bên trong (Hasura Action, chỉ chủ sở hữu) -----


def _owner_tenant(conn: psycopg.Connection, session: dict) -> dict:
    person, tenant = session.get("x-hasura-user-id"), session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    row = conn.execute(
        """SELECT t.id, t.code, t.tax_code, t.legal_name, t.address, t.legal_rep_name, t.legal_status,
                  o.person_id = %s AS is_owner, o.person_id IS NOT NULL AS has_owner
           FROM core.tenant t LEFT JOIN core.tenant_owner o ON o.tenant_id = t.id WHERE t.id = %s""",
        (person, tenant),
    ).fetchone()
    keys = (
        "id",
        "code",
        "tax_code",
        "legal_name",
        "address",
        "legal_rep_name",
        "legal_status",
        "is_owner",
        "has_owner",
    )
    return dict(zip(keys, row, strict=True)) | {"person": person}


def legal_status(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    t = _owner_tenant(conn, session)
    v = conn.execute(
        """SELECT signer_name, signer_subject, issuer, signed_at, verified_at FROM core.legal_verification
           WHERE tenant_id = %s ORDER BY verified_at DESC LIMIT 1""",
        (t["id"],),
    ).fetchone()
    return {
        "tax_code": t["tax_code"],
        "legal_name": t["legal_name"],
        "legal_rep_name": t["legal_rep_name"],
        "legal_status": t["legal_status"],
        "is_owner": bool(t["is_owner"]),
        "has_owner": bool(t["has_owner"]),
        "signature_ready": bool(legal_sign.load_trust_roots(ctx.signature_trust_dir)),
        "verification": dict(
            zip(("signer_name", "signer_subject", "issuer", "signed_at", "verified_at"), v, strict=True)
        )
        if v
        else None,
    }


def _require_owner(t: dict) -> None:
    if not t["is_owner"]:
        raise ActionError("Chỉ chủ sở hữu công ty được xác thực thông tin pháp lý", "forbidden", 403)
    if not t["tax_code"]:
        raise ActionError("Công ty chưa khai mã số thuế", "bad-request")


def legal_application(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    t = _owner_tenant(conn, session)
    _require_owner(t)
    company = {k: t[k] for k in ("tax_code", "legal_name", "address", "legal_rep_name")} | {
        "code": t["code"],
        "legal_rep_title": "Người đại diện theo pháp luật",
    }
    application, _token, pdf = _new_application(conn, ctx, "VERIFY", {"company": company}, t["id"])
    return {
        "application_id": application["id"],
        "nonce": application["nonce"],
        "expires_at": application["expires_at"],
        "pdf_base64": base64.b64encode(pdf).decode(),
        "file_name": f"don-xac-thuc-{t['tax_code']}-{application['nonce']}.pdf",
    }


def legal_verify(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    t = _owner_tenant(conn, session)
    _require_owner(t)
    a = _application(conn, args["application_id"], None, "VERIFY", t["id"])
    try:
        signed = base64.b64decode(args["content_base64"], validate=True)
    except ValueError as exc:
        raise ActionError("Tệp đã ký không đọc được") from exc
    signer = _verify(ctx, signed, a["pdf"], t["tax_code"])
    verification = _record(conn, t["id"], signer, signed, t["person"])
    conn.execute("UPDATE core.tenant SET legal_status = 'VERIFIED' WHERE id = %s", (t["id"],))
    conn.execute("UPDATE core.tenant_owner SET verification_id = %s WHERE tenant_id = %s", (verification, t["id"]))
    conn.execute("UPDATE core.setup_application SET finished_at = now() WHERE id = %s", (a["id"],))
    return legal_status(conn, session, {}, ctx)


HANDLERS = {
    "legal_status": legal_status,
    "legal_application": legal_application,
    "legal_verify": legal_verify,
}
