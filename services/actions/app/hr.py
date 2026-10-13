# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Hasura Action cho đề nghị tiếp nhận nhân sự (ADR #41).

Dữ liệu nhạy cảm (CCCD, số tài khoản, địa chỉ) chỉ đi qua đây: ghi thì mã hóa bằng khóa transit `pii` và
lưu kèm bản che; xem bản rõ cần quyền hr.onboarding.private.read và mỗi lần xem ghi hr.private_access.
"""

import re

import psycopg

from .common import ActionError, Context, bind_session, require_read, session_identity
from .openbao import BaoError
from .pii import mask_address, mask_tail

ENTITY = "hr.onboarding_request"
EDITABLE = ("DRAFT", "RETURNED")
NATIONAL_ID = re.compile(r"^(\d{9}|\d{12})$")  # CMND 9 số hoặc CCCD 12 số
BANK_ACCOUNT = re.compile(r"^\d{6,20}$")


def _request(conn: psycopg.Connection, request_id: str, session: dict, columns: str = "tenant_id") -> tuple:
    row = conn.execute(f"SELECT {columns} FROM hr.onboarding_request WHERE id = %s", (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, ENTITY, request_id, person)
    return person, row


def _cipher(ctx: Context):
    if ctx.pii is None:
        raise ActionError("Chưa cấu hình két mã hóa dữ liệu cá nhân (OpenBao)", "pii-unavailable", 503)
    return ctx.pii


def _clean(value: str | None) -> str | None:
    return None if value is None else "".join(value.split()) if value.strip() else ""


def save_onboarding_private(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Ghi CCCD, số tài khoản, ngân hàng, địa chỉ. Trường không gửi (null) giữ nguyên; chuỗi rỗng là xóa."""
    request_id = args["request_id"]
    person, row = _request(conn, request_id, session, "tenant_id, requester_id, status")
    if str(row[1]) != person:
        raise ActionError("Chỉ người lập được sửa hồ sơ", "forbidden", 403)
    if row[2] not in EDITABLE:
        raise ActionError("Hồ sơ đã gửi duyệt nên không sửa được", "rejected")

    national_id, bank_account = _clean(args.get("national_id")), _clean(args.get("bank_account"))
    address = args.get("address")
    address = None if address is None else address.strip()
    if national_id == "":
        raise ActionError("CCCD là bắt buộc", "rejected")
    if national_id is not None and not NATIONAL_ID.match(national_id):
        raise ActionError("Số CCCD gồm 12 chữ số (CMND cũ: 9 chữ số)", "rejected")
    if bank_account and not BANK_ACCOUNT.match(bank_account):
        raise ActionError("Số tài khoản ngân hàng gồm 6–20 chữ số", "rejected")
    if address is not None and len(address) > 300:
        raise ActionError("Địa chỉ quá dài (tối đa 300 ký tự)", "rejected")

    cipher = _cipher(ctx)
    changes: dict[str, str | None] = {}
    try:
        if national_id is not None:
            changes |= {"national_id_enc": cipher.encrypt(national_id), "national_id_masked": mask_tail(national_id, 3)}
        if bank_account is not None:
            changes |= (
                {"bank_account_enc": cipher.encrypt(bank_account), "bank_account_masked": mask_tail(bank_account, 4)}
                if bank_account
                else {"bank_account_enc": None, "bank_account_masked": None}
            )
        if address is not None:
            changes |= (
                {"address_enc": cipher.encrypt(address), "address_masked": mask_address(address)}
                if address
                else {"address_enc": None, "address_masked": None}
            )
    except (BaoError, OSError) as exc:
        raise ActionError("Két mã hóa dữ liệu cá nhân tạm thời không truy cập được", "pii-unavailable", 503) from exc
    if "bank_name" in args and args["bank_name"] is not None:
        changes["bank_name"] = args["bank_name"].strip() or None
    if changes:
        bind_session(conn, session)
        sets = ", ".join(f"{k} = %s" for k in changes)
        conn.execute(f"UPDATE hr.onboarding_request SET {sets} WHERE id = %s", (*changes.values(), request_id))
    return _result(conn, request_id)


def reveal_onboarding_private(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    request_id = args["request_id"]
    person, row = _request(
        conn,
        request_id,
        session,
        "tenant_id, national_id_enc, bank_account_enc, address_enc, initial_password_enc, username",
    )
    if not conn.execute("SELECT hr.can_read_private(%s, %s)", (request_id, person)).fetchone()[0]:
        raise ActionError("Cần quyền xem dữ liệu cá nhân của hồ sơ nhân sự", "forbidden", 403)
    tenant, *encrypted, username = row
    names = ("national_id", "bank_account", "address", "initial_password")
    cipher = _cipher(ctx)
    try:
        plain = {n: cipher.decrypt(v) if v else None for n, v in zip(names, encrypted, strict=True)}
    except (BaoError, OSError) as exc:
        raise ActionError("Két mã hóa dữ liệu cá nhân tạm thời không truy cập được", "pii-unavailable", 503) from exc
    fields = [n for n in names if plain[n] is not None]
    bind_session(conn, session)
    conn.execute(
        "INSERT INTO hr.private_access (tenant_id, request_id, person_id, fields) VALUES (%s, %s, %s, %s)",
        (tenant, request_id, person, fields),
    )
    return {"request_id": request_id, "username": username, **plain}


def submit_onboarding_request(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _request(conn, args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.submit_onboarding_request(%s, %s)", (args["request_id"], person))
    return _result(conn, args["request_id"])


def cancel_onboarding_request(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _request(conn, args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.cancel_onboarding_request(%s, %s, %s)", (args["request_id"], person, args["reason"]))
    return _result(conn, args["request_id"])


def retry_onboarding_account(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _request(conn, args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.retry_onboarding_account(%s, %s, %s)", (args["request_id"], person, args.get("username")))
    return _result(conn, args["request_id"])


def _result(conn: psycopg.Connection, request_id: str) -> dict:
    status, account = conn.execute(
        "SELECT status, account_status FROM hr.onboarding_request WHERE id = %s", (request_id,)
    ).fetchone()
    return {"request_id": request_id, "status": status, "account_status": account}


HANDLERS = {
    "save_onboarding_private": save_onboarding_private,
    "reveal_onboarding_private": reveal_onboarding_private,
    "submit_onboarding_request": submit_onboarding_request,
    "cancel_onboarding_request": cancel_onboarding_request,
    "retry_onboarding_account": retry_onboarding_account,
}
