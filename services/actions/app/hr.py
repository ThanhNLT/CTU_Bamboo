# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import re

import psycopg

from bamboo_common.openbao import BaoError
from bamboo_common.pii import mask_address, mask_tail

from .common import ActionError, Context, bind_session, require_read, session_identity

ENTITY = "hr.onboarding_request"
TRANSFER_ENTITY = "hr.transfer_request"
EDITABLE = ("DRAFT", "RETURNED")
NATIONAL_ID = re.compile(r"^(\d{9}|\d{12})$")
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


def _transfer(conn: psycopg.Connection, request_id: str, session: dict) -> tuple[str, tuple | None]:
    row = conn.execute("SELECT tenant_id FROM hr.transfer_request WHERE id = %s", (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, TRANSFER_ENTITY, request_id, person)
    return person, row


def create_transfer_request(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    row = conn.execute("SELECT tenant_id FROM core.position WHERE id = %s", (args["source_position_id"],)).fetchone()
    person = session_identity(session, row[0] if row else None)
    bind_session(conn, session)
    request_id = conn.execute(
        "SELECT hr.create_transfer_request(%s, %s, %s, %s, %s, %s)",
        (
            person,
            args["person_id"],
            args["source_position_id"],
            args["target_unit_id"],
            args["effective_date"],
            args["reason"],
        ),
    ).fetchone()[0]
    return _transfer_result(conn, str(request_id))


def submit_transfer_request(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _transfer(conn, args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.submit_transfer_request(%s, %s)", (args["request_id"], person))
    return _transfer_result(conn, args["request_id"])


def choose_transfer_position(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _transfer(conn, args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.choose_transfer_position(%s, %s, %s)", (args["request_id"], person, args["position_id"]))
    return _transfer_result(conn, args["request_id"])


def cancel_transfer_request(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _transfer(conn, args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.cancel_transfer_request(%s, %s, %s)", (args["request_id"], person, args["reason"]))
    return _transfer_result(conn, args["request_id"])


def _transfer_result(conn: psycopg.Connection, request_id: str) -> dict:
    status = conn.execute("SELECT status FROM hr.transfer_request WHERE id = %s", (request_id,)).fetchone()[0]
    return {"request_id": request_id, "status": status}


def create_transfer_out(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    row = conn.execute("SELECT tenant_id FROM core.position WHERE id = %s", (args["source_position_id"],)).fetchone()
    person = session_identity(session, row[0] if row else None)
    bind_session(conn, session)
    request_id = conn.execute(
        "SELECT hr.create_transfer_out(%s, %s, %s, %s, %s, %s, %s)",
        (
            person,
            args["person_id"],
            args["source_position_id"],
            args["target_tenant_id"],
            args["target_unit_id"],
            args["effective_date"],
            args["reason"],
        ),
    ).fetchone()[0]
    return _leg_result(conn, "hr.transfer_out", str(request_id))


def submit_transfer_out(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _leg_person(conn, "hr.transfer_out", args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.submit_transfer_out(%s, %s)", (args["request_id"], person))
    return _leg_result(conn, "hr.transfer_out", args["request_id"])


def cancel_transfer_out(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _leg_person(conn, "hr.transfer_out", args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.cancel_transfer_out(%s, %s, %s)", (args["request_id"], person, args["reason"]))
    return _leg_result(conn, "hr.transfer_out", args["request_id"])


def choose_transfer_in_position(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _leg_person(conn, "hr.transfer_in", args["request_id"], session)
    bind_session(conn, session)
    conn.execute("SELECT hr.choose_transfer_in_position(%s, %s, %s)", (args["request_id"], person, args["position_id"]))
    return _leg_result(conn, "hr.transfer_in", args["request_id"])


def transfer_tenants(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    tenant = session.get("x-hasura-tenant-id")
    session_identity(session, tenant)
    bind_session(conn, session)
    rows = conn.execute(
        """SELECT t.id, t.code, t.name FROM core.tenant t
           WHERE t.id <> %s AND core.tenant_root(t.id) = core.tenant_root(%s) ORDER BY t.name""",
        (tenant, tenant),
    ).fetchall()
    return {"tenants": [{"id": str(i), "code": c, "name": n} for i, c, n in rows]}


def transfer_target_units(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    tenant = session.get("x-hasura-tenant-id")
    session_identity(session, tenant)
    bind_session(conn, session)
    if not conn.execute("SELECT core.tenant_root(%s) = core.tenant_root(%s)", (args["tenant_id"], tenant)).fetchone()[
        0
    ]:
        raise ActionError("Tenant không cùng tập đoàn", "forbidden", 403)
    rows = conn.execute(
        """SELECT u.id, u.name, u.path::text FROM core.org_unit u
           WHERE u.tenant_id = %s AND u.valid_period @> now() ORDER BY u.path""",
        (args["tenant_id"],),
    ).fetchall()
    return {"units": [{"id": str(i), "name": n, "path": p} for i, n, p in rows]}


def _leg_person(conn: psycopg.Connection, table: str, leg_id: str, session: dict) -> str:
    row = conn.execute(f"SELECT tenant_id FROM {table} WHERE id = %s", (leg_id,)).fetchone()
    return session_identity(session, row[0] if row else None)


def _leg_result(conn: psycopg.Connection, table: str, leg_id: str) -> dict:
    status = conn.execute(f"SELECT status FROM {table} WHERE id = %s", (leg_id,)).fetchone()[0]
    return {"request_id": leg_id, "status": status}


def _decision_caller(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    return person, tenant


def issue_personnel_decision(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, _ = _decision_caller(conn, session)
    decision_id = conn.execute(
        "SELECT hr.issue_personnel_decision(%s, %s, %s, %s, %s, %s, %s, %s)",
        (
            person,
            args["decision_type"],
            args["person_id"],
            args.get("source_position_id"),
            args.get("target_position_id"),
            args.get("assignment_type"),
            args["effective_date"],
            args["reason"],
        ),
    ).fetchone()[0]
    doc_no = conn.execute("SELECT doc_no FROM hr.personnel_decision WHERE id = %s", (decision_id,)).fetchone()[0]
    return {"id": str(decision_id), "doc_no": doc_no}


def personnel_decisions(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    person, tenant = _decision_caller(conn, session)
    rows = conn.execute(
        """SELECT d.id, d.doc_no, d.decision_type, d.assignment_type, d.effective_date, d.reason, d.created_at,
                  p.full_name, p.employee_code, i.full_name,
                  src.name, su.name, dst.name, du.name
           FROM hr.personnel_decision d
           JOIN core.person p ON p.id = d.person_id
           JOIN core.person i ON i.id = d.issuer_id
           LEFT JOIN core.position src ON src.id = d.source_position_id
           LEFT JOIN core.org_unit su ON su.id = src.org_unit_id
           LEFT JOIN core.position dst ON dst.id = d.target_position_id
           LEFT JOIN core.org_unit du ON du.id = dst.org_unit_id
           WHERE d.tenant_id = %s AND (d.issuer_id = %s OR d.person_id = %s OR EXISTS (
                     SELECT 1 FROM core.position q WHERE q.id IN (d.source_position_id, d.target_position_id)
                       AND core.has_permission(%s, 'hr.decision.read', q.org_unit_id)))
           ORDER BY d.created_at DESC LIMIT 500""",
        (tenant, person, person, person),
    ).fetchall()
    keys = (
        "id",
        "doc_no",
        "decision_type",
        "assignment_type",
        "effective_date",
        "reason",
        "created_at",
        "person_name",
        "employee_code",
        "issuer_name",
        "source_position",
        "source_unit",
        "target_position",
        "target_unit",
    )
    items = []
    for row in rows:
        item = dict(zip(keys, row, strict=True))
        for key in ("id", "effective_date", "created_at"):
            item[key] = str(item[key])
        items.append(item)
    can_issue = conn.execute("SELECT hr.can_issue_decision(%s, %s)", (person, tenant)).fetchone()[0]
    return {"can_issue": bool(can_issue), "decisions": items}


def personnel_decision_context(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    person, tenant = _decision_caller(conn, session)
    if not conn.execute("SELECT hr.can_issue_decision(%s, %s)", (person, tenant)).fetchone()[0]:
        raise ActionError("Cần quyền hr.decision.issue để ban hành quyết định nhân sự", "forbidden", 403)
    people = conn.execute(
        """SELECT p.id, p.full_name, p.employee_code,
                  coalesce(jsonb_agg(jsonb_build_object('position_id', pos.id, 'position', pos.name,
                                                        'unit', u.name, 'type', a.assignment_type)
                                     ORDER BY a.assignment_type) FILTER (WHERE a.id IS NOT NULL), '[]')
           FROM core.person p
           LEFT JOIN core.assignment a ON a.person_id = p.id AND a.valid_period @> now()
                AND a.assignment_type IN ('PRIMARY', 'CONCURRENT', 'ACTING')
           LEFT JOIN core.position pos ON pos.id = a.position_id
           LEFT JOIN core.org_unit u ON u.id = pos.org_unit_id
           WHERE p.tenant_id = %s AND p.id <> %s
           GROUP BY p.id
           HAVING count(a.id) = 0 OR bool_or(core.has_permission(%s, 'hr.decision.issue', pos.org_unit_id))
           ORDER BY p.full_name LIMIT 3000""",
        (tenant, person, person),
    ).fetchall()
    positions = conn.execute(
        """SELECT pos.id, pos.name, u.name, pos.is_head,
                  (SELECT string_agg(h.full_name, ', ') FROM core.assignment a
                   JOIN core.person h ON h.id = a.person_id
                   WHERE a.position_id = pos.id AND a.valid_period @> now()
                     AND a.assignment_type IN ('PRIMARY', 'CONCURRENT', 'ACTING'))
           FROM core.position pos JOIN core.org_unit u ON u.id = pos.org_unit_id
           WHERE pos.tenant_id = %s AND pos.valid_period @> now()
             AND core.has_permission(%s, 'hr.decision.issue', pos.org_unit_id)
           ORDER BY u.path, pos.is_head DESC, pos.name
           LIMIT 5000""",
        (tenant, person),
    ).fetchall()
    return {
        "people": [{"id": str(i), "full_name": n, "employee_code": c, "assignments": a} for i, n, c, a in people],
        "positions": [
            {"id": str(i), "name": n, "unit": u, "is_head": h, "holder": holder} for i, n, u, h, holder in positions
        ],
    }


HANDLERS = {
    "save_onboarding_private": save_onboarding_private,
    "reveal_onboarding_private": reveal_onboarding_private,
    "submit_onboarding_request": submit_onboarding_request,
    "cancel_onboarding_request": cancel_onboarding_request,
    "retry_onboarding_account": retry_onboarding_account,
    "create_transfer_request": create_transfer_request,
    "submit_transfer_request": submit_transfer_request,
    "choose_transfer_position": choose_transfer_position,
    "cancel_transfer_request": cancel_transfer_request,
    "create_transfer_out": create_transfer_out,
    "submit_transfer_out": submit_transfer_out,
    "cancel_transfer_out": cancel_transfer_out,
    "choose_transfer_in_position": choose_transfer_in_position,
    "transfer_tenants": transfer_tenants,
    "transfer_target_units": transfer_target_units,
    "issue_personnel_decision": issue_personnel_decision,
    "personnel_decisions": personnel_decisions,
    "personnel_decision_context": personnel_decision_context,
}
