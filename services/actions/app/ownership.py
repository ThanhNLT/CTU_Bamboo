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

"""Việc chỉ chủ sở hữu công ty làm được (ADR #57): chuyển quyền chủ sở hữu, tạo công ty thành viên."""

import logging
import re

import psycopg

from . import legal_sign
from .common import ActionError, Context
from .hr_account import AccountConflict, temporary_password
from .setup import FIRST_LOGIN, _account, _text

log = logging.getLogger("ownership")

_TENANT_CODE = re.compile(r"^[A-Z][A-Z0-9_]{1,19}$")
ATTRIBUTE = "bamboo_subsidiary"


def _owner(conn: psycopg.Connection, session: dict) -> tuple[str, str, str]:
    person, tenant = session.get("x-hasura-user-id"), session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    row = conn.execute(
        """SELECT t.code FROM core.tenant_owner o JOIN core.tenant t ON t.id = o.tenant_id
           WHERE o.tenant_id = %s AND o.person_id = %s FOR UPDATE OF o""",
        (tenant, person),
    ).fetchone()
    if row is None:
        raise ActionError("Chỉ chủ sở hữu công ty làm được việc này", "forbidden", 403)
    return person, tenant, row[0]


def transfer_ownership(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant, _code = _owner(conn, session)
    target = conn.execute(
        """SELECT p.id, p.full_name FROM core.person p
           WHERE p.tenant_id = %s AND p.id = %s AND p.idp_subject IS NOT NULL
             AND EXISTS (SELECT FROM core.assignment a WHERE a.person_id = p.id AND a.valid_period @> now())""",
        (tenant, args["person_id"]),
    ).fetchone()
    if target is None:
        raise ActionError("Người nhận phải đang làm việc ở công ty và đã có tài khoản đăng nhập", "bad-request")
    if str(target[0]) == person:
        raise ActionError("Bạn đang là chủ sở hữu", "bad-request")
    old = conn.execute("SELECT full_name FROM core.person WHERE id = %s", (person,)).fetchone()[0]
    conn.execute("UPDATE core.tenant_owner SET person_id = %s, since = now() WHERE tenant_id = %s", (target[0], tenant))
    conn.execute(
        "SELECT core.notify_security(%s, %s, %s)",
        (
            tenant,
            "Đã chuyển quyền chủ sở hữu công ty",
            f"{old} chuyển quyền chủ sở hữu cho {target[1]}. Từ nay chỉ {target[1]} trao, thu hồi được quyền quản trị.",
        ),
    )
    log.warning("công ty %s: chuyển quyền chủ sở hữu từ %s sang %s", tenant, person, target[0])
    return {"owner_id": str(target[0]), "owner_name": target[1]}


def _company(args: dict) -> dict:
    code = str(args.get("code") or "").strip().upper()
    if not _TENANT_CODE.match(code):
        raise ActionError("Mã công ty viết hoa không dấu, bắt đầu bằng chữ, 2-20 ký tự (ví dụ ABC_SX)")
    out = {
        "code": code,
        "name": _text(args, "name", "tên công ty", 200),
        "root_type": str(args.get("root_type") or "CONG_TY").strip().upper(),
        "tax_code": re.sub(r"\s", "", str(args.get("tax_code") or "")) or None,
        "legal_name": _text(args, "legal_name", "tên doanh nghiệp", 300, required=False),
        "address": _text(args, "address", "địa chỉ trụ sở", 500, required=False),
        "legal_rep_name": _text(args, "legal_rep_name", "người đại diện theo pháp luật", 200, required=False),
    }
    if out["tax_code"] and not legal_sign.TAX_CODE.match(out["tax_code"]):
        raise ActionError("Mã số thuế gồm 10 chữ số (hoặc 13 với chi nhánh, dạng 0101234567-001)")
    if out["tax_code"] and not (out["legal_name"] and out["address"] and out["legal_rep_name"]):
        raise ActionError("Khai mã số thuế thì khai đủ tên doanh nghiệp, địa chỉ, người đại diện theo pháp luật")
    return out


def create_subsidiary(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Công ty thành viên trực thuộc công ty của chủ sở hữu, kèm chủ sở hữu của nó (ghế Giám đốc). Tài khoản đã thuộc
    một người của công ty mẹ thì dùng chung (một người làm ở nhiều công ty cùng công ty mẹ, ADR #30)."""
    _person, tenant, parent_code = _owner(conn, session)
    company = _company(args)
    account = _account(args.get("owner") or {}, "chủ sở hữu công ty thành viên", with_name=True)
    if conn.execute("SELECT 1 FROM core.tenant WHERE code = %s", (company["code"],)).fetchone():
        raise ActionError(f"Mã công ty {company['code']} đã có", "conflict", 409)
    if (
        company["tax_code"]
        and conn.execute("SELECT 1 FROM core.tenant WHERE tax_code = %s", (company["tax_code"],)).fetchone()
    ):
        raise ActionError("Mã số thuế đã thuộc một công ty trên hệ thống", "conflict", 409)
    if ctx.users is None:
        raise ActionError("Máy chủ chưa cấu hình tạo tài khoản đăng nhập (bms-provisioner)", "unavailable", 503)

    existing = ctx.users.find(account["username"])
    password, created = None, None
    if existing is not None:
        same_group = conn.execute(
            "SELECT 1 FROM core.person WHERE tenant_id = %s AND idp_subject = %s", (tenant, existing["id"])
        ).fetchone()
        if same_group is None:
            raise ActionError(
                "Tên đăng nhập đã thuộc một tài khoản ngoài công ty; chọn tên khác", "account-conflict", 409
            )
        subject = existing["id"]
    else:
        password = temporary_password()
        try:
            subject = created = ctx.users.create(
                company["code"],
                account["username"],
                account["full_name"],
                account.get("email"),
                password,
                ATTRIBUTE,
                FIRST_LOGIN,
            )
        except AccountConflict as exc:
            raise ActionError(f"{exc}: chọn tên đăng nhập hoặc email khác", "account-conflict", 409) from exc
    try:
        with conn.transaction():
            tid, _root, director, _admin = conn.execute(
                "SELECT * FROM core.create_tenant(%s, %s, %s, %s)",
                (company["code"], company["name"], company["root_type"], parent_code),
            ).fetchone()
            owner = conn.execute(
                "SELECT core.place_person(%s, %s, %s, %s, %s)",
                (tid, subject, account["full_name"], f"{company['code']}-0001", director),
            ).fetchone()[0]
            conn.execute("INSERT INTO core.tenant_owner (tenant_id, person_id) VALUES (%s, %s)", (tid, owner))
            conn.execute("SELECT core.provision_tenant(%s)", (tid,))
            conn.execute(
                """INSERT INTO core.tenant_module (tenant_id, module, enabled_by)
                   SELECT %s, module, %s FROM core.tenant_module WHERE tenant_id = %s""",
                (tid, owner, tenant),
            )
            if company["tax_code"]:
                conn.execute(
                    """UPDATE core.tenant SET tax_code = %s, legal_name = %s, address = %s, legal_rep_name = %s,
                              legal_status = 'UNVERIFIED' WHERE id = %s""",
                    (company["tax_code"], company["legal_name"], company["address"], company["legal_rep_name"], tid),
                )
    except Exception:
        if created:
            try:
                ctx.users.disable(created)
            except Exception as exc:  # noqa: BLE001
                log.warning("không vô hiệu hóa được tài khoản %s: %s", created, exc)
        raise
    log.info("công ty %s tạo công ty thành viên %s", parent_code, company["code"])
    return {
        "tenant_code": company["code"],
        "tenant_name": company["name"],
        "username": account["username"],
        "password": password,
    }


HANDLERS = {
    "transfer_ownership": transfer_ownership,
    "create_subsidiary": create_subsidiary,
}
