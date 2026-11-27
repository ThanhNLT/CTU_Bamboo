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

"""Nhận hàng, hóa đơn nhà cung cấp, thanh toán, đối trừ công nợ nội bộ và quy tắc hạn mức duyệt (ADR #96).

Nghiệp vụ và kiểm quyền nằm trong CSDL (migration 067: `proc.post_goods_receipt`, `fin.record_invoice`,
`fin.record_payment`, `fin.void_invoice`, `fin.run_netting`, `wf.replace_approval_rules`); Action chỉ lấy danh tính
trong phiên, kiểm chứng từ thuộc tenant của phiên và gọi hàm.
"""

import json
from decimal import Decimal, InvalidOperation

import psycopg

from .common import ActionError, Context, bind_session, session_identity

PROCESSES = ("PURCHASE_REQUEST", "ONBOARDING", "KB_DOCUMENT")


def _tenant_of(conn: psycopg.Connection, table: str, row_id: str):
    row = conn.execute(f"SELECT tenant_id FROM {table} WHERE id = %s", (row_id,)).fetchone()
    return row[0] if row else None


def _person(conn: psycopg.Connection, session: dict, table: str, row_id: str) -> str:
    person = session_identity(session, _tenant_of(conn, table, row_id))
    bind_session(conn, session)
    return person


def _me(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    return person, tenant


def _amount(value) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ActionError("Số tiền hoặc số lượng phải là số lớn hơn 0", "bad-request") from exc
    if not amount.is_finite() or amount <= 0:
        raise ActionError("Số tiền hoặc số lượng phải là số lớn hơn 0", "bad-request")
    return amount


def _doc(conn: psycopg.Connection, table: str, row_id) -> dict:
    doc_no = conn.execute(f"SELECT doc_no FROM {table} WHERE id = %s", (row_id,)).fetchone()[0]
    return {"id": str(row_id), "doc_no": doc_no}


def post_goods_receipt(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _person(conn, session, "proc.purchase_request", args["request_id"])
    lines = args.get("lines") or []
    if not isinstance(lines, list) or not lines:
        raise ActionError("Phiếu nhận hàng cần ít nhất một dòng", "bad-request")
    clean = []
    for line in lines:
        if not isinstance(line, dict) or not line.get("request_item_id"):
            raise ActionError("Dòng nhận hàng thiếu mã dòng đề nghị", "bad-request")
        clean.append({"request_item_id": line["request_item_id"], "quantity": str(_amount(line.get("quantity")))})
    receipt = conn.execute(
        "SELECT proc.post_goods_receipt(%s, %s, %s::jsonb, %s)",
        (args["request_id"], person, json.dumps(clean), args.get("note")),
    ).fetchone()[0]
    return _doc(conn, "proc.goods_receipt", receipt)


def record_invoice(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _person(conn, session, "proc.purchase_request", args["request_id"])
    number = (args.get("supplier_invoice_no") or "").strip()
    if not number:
        raise ActionError("Nhập số hóa đơn của nhà cung cấp", "bad-request")
    invoice = conn.execute(
        "SELECT fin.record_invoice(%s, %s, %s, %s, %s, %s)",
        (
            args["request_id"],
            person,
            number,
            args["invoice_date"],
            _amount(args.get("amount")),
            args.get("due_date"),
        ),
    ).fetchone()[0]
    return _doc(conn, "fin.invoice", invoice)


def void_invoice(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _person(conn, session, "fin.invoice", args["invoice_id"])
    conn.execute("SELECT fin.void_invoice(%s, %s)", (args["invoice_id"], person))
    return _doc(conn, "fin.invoice", args["invoice_id"])


def record_payment(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _person(conn, session, "fin.invoice", args["invoice_id"])
    method = (args.get("method") or "TRANSFER").upper()
    if method not in ("TRANSFER", "CASH"):
        raise ActionError("Hình thức thanh toán là chuyển khoản hoặc tiền mặt", "bad-request")
    payment = conn.execute(
        "SELECT fin.record_payment(%s, %s, %s, %s, %s)",
        (args["invoice_id"], person, _amount(args.get("amount")), method, args.get("reference")),
    ).fetchone()[0]
    return _doc(conn, "fin.payment", payment)


def netting_overview(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    """Pháp nhân trong tenant và công nợ nội bộ hai chiều còn mở giữa từng cặp người gọi được xem."""
    person, tenant = _me(conn, session)
    companies = conn.execute(
        """SELECT u.id::text, u.name,
                  core.has_permission(%(p)s, 'fin.payable.read', u.id) OR core.has_permission(%(p)s, 'fin.payable.manage', u.id),
                  core.has_permission(%(p)s, 'fin.payable.manage', u.id)
           FROM core.org_unit u
           WHERE u.tenant_id = %(t)s AND u.is_legal_entity AND u.valid_period @> now()
           ORDER BY u.path""",
        {"p": person, "t": tenant},
    ).fetchall()
    visible = {c[0] for c in companies if c[2]}
    manage = {c[0] for c in companies if c[3]}
    pairs = conn.execute(
        """SELECT least(company_id, seller_company_id)::text a, greatest(company_id, seller_company_id)::text b
           FROM fin.invoice
           WHERE tenant_id = %s AND seller_company_id IS NOT NULL AND status IN ('OPEN', 'PARTIAL')
           GROUP BY 1, 2""",
        (tenant,),
    ).fetchall()
    positions = []
    for a, b in pairs:
        if a not in visible and b not in visible:
            continue
        ab, ba, net = conn.execute("SELECT * FROM fin.netting_position(%s, %s, %s)", (tenant, a, b)).fetchone()
        positions.append(
            {
                "company_a": a,
                "company_b": b,
                "a_owes_b": str(ab),
                "b_owes_a": str(ba),
                "nettable": str(net),
                "can_run": a in manage and b in manage and net > 0,
            }
        )
    return {
        "data": {
            "companies": [{"id": c[0], "name": c[1]} for c in companies],
            "positions": positions,
        }
    }


def run_netting(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _me(conn, session)
    netting = conn.execute(
        "SELECT fin.run_netting(%s, %s, %s, %s, %s)",
        (tenant, args["company_a"], args["company_b"], person, args.get("note")),
    ).fetchone()[0]
    return _doc(conn, "fin.netting", netting)


def _rules(conn: psycopg.Connection, person: str, tenant: str, process: str) -> dict:
    rows = conn.execute(
        """SELECT ar.min_amount, ar.max_amount, ar.step_order, ci.code, ci.name
           FROM wf.approval_rule ar LEFT JOIN core.catalog_item ci ON ci.id = ar.approver_unit_type_id
           WHERE ar.tenant_id = %s AND ar.process_code = %s AND ar.scope_unit_id IS NULL AND ar.category_code IS NULL
             AND ar.valid_period @> now()
           ORDER BY ar.min_amount, ar.step_order""",
        (tenant, process),
    ).fetchall()
    types = conn.execute(
        """SELECT code, name FROM core.catalog_item WHERE tenant_id = %s AND catalog = 'UNIT_TYPE' ORDER BY name""",
        (tenant,),
    ).fetchall()
    root = conn.execute(
        """SELECT id FROM core.org_unit WHERE tenant_id = %s AND parent_id IS NULL AND valid_period @> now()
           ORDER BY path LIMIT 1""",
        (tenant,),
    ).fetchone()
    can_manage = (
        bool(root)
        and conn.execute("SELECT core.has_permission(%s, 'wf.approval_rule.manage', %s)", (person, root[0])).fetchone()[
            0
        ]
    )
    return {
        "data": {
            "process_code": process,
            "can_manage": can_manage,
            "rules": [
                {
                    "min_amount": str(r[0]),
                    "max_amount": None if r[1] is None else str(r[1]),
                    "step_order": r[2],
                    "approver_unit_type": r[3],
                    "approver_unit_type_name": r[4],
                }
                for r in rows
            ],
            "unit_types": [{"code": t[0], "name": t[1]} for t in types],
        }
    }


def _process(args: dict) -> str:
    process = (args.get("process_code") or "").upper()
    if process not in PROCESSES:
        raise ActionError(f"Quy trình không hỗ trợ: {process or '(trống)'}", "bad-request")
    return process


def approval_rules(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _me(conn, session)
    return _rules(conn, person, tenant, _process(args))


def save_approval_rules(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _me(conn, session)
    process = _process(args)
    rules = args.get("rules") or []
    if not isinstance(rules, list) or not rules:
        raise ActionError("Cần ít nhất một quy tắc", "bad-request")
    clean = []
    for rule in rules:
        if not isinstance(rule, dict):
            raise ActionError("Quy tắc không hợp lệ", "bad-request")
        low = Decimal(str(rule.get("min_amount") or 0))
        high = rule.get("max_amount")
        high = None if high in (None, "") else Decimal(str(high))
        if low < 0 or (high is not None and high <= low):
            raise ActionError("Mức tối đa phải lớn hơn mức tối thiểu, không âm", "bad-request")
        step = int(rule.get("step_order") or 1)
        if step < 1:
            raise ActionError("Bước duyệt bắt đầu từ 1", "bad-request")
        clean.append(
            {
                "min_amount": str(low),
                "max_amount": None if high is None else str(high),
                "step_order": step,
                "approver_unit_type": rule.get("approver_unit_type") or None,
            }
        )
    conn.execute(
        "SELECT wf.replace_approval_rules(%s, %s, %s, NULL, %s::jsonb)", (tenant, person, process, json.dumps(clean))
    )
    return _rules(conn, person, tenant, process)


HANDLERS = {
    "post_goods_receipt": post_goods_receipt,
    "record_invoice": record_invoice,
    "void_invoice": void_invoice,
    "record_payment": record_payment,
    "netting_overview": netting_overview,
    "run_netting": run_netting,
    "approval_rules": approval_rules,
    "save_approval_rules": save_approval_rules,
}
