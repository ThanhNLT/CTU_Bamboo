"""Đăng ký sử dụng: khởi tạo công ty lần đầu trên máy chủ tự cài (ADR #57, đơn giản hóa ở ADR #62).

Luồng đăng ký (công khai qua cổng API `/setup/*`, chỉ mở khi hệ thống chưa có công ty nào):
1. Trình hướng dẫn trên web gửi một lần: người đăng ký (chủ sở hữu), doanh nghiệp, quy mô, phòng ban (luồng chi tiết),
   thành viên kèm vai trò dựng sẵn và công cụ (mô-đun) cần bật. Không phải nhập mã thiết lập: trang mở trong khi còn mã
   thiết lập hiệu lực (24 giờ sau mỗi lần `bootstrap` khởi động trên hệ thống trống, hoặc sau `python -m app.setup_code`).
2. Tùy chọn: tải **đơn đăng ký PDF** (chỉ dựng khi cần) rồi ký số bằng chữ ký số doanh nghiệp; đơn hợp lệ thì công ty
   VERIFIED. Bỏ qua thì (nếu SETUP_ALLOW_UNVERIFIED) công ty UNVERIFIED, ký bổ sung từ bên trong
   (Action `legal_application`, `legal_verify`).
3. Người đăng ký là **chủ sở hữu**: giữ ghế Giám đốc, là người duy nhất trao/thu hồi quyền quản trị (migration 043).
   Chủ sở hữu và quản trị viên phải đổi mật khẩu và cài OTP ở lần đăng nhập đầu; thành viên khác chỉ đổi mật khẩu.
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

from . import config, forms, legal_sign, modules
from .common import ActionError, Context
from .hr_account import AccountConflict, KeycloakUsers, temporary_password

log = logging.getLogger("setup")

CODE_TTL = dt.timedelta(hours=24)
APPLICATION_TTL = dt.timedelta(minutes=30)
MAX_FAILURES = 10
MAX_PDF_BYTES = 5 * 1024 * 1024
ATTRIBUTE = "bamboo_setup_application"
FIRST_LOGIN = ("UPDATE_PASSWORD", "CONFIGURE_TOTP")
MEMBER_FIRST_LOGIN = ("UPDATE_PASSWORD",)
MAX_MEMBERS = 200
MAX_UNITS = 50
SIZE_BANDS = ("1-10", "11-50", "51-200", "200+")
TAX_CODE = re.compile(r"^([0-9]{10}(-[0-9]{3})?|[0-9]{12})$")
_PHONE = re.compile(r"^\+?[0-9 .-]{8,20}$")
UNIT_TYPES = ("PHONG", "KHOI", "VAN_PHONG", "CHI_NHANH", "NHA_MAY", "PHAN_XUONG", "TRUNG_TAM", "DOI", "KHOA")
MEMBER_ROLES = {
    "STAFF": ("NHAN_VIEN", "Nhân viên", None, None),
    "MANAGER": ("TRUONG_BO_PHAN", "Trưởng bộ phận", "QUAN_LY", "SUBTREE"),
    "ACCOUNTANT": ("KE_TOAN", "Kế toán", "KIEM_SOAT", "TENANT"),
    "ADMIN": ("QUAN_TRI_HE_THONG", "Quản trị hệ thống", "QUAN_TRI_TO_CHUC", "TENANT"),
}
_TITLE_NAMES = {"TRUONG_BO_PHAN": "Trưởng bộ phận", "KE_TOAN": "Kế toán"}
_LEGAL_FORM = re.compile(
    r"\b(CONG TY|CTY|TNHH|CO PHAN|CP|MOT THANH VIEN|MTV|HAI THANH VIEN|TRACH NHIEM HUU HAN|TAP DOAN|HO KINH DOANH|"
    r"DOANH NGHIEP TU NHAN|DNTN|JSC|CO\.?,? LTD|LTD|VIET NAM)\b"
)
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
    """Máy chưa có công ty nào."""
    return not conn.execute("SELECT EXISTS (SELECT FROM core.tenant)").fetchone()[0]


def accepting(conn: psycopg.Connection, open_signup: bool) -> bool:
    """Nhận đăng ký: máy trống, hoặc SETUP_OPEN_SIGNUP mở đăng ký cả khi đã có công ty (bản demo)."""
    return open_signup or is_open(conn)


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
        title={
            "SETUP": "Đơn đăng ký sử dụng hệ thống",
            "VERIFY": "Đơn xác thực thông tin doanh nghiệp",
            "RECOVER": "Đơn khôi phục tài khoản chủ sở hữu",
        }[application["purpose"]],
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
    conn: psycopg.Connection, ctx: Context, purpose: str, data: dict, tenant_id=None, render: bool = True
) -> tuple[dict, str, bytes]:
    token = secrets.token_urlsafe(32)
    application = {
        **data,
        "purpose": purpose,
        "nonce": _random_code(4),
        "expires_at": (dt.datetime.now(dt.UTC) + APPLICATION_TTL).isoformat(),
    }
    pdf = render_pdf(ctx, application) if render else b""
    application["id"] = str(
        conn.execute(
            """INSERT INTO core.setup_application (purpose, tenant_id, token_sha256, nonce, data, pdf, expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (purpose, tenant_id, _sha(token), application["nonce"], Jsonb(data), pdf, application["expires_at"]),
        ).fetchone()[0]
    )
    return application, token, pdf


def window_code(conn: psycopg.Connection) -> int:
    """Mã thiết lập còn hiệu lực mở cửa sổ đăng ký 24 giờ (ADR #62): người đăng ký không phải nhập mã."""
    row = conn.execute(
        """SELECT id FROM core.setup_code WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
           ORDER BY id DESC LIMIT 1 FOR UPDATE"""
    ).fetchone()
    if row is None:
        raise ActionError(
            "Đã hết thời gian đăng ký (24 giờ sau khi cài). Người quản trị máy chủ chạy `make setup-code` "
            "(hoặc khởi động lại hệ thống) để mở lại",
            "setup-window-closed",
            403,
        )
    return row[0]


def suggest_code(name: str) -> str:
    """Mã công ty từ tên: bỏ dấu và loại hình doanh nghiệp, ghép chữ in hoa (Công ty TNHH Minh Anh → MINHANH)."""
    ascii_name = unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D"))
    ascii_name = "".join(c for c in ascii_name if not unicodedata.combining(c)).upper()
    words = re.findall(r"[A-Z0-9]+", _LEGAL_FORM.sub(" ", ascii_name)) or re.findall(r"[A-Z0-9]+", ascii_name)
    code = "".join(words)
    if len(code) > 20:
        code = "".join(w[0] for w in words) if len(words) > 1 else code[:20]
    code = re.sub(r"^[0-9_]+", "", code)[:20]
    return code if len(code) >= 2 else "CONGTY"


def _year(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        year = int(value)
    except (TypeError, ValueError) as exc:
        raise ActionError("Năm sinh không hợp lệ") from exc
    if not 1900 <= year <= dt.date.today().year - 15:
        raise ActionError("Năm sinh không hợp lệ")
    return year


def _person(data: dict, label: str) -> dict:
    out = _account(data, label, with_name=True)
    phone = _text(data, "phone", f"điện thoại của {label}", 20, required=False)
    if phone and not _PHONE.match(phone):
        raise ActionError(f"Số điện thoại của {label} không hợp lệ")
    out["phone"] = phone
    out["title"] = _text(data, "title", f"chức vụ của {label}", 100, required=False)
    return out


def parse_registration(body: dict) -> dict:
    """Kiểm dữ liệu trình hướng dẫn đăng ký (ADR #62)."""
    owner = _person(body.get("owner") or {}, "người đăng ký")
    owner["birth_year"] = _year((body.get("owner") or {}).get("birth_year"))
    owner["title"] = owner["title"] or "Giám đốc"

    c = body.get("company") or {}
    tax_code = re.sub(r"\s", "", str(c.get("tax_code") or ""))
    if not TAX_CODE.match(tax_code):
        raise ActionError("Mã số thuế gồm 10 chữ số (13 với chi nhánh, 12 với hộ kinh doanh)")
    legal_name = _text(c, "legal_name", "tên doanh nghiệp", 300)
    code = str(c.get("code") or "").strip().upper() or suggest_code(legal_name)
    if not _TENANT_CODE.match(code):
        raise ActionError("Mã công ty viết hoa không dấu, bắt đầu bằng chữ, 2-20 ký tự (ví dụ ABC)")
    company = {
        "code": code,
        "tax_code": tax_code,
        "legal_name": legal_name,
        "short_name": _text(c, "short_name", "tên viết tắt", 120, required=False),
        "address": _text(c, "address", "địa chỉ trụ sở", 500, required=False),
        "industry": _text(c, "industry", "lĩnh vực kinh doanh", 100, required=False),
        "legal_rep_name": owner["full_name"],
        "legal_rep_title": owner["title"],
    }

    size_band = str(body.get("size_band") or "1-10")
    if size_band not in SIZE_BANDS:
        raise ActionError("Quy mô không hợp lệ")
    flow = str(body.get("flow") or "quick")
    if flow not in ("quick", "detailed"):
        raise ActionError("Luồng đăng ký không hợp lệ")

    units, keys = [], set()
    for u in (body.get("units") or []) if flow == "detailed" else []:
        if not isinstance(u, dict):
            raise ActionError("Phòng ban không hợp lệ")
        key = str(u.get("key") or "")
        if not key or key in keys:
            raise ActionError("Mỗi phòng ban cần một khóa riêng")
        kind = str(u.get("type") or "PHONG")
        if kind not in UNIT_TYPES:
            raise ActionError(f"Loại đơn vị {kind} không hợp lệ")
        keys.add(key)
        units.append({"key": key, "name": _text(u, "name", "tên phòng ban", 200), "type": kind})
    if len(units) > MAX_UNITS:
        raise ActionError(f"Tối đa {MAX_UNITS} phòng ban khi đăng ký; thêm tiếp ở Cơ cấu tổ chức")
    if len({u["name"].casefold() for u in units}) != len(units):
        raise ActionError("Có hai phòng ban trùng tên")

    members, usernames = [], {owner["username"]}
    emails = {owner["email"].casefold()} if owner["email"] else set()
    for m in body.get("members") or []:
        if not isinstance(m, dict):
            raise ActionError("Thành viên không hợp lệ")
        person = _person(m, "thành viên")
        if person["username"] in usernames:
            raise ActionError(f"Tên đăng nhập {person['username']} bị trùng")
        usernames.add(person["username"])
        if person["email"]:
            if person["email"].casefold() in emails:
                raise ActionError(f"Email {person['email']} bị trùng")
            emails.add(person["email"].casefold())
        role = str(m.get("role") or "STAFF")
        if role not in MEMBER_ROLES:
            raise ActionError(f"Vai trò {role} không hợp lệ")
        unit = m.get("unit") or None
        if unit is not None and unit not in keys:
            raise ActionError(f"Thành viên {person['full_name']} thuộc phòng ban không có trong danh sách")
        members.append(person | {"role": role, "unit": unit})
    if len(members) > MAX_MEMBERS:
        raise ActionError(f"Tối đa {MAX_MEMBERS} thành viên khi đăng ký; thêm tiếp ở Người dùng hoặc Nhập Excel")

    chosen = [str(x) for x in body.get("modules") or []]
    unknown = [x for x in chosen if x not in modules.BY_CODE or modules.BY_CODE[x].external]
    if unknown:
        raise ActionError(f"Không có công cụ {', '.join(unknown)}")
    wanted = modules.closure(chosen, lambda code: modules.BY_CODE[code].depends)

    admin = next((m for m in members if m["role"] == "ADMIN"), None)
    return {
        "owner": owner,
        "company": company,
        "size_band": size_band,
        "flow": flow,
        "units": units,
        "members": members,
        "modules": wanted,
        "admin": {k: admin[k] for k in ("username", "full_name", "email")} if admin else None,
    }


def start(conn: psycopg.Connection, ctx: Context, body: dict, open_signup: bool = False) -> dict:
    conn.execute("SELECT pg_advisory_xact_lock(hashtext('core.setup'))")
    if not accepting(conn, open_signup):
        raise ActionError("Hệ thống đã có công ty; đăng nhập để tiếp tục", "setup-closed", 409)
    if body.get("setup_code"):
        code_id = check_code(conn, str(body["setup_code"]))
    else:
        code_id = None if open_signup else window_code(conn)
    if "members" not in body and isinstance(body.get("company"), dict):
        c = body["company"]
        owner = {"full_name": c.get("legal_rep_name"), "title": c.get("legal_rep_title"), **(body.get("owner") or {})}
        admin = body.get("admin")
        body = body | {"owner": owner, "members": [admin | {"role": "ADMIN"}] if admin else []}
    data = parse_registration(body) | {"setup_code_id": code_id}
    application, token, _pdf = _new_application(conn, ctx, "SETUP", data, render=False)
    return {
        "application_id": application["id"],
        "token": token,
        "nonce": application["nonce"],
        "expires_at": application["expires_at"],
        "tenant_code": data["company"]["code"],
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
    return {
        "id": str(row[0]),
        "tenant_id": row[2],
        "nonce": row[4],
        "data": row[5],
        "pdf": bytes(row[6]),
        "expires_at": row[7],
    }


def application_pdf(conn: psycopg.Connection, ctx: Context, application_id: str, token: str) -> tuple[str, bytes]:
    purpose = conn.execute(
        "SELECT purpose FROM core.setup_application WHERE id::text = %s", (application_id,)
    ).fetchone()
    if purpose is None or purpose[0] not in ("SETUP", "RECOVER"):
        raise ActionError("Không tìm thấy đơn", "not-found", 404)
    a = _application(conn, application_id, token, purpose[0])
    if not a["pdf"]:
        application = {
            **a["data"],
            "purpose": purpose[0],
            "nonce": a["nonce"],
            "expires_at": a["expires_at"].isoformat(),
        }
        a["pdf"] = render_pdf(ctx, application)
        conn.execute("UPDATE core.setup_application SET pdf = %s WHERE id = %s", (a["pdf"], a["id"]))
    kind = "don-dang-ky" if purpose[0] == "SETUP" else "don-khoi-phuc"
    return f"{kind}-{a['data']['company']['tax_code']}-{a['nonce']}.pdf", a["pdf"]


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


def _catalog_item(conn: psycopg.Connection, tenant, catalog: str, code: str, name: str):
    row = conn.execute(
        "SELECT id FROM core.catalog_item WHERE tenant_id = %s AND catalog = %s AND code = %s", (tenant, catalog, code)
    ).fetchone()
    if row:
        return row[0]
    return conn.execute(
        "INSERT INTO core.catalog_item (tenant_id, catalog, code, name) VALUES (%s, %s, %s, %s) RETURNING id",
        (tenant, catalog, code, name),
    ).fetchone()[0]


def _role(conn: psycopg.Connection, tenant, code: str):
    return conn.execute("SELECT id FROM core.role WHERE tenant_id = %s AND code = %s", (tenant, code)).fetchone()[0]


def _build_company(conn: psycopg.Connection, data: dict, accounts: list[dict], signer, signed) -> uuid.UUID:
    """Dựng công ty theo dữ liệu đăng ký trong một giao dịch: đơn vị, vị trí, người, phân quyền, công cụ."""
    company, owner = data["company"], data["owner"]
    platform = is_open(conn)
    tid, root, director, admin_seat = conn.execute(
        "SELECT * FROM core.create_tenant(%s, %s)",
        (company["code"], company.get("short_name") or company["legal_name"]),
    ).fetchone()
    conn.execute(
        """UPDATE core.tenant SET tax_code = %s, legal_name = %s, address = %s, legal_rep_name = %s, legal_status = %s,
                  industry = %s, size_band = %s WHERE id = %s""",
        (
            company["tax_code"],
            company["legal_name"],
            company.get("address"),
            company["legal_rep_name"],
            "VERIFIED" if signer else "UNVERIFIED",
            company.get("industry"),
            data.get("size_band"),
            tid,
        ),
    )
    if owner.get("title") and owner["title"] != "Giám đốc":
        conn.execute("UPDATE core.position SET name = %s WHERE id = %s", (owner["title"], director))

    staff_role = _role(conn, tid, "NHAN_VIEN")
    unit_ids = {None: root}
    for n, u in enumerate(data.get("units") or [], start=1):
        unit_type = _catalog_item(conn, tid, "UNIT_TYPE", u["type"], u["type"].title())
        unit_ids[u["key"]] = conn.execute(
            """INSERT INTO core.org_unit (tenant_id, parent_id, unit_type_id, code, name)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (tid, root, unit_type, f"{company['code']}_{n:02d}"[:40], u["name"]),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope) VALUES (%s, %s, %s, 'UNIT')",
            (tid, staff_role, unit_ids[u["key"]]),
        )

    def person(subject: str, p: dict, n: int, position) -> uuid.UUID:
        pid = conn.execute(
            "SELECT core.place_person(%s, %s, %s, %s, %s)",
            (tid, subject, p["full_name"], f"{company['code']}-{n:04d}", position),
        ).fetchone()[0]
        conn.execute(
            "UPDATE core.person SET birth_year = %s, phone = %s, email = %s WHERE id = %s",
            (p.get("birth_year"), p.get("phone"), p.get("email"), pid),
        )
        return pid

    owner_id = person(accounts[0]["subject"], owner, 1, director)
    headed, admin_free = set(), True
    for n, (m, acc) in enumerate(zip(data.get("members") or [], accounts[1:], strict=True), start=2):
        title_code, default_name, role_code, scope = MEMBER_ROLES[m["role"]]
        unit = unit_ids[m.get("unit")]
        if m["role"] == "ADMIN" and admin_free and unit == root:
            admin_free = False
            if m.get("title"):
                conn.execute("UPDATE core.position SET name = %s WHERE id = %s", (m["title"], admin_seat))
            person(acc["subject"], m, n, admin_seat)
            continue
        is_head = m["role"] == "MANAGER" and unit != root and unit not in headed
        if is_head:
            headed.add(unit)
        title = _catalog_item(conn, tid, "JOB_TITLE", title_code, _TITLE_NAMES.get(title_code, default_name))
        position = conn.execute(
            """INSERT INTO core.position (tenant_id, org_unit_id, job_title_id, name, is_head)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (tid, unit, title, m.get("title") or default_name, is_head),
        ).fetchone()[0]
        if role_code:
            conn.execute(
                "INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope) VALUES (%s, %s, %s, %s)",
                (tid, _role(conn, tid, role_code), position, scope),
            )
        person(acc["subject"], m, n, position)

    for code in data.get("modules") or []:
        conn.execute(
            "INSERT INTO core.module_install (module, installed_by) VALUES (%s, 'setup') ON CONFLICT DO NOTHING",
            (code,),
        )
        conn.execute(
            """INSERT INTO core.tenant_module (tenant_id, module, enabled_by) VALUES (%s, %s, %s)
               ON CONFLICT DO NOTHING""",
            (tid, code, owner_id),
        )

    verification = _record(conn, tid, signer, signed) if signer else None
    conn.execute(
        "INSERT INTO core.tenant_owner (tenant_id, person_id, platform, verification_id) VALUES (%s, %s, %s, %s)",
        (tid, owner_id, platform, verification),
    )
    return tid


def finish(
    pool: ConnectionPool,
    ctx: Context,
    allow_unverified: bool,
    application_id: str,
    token: str,
    signed: bytes | None,
    open_signup: bool = False,
) -> dict:
    users: KeycloakUsers | None = ctx.users
    with pool.connection() as conn, conn.transaction():
        if not accepting(conn, open_signup):
            raise ActionError("Hệ thống đã có công ty; đăng nhập để tiếp tục", "setup-closed", 409)
        a = _application(conn, application_id, token, "SETUP")
    data, company = a["data"], a["data"]["company"]
    if signed is None:
        if not allow_unverified:
            raise ActionError("Máy chủ yêu cầu đơn đã ký số để khởi tạo công ty", "signature-required", 422)
        signer = None
    else:
        if not a["pdf"]:
            raise ActionError("Tải đơn đăng ký PDF về trước, ký số rồi tải lên", "pdf-missing", 409)
        signer = _verify(ctx, signed, a["pdf"], company["tax_code"])
    if users is None:
        raise ActionError("Máy chủ chưa cấu hình tạo tài khoản đăng nhập (bms-provisioner)", "unavailable", 503)

    owner = data["owner"] | {"full_name": data["owner"].get("full_name") or company["legal_rep_name"]}
    members = data.get("members")
    if members is None:
        members = [data["admin"] | {"role": "ADMIN", "unit": None}] if data.get("admin") else []
    data = data | {"owner": owner, "members": members}

    people = [("Chủ sở hữu", owner, FIRST_LOGIN)]
    for m in members:
        role_name = MEMBER_ROLES[m["role"]][1] if m["role"] != "ADMIN" else "Quản trị viên"
        people.append((role_name, m, FIRST_LOGIN if m["role"] == "ADMIN" else MEMBER_FIRST_LOGIN))
    accounts, created = [], []
    try:
        for label, person, actions in people:
            password = temporary_password()
            subject = users.create(
                a["id"], person["username"], person["full_name"], person.get("email"), password, ATTRIBUTE, actions
            )
            created.append(subject)
            accounts.append(
                {
                    "role": label,
                    "full_name": person["full_name"],
                    "username": person["username"],
                    "password": password,
                    "subject": subject,
                }
            )
    except AccountConflict as exc:
        for subject in created:
            try:
                users.disable(subject)
            except Exception as err:  # noqa: BLE001
                log.warning("không vô hiệu hóa được tài khoản %s: %s", subject, err)
        raise ActionError(f"{exc}: chọn tên đăng nhập hoặc email khác", "account-conflict", 409) from exc

    try:
        with pool.connection() as conn, conn.transaction():
            conn.execute("SELECT pg_advisory_xact_lock(hashtext('core.setup'))")
            if not accepting(conn, open_signup):
                raise ActionError("Hệ thống đã có công ty; đăng nhập để tiếp tục", "setup-closed", 409)
            _application(conn, application_id, token, "SETUP")
            code_id = data.get("setup_code_id")
            used = code_id is None or (
                conn.execute(
                    "UPDATE core.setup_code SET used_at = now() WHERE id = %s AND used_at IS NULL AND revoked_at IS NULL",
                    (code_id,),
                ).rowcount
                == 1
            )
            if not used:
                raise ActionError(
                    "Thời gian đăng ký đã hết; người quản trị máy chủ chạy `make setup-code` rồi đăng ký lại",
                    "setup-window-closed",
                    403,
                )
            tid = _build_company(conn, data, accounts, signer, signed)
            conn.execute(
                "UPDATE core.setup_application SET finished_at = now(), tenant_id = %s WHERE id = %s", (tid, a["id"])
            )
    except Exception:
        for subject in created:
            try:
                users.disable(subject)
            except Exception as exc:  # noqa: BLE001
                log.warning("không vô hiệu hóa được tài khoản %s sau khi khởi tạo lỗi: %s", subject, exc)
        raise
    log.info("đã khởi tạo công ty %s (%s)", company["code"], "đã xác thực" if signer else "chưa xác thực")
    return {
        "tenant_code": company["code"],
        "tenant_name": company.get("short_name") or company["legal_name"],
        "legal_status": "VERIFIED" if signer else "UNVERIFIED",
        "signer": signer.subject if signer else None,
        "modules": data.get("modules") or [],
        "accounts": [{k: v for k, v in acc.items() if k != "subject"} for acc in accounts],
    }


def _owner_of_tax(conn: psycopg.Connection, tax_code: str):
    return conn.execute(
        """SELECT t.id, t.code, t.tax_code, t.legal_name, t.address, t.legal_rep_name, p.idp_subject
           FROM core.tenant t JOIN core.tenant_owner o ON o.tenant_id = t.id JOIN core.person p ON p.id = o.person_id
           WHERE t.tax_code = %s AND p.idp_subject IS NOT NULL""",
        (tax_code,),
    ).fetchone()


def start_recovery(conn: psycopg.Connection, ctx: Context, body: dict) -> dict:
    tax_code = re.sub(r"\s", "", str(body.get("tax_code") or ""))
    if not legal_sign.TAX_CODE.match(tax_code):
        raise ActionError("Mã số thuế gồm 10 chữ số (hoặc 13 với chi nhánh)")
    if not legal_sign.load_trust_roots(ctx.signature_trust_dir):
        raise ActionError(
            "Máy chủ chưa cài chứng thư gốc để kiểm chữ ký số; nhờ người quản trị máy chủ cài trước",
            "signature-unavailable",
            503,
        )
    row = _owner_of_tax(conn, tax_code)
    if row is None:
        raise ActionError("Không có công ty nào có chủ sở hữu với mã số thuế này", "not-found", 404)
    company = dict(zip(("code", "tax_code", "legal_name", "address", "legal_rep_name"), row[1:6], strict=True))
    company["legal_rep_title"] = "Người đại diện theo pháp luật"
    application, token, _pdf = _new_application(conn, ctx, "RECOVER", {"company": company}, row[0])
    return {
        "application_id": application["id"],
        "token": token,
        "nonce": application["nonce"],
        "expires_at": application["expires_at"],
        "tenant_name": company["legal_name"],
    }


def finish_recovery(pool: ConnectionPool, ctx: Context, application_id: str, token: str, signed: bytes) -> dict:
    with pool.connection() as conn, conn.transaction():
        a = _application(conn, application_id, token, "RECOVER")
        tax_code = a["data"]["company"]["tax_code"]
        row = _owner_of_tax(conn, tax_code)
    if row is None or row[0] != a["tenant_id"]:
        raise ActionError("Công ty không còn chủ sở hữu ứng với đơn này; lập đơn mới", "application-expired", 409)
    signer = _verify(ctx, signed, a["pdf"], tax_code)
    if ctx.users is None:
        raise ActionError("Máy chủ chưa cấu hình tạo tài khoản đăng nhập (bms-provisioner)", "unavailable", 503)
    password = temporary_password()
    username = ctx.users.recover(row[6], password)
    with pool.connection() as conn, conn.transaction():
        _application(conn, application_id, token, "RECOVER")
        verification = _record(conn, a["tenant_id"], signer, signed)
        conn.execute("UPDATE core.tenant SET legal_status = 'VERIFIED' WHERE id = %s", (a["tenant_id"],))
        conn.execute(
            "UPDATE core.tenant_owner SET verification_id = %s WHERE tenant_id = %s", (verification, a["tenant_id"])
        )
        conn.execute("UPDATE core.setup_application SET finished_at = now() WHERE id = %s", (a["id"],))
        conn.execute(
            "SELECT core.notify_security(%s, %s, %s)",
            (
                a["tenant_id"],
                "Đã khôi phục tài khoản chủ sở hữu bằng chữ ký số",
                f"Mật khẩu và mã xác thực hai lớp của tài khoản {username} đã được đặt lại theo đơn ký bởi "
                f"{signer.subject}. Nếu không phải do doanh nghiệp yêu cầu, báo ngay cho người đại diện theo pháp luật.",
            ),
        )
    log.warning("đã khôi phục tài khoản chủ sở hữu công ty %s bằng chữ ký số", a["data"]["company"]["code"])
    return {"tenant_name": a["data"]["company"]["legal_name"], "username": username, "password": password}


def _error(exc: ActionError) -> JSONResponse:
    return JSONResponse({"message": exc.message, "code": exc.code}, exc.status)


def router(pool_of: Callable[[], ConnectionPool], settings: config.Settings, ctx: Context) -> APIRouter:
    api = APIRouter(prefix="/setup")

    @api.get("/status")
    def status():
        with pool_of().connection() as conn:
            empty = is_open(conn)
            code_alive = conn.execute(
                """SELECT EXISTS (SELECT FROM core.setup_code
                                  WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now())"""
            ).fetchone()[0]
        window = settings.setup_open_signup or (empty and code_alive)
        open_ = empty or settings.setup_open_signup
        return {
            "empty": empty,
            "open": open_,
            "window_open": window,
            "signature_ready": bool(legal_sign.load_trust_roots(ctx.signature_trust_dir)),
            "allow_unverified": settings.setup_allow_unverified,
            "modules": [
                {"code": m.code, "name": m.name, "description": m.description, "depends": list(m.depends)}
                for m in modules.CATALOG
            ]
            if open_
            else [],
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
                return start(conn, ctx, body, settings.setup_open_signup)

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

    @api.post("/recovery")
    async def recovery(request: Request):
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"message": "Cần thân JSON"}, 400)

        def run():
            with pool_of().connection() as conn, conn.transaction():
                return start_recovery(conn, ctx, body)

        try:
            return await run_in_threadpool(run)
        except ActionError as exc:
            return _error(exc)

    @api.post("/recovery/{application_id}/finish")
    async def recovered(application_id: str, request: Request):
        try:
            body = await request.json()
            signed = base64.b64decode(body.get("signed_pdf_base64") or "", validate=True)
        except (ValueError, AttributeError):
            return JSONResponse({"message": "Cần thân JSON kèm đơn đã ký"}, 400)
        if not signed:
            return JSONResponse({"message": "Chưa có đơn đã ký"}, 400)
        try:
            return await run_in_threadpool(
                finish_recovery, pool_of(), ctx, application_id, str(body.get("token") or ""), signed
            )
        except ActionError as exc:
            return _error(exc)

    @api.get("/applications/{application_id}/pdf")
    def pdf(application_id: str, token: str = ""):
        try:
            with pool_of().connection() as conn, conn.transaction():
                name, content = application_pdf(conn, ctx, application_id, token)
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
                settings.setup_open_signup,
            )
        except ActionError as exc:
            return _error(exc)

    return api


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
