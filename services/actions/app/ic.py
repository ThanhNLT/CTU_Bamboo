# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Hasura Action cho đơn hàng nội bộ (ADR #42): bên bán xác nhận kèm lô xuất hoặc từ chối, bên mua hủy.

Mọi kiểm tra nghiệp vụ (quyền ic.order.confirm, người đặt, lô của công ty bán, đủ số lượng) nằm trong hàm CSDL
ic.confirm_order / ic.reject_order / ic.cancel_order; ở đây chỉ chặn đơn khác tenant hoặc không xem được.
"""

import json

import psycopg

from .common import ActionError, Context, bind_session, require_read, session_identity

ENTITY = "ic.ic_order"


def _order(conn: psycopg.Connection, session: dict, order_id: str) -> str:
    row = conn.execute("SELECT tenant_id FROM ic.ic_order WHERE id = %s", (order_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, ENTITY, order_id, person)
    bind_session(conn, session)
    return person


def _result(conn: psycopg.Connection, order_id: str, purchase_order_id=None) -> dict:
    status = conn.execute("SELECT status FROM ic.ic_order WHERE id = %s", (order_id,)).fetchone()[0]
    return {"order_id": order_id, "status": status,
            "purchase_order_id": str(purchase_order_id) if purchase_order_id else None}


def confirm_ic_order(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    order_id = args["order_id"]
    person = _order(conn, session, order_id)
    lots: dict[str, str] = {}
    for entry in args.get("lots") or []:
        if entry["line_id"] in lots:
            raise ActionError("Mỗi dòng hàng chỉ chọn một lô", "rejected")
        lots[entry["line_id"]] = entry["lot_id"]
    po = conn.execute("SELECT ic.confirm_order(%s, %s, %s::jsonb)",
                      (order_id, person, json.dumps(lots))).fetchone()[0]
    return _result(conn, order_id, po)


def reject_ic_order(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    order_id = args["order_id"]
    person = _order(conn, session, order_id)
    conn.execute("SELECT ic.reject_order(%s, %s, %s)", (order_id, person, args["reason"]))
    return _result(conn, order_id)


def cancel_ic_order(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    order_id = args["order_id"]
    person = _order(conn, session, order_id)
    conn.execute("SELECT ic.cancel_order(%s, %s, %s)", (order_id, person, args["reason"]))
    return _result(conn, order_id)


HANDLERS = {
    "confirm_ic_order": confirm_ic_order,
    "reject_ic_order": reject_ic_order,
    "cancel_ic_order": cancel_ic_order,
}
