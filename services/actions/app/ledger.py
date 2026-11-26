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

import hashlib
import re

import psycopg
from psycopg.rows import dict_row

from .common import ActionError, Context, session_identity

SHA256 = re.compile(r"^[0-9a-f]{64}$")
CODE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,63}?)(?:\s*(?:·|@|,|#)?\s*v(\d{1,4}))?\s*$", re.IGNORECASE)
FINAL = ("APPROVED", "REJECTED", "CANCELLED")
VIEW_TTL = 60
MAX_RECENT = 100
TZ = "Asia/Ho_Chi_Minh"

_DOCS = """
WITH docs AS (
    SELECT 'proc.purchase_request' AS entity_type, r.id AS entity_id, r.doc_no, r.title, r.status,
           u.name AS unit, r.updated_at, false AS restricted
    FROM proc.purchase_request r JOIN core.org_unit u ON u.id = r.org_unit_id
    WHERE r.tenant_id = %(tenant)s
    UNION ALL
    SELECT 'hr.onboarding_request', o.id, o.doc_no, 'Tiếp nhận nhân sự: ' || o.full_name, o.status,
           u.name, o.updated_at, true
    FROM hr.onboarding_request o JOIN core.org_unit u ON u.id = o.org_unit_id
    WHERE o.tenant_id = %(tenant)s
),
seals AS (
    SELECT a.id AS attachment_id, a.entity_type, a.entity_id, a.file_name, a.content_type, a.size_bytes,
           a.sha256, a.storage_key, a.scanned_at,
           row_number() OVER (PARTITION BY a.entity_id ORDER BY a.scanned_at, a.id) AS version,
           d.doc_no, d.title, d.status, d.unit, d.updated_at, d.restricted
    FROM core.attachment a
    JOIN docs d ON d.entity_type = a.entity_type AND d.entity_id = a.entity_id
    WHERE a.tenant_id = %(tenant)s AND a.status = 'CLEAN' AND a.scan_engines <> '{unscanned}' AND a.deleted_at IS NULL
      AND wf.entity_can_read(a.entity_type, a.entity_id, %(person)s)
)
"""

_SEAL_COLUMNS = """
    s.attachment_id, s.entity_type, s.entity_id, s.file_name, s.content_type, s.size_bytes, s.sha256, s.storage_key,
    s.version, s.doc_no, s.title, s.status, s.unit,
    to_char(s.scanned_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD-Mon-YYYY HH24:MI') AS sealed_at,
    seal.id AS log_id, seal.seq AS block, encode(seal.hash, 'hex') AS tx_id, seal.new_data ->> 'sha256' AS sealed_sha256,
    last.result AS last_result,
    to_char(last.checked_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD-Mon-YYYY HH24:MI') AS last_checked_at
"""
_SEAL_JOINS = """
    LEFT JOIN LATERAL audit.attachment_seal(s.attachment_id) seal ON true
    LEFT JOIN LATERAL (SELECT c.result, c.checked_at FROM audit.ledger_check c
                       WHERE c.attachment_id = s.attachment_id AND c.via = 'code'
                       ORDER BY c.checked_at DESC LIMIT 1) last ON true
"""


def _caller(conn: psycopg.Connection, session: dict) -> tuple[str, str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    code = conn.execute("SELECT code FROM core.tenant WHERE id = %s", (tenant,)).fetchone()
    return person, tenant, code[0] if code else ""


def _seal(row: dict, channel: str) -> dict:
    return {
        "attachment_id": str(row["attachment_id"]),
        "entity_type": row["entity_type"],
        "entity_id": str(row["entity_id"]),
        "code": row["doc_no"],
        "version": row["version"],
        "title": row["title"],
        "file_name": row["file_name"],
        "unit": row["unit"],
        "sealed_at": row["sealed_at"],
        "channel": channel,
        "block": row["block"],
        "tx_id": row["tx_id"],
        "sha256": row["sealed_sha256"] or row["sha256"],
        "last_result": row["last_result"],
        "last_checked_at": row["last_checked_at"],
    }


def _seals(
    conn: psycopg.Connection,
    person: str,
    tenant: str,
    where: str = "",
    params: dict | None = None,
    order: str = "s.scanned_at DESC, s.attachment_id",
    limit: int = MAX_RECENT,
) -> list[dict]:
    cur = conn.cursor(row_factory=dict_row)
    sql = f"{_DOCS} SELECT {_SEAL_COLUMNS} FROM seals s {_SEAL_JOINS} {where} ORDER BY {order} LIMIT %(limit)s"
    return cur.execute(sql, {"tenant": tenant, "person": person, "limit": limit, **(params or {})}).fetchall()


def _is_audit_reader(conn: psycopg.Connection, person: str, tenant: str) -> bool:
    return bool(
        conn.execute(
            "SELECT 1 FROM audit.v_reader WHERE tenant_id = %s AND person_id = %s", (tenant, person)
        ).fetchone()
    )


def ledger_overview(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant, channel = _caller(conn, session)
    limit = max(1, min(int(args.get("limit") or 20), MAX_RECENT))
    recent = _seals(conn, person, tenant, limit=limit)
    cur = conn.cursor(row_factory=dict_row)
    counts = cur.execute(
        f"""{_DOCS}
            SELECT count(*) AS sealed,
                   count(*) FILTER (WHERE s.scanned_at >= now() - interval '7 days') AS sealed_this_week,
                   count(*) FILTER (WHERE s.status IN ('APPROVED', 'REJECTED', 'CANCELLED')) AS archived
            FROM seals s""",
        {"tenant": tenant, "person": person},
    ).fetchone()
    checks = cur.execute(
        """SELECT count(*) FILTER (WHERE checked_at >= date_trunc('day', now() AT TIME ZONE %(tz)s) AT TIME ZONE %(tz)s)
                      AS checked_today,
                  count(*) FILTER (WHERE result = 'match'
                                     AND checked_at >= date_trunc('day', now() AT TIME ZONE %(tz)s) AT TIME ZONE %(tz)s)
                      AS matched_today,
                  count(*) FILTER (WHERE result = 'mismatch'
                                     AND checked_at >= date_trunc('day', now() AT TIME ZONE %(tz)s) AT TIME ZONE %(tz)s)
                      AS mismatched_today,
                  count(*) FILTER (WHERE result = 'mismatch' AND checked_at >= now() - interval '30 days')
                      AS mismatch_30d
           FROM audit.ledger_check WHERE tenant_id = %(tenant)s""",
        {"tenant": tenant, "tz": TZ},
    ).fetchone()
    return {
        **counts,
        **checks,
        "channel": channel,
        "chain_reader": _is_audit_reader(conn, person, tenant),
        "recent": [_seal(r, channel) for r in recent],
    }


def ledger_verify(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant, channel = _caller(conn, session)
    sha = (args.get("sha256") or "").strip().lower()
    code = (args.get("code") or "").strip()
    file_name = (args.get("file_name") or "").strip()[:255] or None
    if bool(sha) == bool(code):
        raise ActionError("Nhập mã hồ sơ hoặc đưa vào một tệp (chỉ một trong hai)")

    if sha:
        if not SHA256.match(sha):
            raise ActionError("SHA-256 phải gồm 64 ký tự thập lục phân")
        via, query = "file", file_name or sha
        rows = _seals(conn, person, tenant, "WHERE s.sha256 = %(sha)s", {"sha": sha}, limit=1)
        actual, problem = sha, None
    else:
        m = CODE.match(code)
        if not m:
            raise ActionError("Mã hồ sơ không hợp lệ")
        via, query = "code", code
        version = int(args["version"]) if args.get("version") else (int(m.group(2)) if m.group(2) else None)
        where = "WHERE upper(s.doc_no) = upper(%(code)s)" + (" AND s.version = %(version)s" if version else "")
        rows = _seals(
            conn, person, tenant, where, {"code": m.group(1), "version": version}, order="s.version DESC", limit=1
        )
        actual, problem = None, None

    seal = rows[0] if rows else None
    if seal is None:
        result, expected = "not_found", None
    else:
        expected = seal["sealed_sha256"]
        if via == "code":
            if ctx.storage is None:
                raise ActionError("Chưa cấu hình lưu trữ tệp", "unavailable", 503)
            data = ctx.storage.read_stored(seal["storage_key"])
            if data is None:
                problem = "Tệp không còn trong kho lưu trữ"
            else:
                actual = hashlib.sha256(data).hexdigest()
        intact = (
            seal["log_id"] is not None
            and conn.execute("SELECT audit.entry_intact(%s)", (seal["log_id"],)).fetchone()[0]
        )
        if expected is None:
            problem = problem or "Không có bản niêm phong trong nhật ký kiểm toán"
        elif not intact:
            problem = problem or "Bản niêm phong không còn nguyên trong chuỗi hash kiểm toán"
        elif seal["sha256"] != expected:
            problem = problem or "SHA-256 trong CSDL khác bản niêm phong"
        result = "match" if problem is None and actual == expected else "mismatch"

    conn.execute(
        "SELECT audit.add_ledger_check(%s, %s, %s, %s, %s, %s, %s, %s)",
        (tenant, seal["attachment_id"] if seal else None, via, query, result, expected, actual, person),
    )
    checked_at = conn.execute("SELECT to_char(now() AT TIME ZONE %s, 'DD-Mon-YYYY HH24:MI')", (TZ,)).fetchone()[0]
    return {
        "kind": result,
        "via": via,
        "query": query,
        "file_name": file_name,
        "checked_at": checked_at,
        "actual_sha256": actual,
        "problem": problem,
        "seal": _seal({**seal, "last_result": result, "last_checked_at": checked_at}, channel) if seal else None,
    }


def ledger_archive(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant, _ = _caller(conn, session)
    limit = max(1, min(int(args.get("limit") or 50), 200))
    cur = conn.cursor(row_factory=dict_row)
    docs = cur.execute(
        f"""{_DOCS}
            SELECT s.attachment_id, s.doc_no AS code, s.title, s.file_name, s.content_type, s.size_bytes, s.unit, s.restricted,
                   s.status, extract(year FROM s.updated_at AT TIME ZONE %(tz)s)::int AS archived_year
            FROM seals s WHERE s.status = ANY(%(final)s)
            ORDER BY s.updated_at DESC, s.attachment_id LIMIT %(limit)s""",
        {"tenant": tenant, "person": person, "final": list(FINAL), "limit": limit, "tz": TZ},
    ).fetchall()
    access = cur.execute(
        f"""{_DOCS}
            SELECT x.id, s.title AS doc_title, s.file_name, p.full_name AS viewer,
                   to_char(x.opened_at AT TIME ZONE %(tz)s, 'DD-Mon-YYYY HH24:MI') AS opened_at
            FROM audit.archive_access x
            JOIN seals s ON s.attachment_id = x.attachment_id
            JOIN core.person p ON p.id = x.person_id
            WHERE x.tenant_id = %(tenant)s
            ORDER BY x.opened_at DESC LIMIT 20""",
        {"tenant": tenant, "person": person, "tz": TZ},
    ).fetchall()
    return {
        "docs": [{**d, "attachment_id": str(d["attachment_id"])} for d in docs],
        "access": [{**a, "id": str(a["id"])} for a in access],
    }


def ledger_open_archive(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant, _ = _caller(conn, session)
    if ctx.storage is None:
        raise ActionError("Chưa cấu hình lưu trữ tệp", "unavailable", 503)
    cur = conn.cursor(row_factory=dict_row)
    doc = cur.execute(
        f"""{_DOCS}
            SELECT s.attachment_id, s.storage_key, s.file_name, s.content_type, s.title, s.status
            FROM seals s WHERE s.attachment_id = %(id)s""",
        {"tenant": tenant, "person": person, "id": args["attachment_id"]},
    ).fetchone()
    if doc is None or doc["status"] not in FINAL:
        raise ActionError("Không tìm thấy hồ sơ lưu trữ", "not-found", 404)
    conn.execute("SELECT audit.add_archive_access(%s, %s, %s)", (tenant, doc["attachment_id"], person))
    row = conn.execute(
        """SELECT p.full_name, to_char(now() AT TIME ZONE %s, 'DD-Mon-YYYY HH24:MI')
           FROM core.person p WHERE p.id = %s""",
        (TZ, person),
    ).fetchone()
    return {
        "attachment_id": str(doc["attachment_id"]),
        "title": doc["title"],
        "file_name": doc["file_name"],
        "content_type": doc["content_type"],
        "viewer": row[0],
        "opened_at": row[1],
        "expires_in": VIEW_TTL,
        "url": ctx.storage.download_url(
            doc["storage_key"], doc["file_name"], doc["content_type"], inline=True, ttl=VIEW_TTL
        ),
    }


HANDLERS = {
    "ledger_overview": ledger_overview,
    "ledger_verify": ledger_verify,
    "ledger_archive": ledger_archive,
    "ledger_open_archive": ledger_open_archive,
}
