# Bamboo - DX-OS Open-Core
# @version 0.5.2
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
    return {
        "order_id": order_id,
        "status": status,
        "purchase_order_id": str(purchase_order_id) if purchase_order_id else None,
    }


def confirm_ic_order(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    order_id = args["order_id"]
    person = _order(conn, session, order_id)
    lots: dict[str, str] = {}
    for entry in args.get("lots") or []:
        if entry["line_id"] in lots:
            raise ActionError("Mỗi dòng hàng chỉ chọn một lô", "rejected")
        lots[entry["line_id"]] = entry["lot_id"]
    po = conn.execute("SELECT ic.confirm_order(%s, %s, %s::jsonb)", (order_id, person, json.dumps(lots))).fetchone()[0]
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
