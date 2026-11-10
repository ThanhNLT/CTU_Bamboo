# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import psycopg

from bamboo_common.pii import mask_tail

from .common import ActionError, Context, session_identity
from .pii_guard import LABELS, guard

MAX_IDS = 100
CIPHERTEXT = "[bản mã]"
KEY_LABELS = {
    "date_of_birth": "Ngày sinh",
    "phone": "Số điện thoại",
    "work_email": "Email",
    "email": "Email",
    "_enc": "Bản mã",
}


def _require_reader(conn: psycopg.Connection, session: dict) -> str:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if not conn.execute(
        "SELECT 1 FROM audit.v_reader WHERE tenant_id = %s AND person_id = %s", (tenant, person)
    ).fetchone():
        raise ActionError("Cần quyền audit.read để xem nhật ký kiểm toán", "forbidden", 403)
    return tenant


def verify_audit_chain(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    tenant = _require_reader(conn, session)
    problems = conn.execute("SELECT seq, log_id, problem FROM audit.verify_chain(%s)", (tenant,)).fetchall()
    checked = conn.execute("SELECT count(*) FROM audit.log WHERE tenant_id = %s", (tenant,)).fetchone()[0]
    head = conn.execute(
        "SELECT seq, encode(hash, 'hex') FROM audit.chain_head WHERE tenant_id = %s", (tenant,)
    ).fetchone()
    return {
        "tenant_id": tenant,
        "ok": not problems,
        "checked": checked,
        "head_seq": head[0] if head else 0,
        "head_hash": head[1] if head else None,
        "problems": [{"seq": p[0], "log_id": p[1], "problem": p[2]} for p in problems],
    }


def _mask_column(key: str, value, found: set[str]):
    if value is None or value == "":
        return value
    if key.endswith("_enc"):
        found.add(KEY_LABELS["_enc"])
        return CIPHERTEXT
    if key == "date_of_birth" and isinstance(value, str):
        found.add(KEY_LABELS[key])
        return "••/••/" + value[:4]
    masked, entities = guard().mask_json(value)
    found.update(LABELS[e] for e in entities)
    if key in KEY_LABELS and masked == value and isinstance(value, str):
        found.add(KEY_LABELS[key])
        return mask_tail(value, 3)
    return masked


def mask_row(data: dict | None) -> tuple[dict | None, set[str]]:
    found: set[str] = set()
    if data is None:
        return None, found
    return {k: _mask_column(k, v, found) for k, v in data.items()}, found


def audit_log_detail(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> list[dict]:
    tenant = _require_reader(conn, session)
    ids = list(dict.fromkeys(args.get("log_ids") or []))
    if len(ids) > MAX_IDS:
        raise ActionError(f"Tối đa {MAX_IDS} dòng nhật ký mỗi lần", "rejected")
    rows = conn.execute(
        """SELECT id, table_name, old_data, new_data FROM audit.log
                           WHERE tenant_id = %s AND id = ANY(%s) ORDER BY id""",
        (tenant, ids),
    ).fetchall()
    result = []
    for log_id, table, old, new in rows:
        old_masked, found_old = mask_row(old)
        new_masked, found_new = mask_row(new)
        result.append(
            {
                "log_id": log_id,
                "table_name": table,
                "old_data": old_masked,
                "new_data": new_masked,
                "masked": sorted(found_old | found_new),
            }
        )
    return result


HANDLERS = {
    "verify_audit_chain": verify_audit_chain,
    "audit_log_detail": audit_log_detail,
}
