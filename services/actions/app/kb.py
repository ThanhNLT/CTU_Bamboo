# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

import psycopg
from psycopg.rows import dict_row

from .common import ActionError, Context, bind_session, require_read, session_identity

ENTITY = "collab.kb_document"
TZ = "Asia/Ho_Chi_Minh"


def _doc(conn: psycopg.Connection, session: dict, doc_id: str) -> str:
    row = conn.execute("SELECT tenant_id FROM collab.kb_document WHERE id = %s", (doc_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, ENTITY, doc_id, person)
    bind_session(conn, session)
    return person


def _result(conn: psycopg.Connection, doc_id: str) -> dict:
    status = conn.execute("SELECT status FROM collab.kb_document WHERE id = %s", (doc_id,)).fetchone()[0]
    return {"id": doc_id, "status": status}


def submit_kb_document(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _doc(conn, session, args["id"])
    conn.execute("SELECT collab.submit_kb_document(%s, %s)", (args["id"], person))
    return _result(conn, args["id"])


def cancel_kb_document(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _doc(conn, session, args["id"])
    conn.execute("SELECT collab.cancel_kb_document(%s, %s, %s)", (args["id"], person, args["reason"]))
    return _result(conn, args["id"])


def retire_kb_document(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _doc(conn, session, args["id"])
    conn.execute("SELECT collab.retire_kb_document(%s, %s, %s)", (args["id"], person, args["reason"]))
    return _result(conn, args["id"])


def kb_reindex(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person = _doc(conn, session, args["id"])
    unit, tenant = conn.execute(
        "SELECT org_unit_id, tenant_id FROM collab.kb_document WHERE id = %s", (args["id"],)
    ).fetchone()
    if not conn.execute("SELECT core.has_permission(%s, 'kb.document.manage', %s)", (person, unit)).fetchone()[0]:
        raise ActionError("Cần quyền kb.document.manage để nạp lại chỉ mục", "forbidden", 403)
    conn.execute("SELECT search.mark(%s, %s, %s)", (tenant, ENTITY, args["id"]))
    conn.execute("SELECT search.mark_chunk(%s, %s)", (tenant, args["id"]))
    conn.execute(
        """SELECT search.mark(tenant_id, 'core.attachment', id) FROM core.attachment
           WHERE entity_type = %s AND entity_id = %s AND status = 'CLEAN' AND scan_engines <> '{unscanned}'
             AND deleted_at IS NULL""",
        (ENTITY, args["id"]),
    )
    return _result(conn, args["id"])


def kb_library(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    cur = conn.cursor(row_factory=dict_row)
    docs = cur.execute(
        """SELECT d.id, d.doc_no, d.title, d.category, d.scope, d.summary, d.toc, d.version, d.supersedes_id,
                  to_char(d.effective_date, 'DD-Mon-YYYY') AS effective_date,
                  to_char(d.published_at AT TIME ZONE %(tz)s, 'DD-Mon-YYYY HH24:MI') AS published_at,
                  u.name AS unit, coalesce(c.name, u.name) AS issuer, p.full_name AS requester,
                  core.company_of(d.org_unit_id) = ANY(%(companies)s) AS my_company,
                  CASE WHEN sp.entity_id IS NULL THEN 'missing'
                       WHEN sp.dirty AND sp.attempts > 0 THEN 'error'
                       WHEN sp.dirty THEN 'indexing' ELSE 'indexed' END AS index_status,
                  to_char(sp.indexed_at AT TIME ZONE %(tz)s, 'DD-Mon-YYYY HH24:MI') AS indexed_at,
                  sp.last_error AS index_error,
                  core.has_permission(%(person)s, 'kb.document.manage', d.org_unit_id) AS can_manage,
                  coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name,
                                                                'content_type', a.content_type,
                                                                'size_bytes', a.size_bytes) ORDER BY a.created_at)
                            FROM core.attachment a
                            WHERE a.entity_type = 'collab.kb_document' AND a.entity_id = d.id
                              AND a.status = 'CLEAN' AND a.scan_engines <> '{unscanned}' AND a.deleted_at IS NULL), '[]') AS files,
                  coalesce((WITH RECURSIVE prev AS (
                                SELECT o.id, o.version, o.doc_no, o.published_at, o.supersedes_id
                                FROM collab.kb_document o WHERE o.id = d.supersedes_id
                                UNION ALL
                                SELECT o.id, o.version, o.doc_no, o.published_at, o.supersedes_id
                                FROM collab.kb_document o JOIN prev ON o.id = prev.supersedes_id)
                            SELECT jsonb_agg(jsonb_build_object('id', id, 'version', version, 'doc_no', doc_no)
                                             ORDER BY version DESC) FROM prev), '[]') AS previous
           FROM collab.kb_document d
           JOIN core.org_unit u ON u.id = d.org_unit_id
           LEFT JOIN core.org_unit c ON c.id = core.company_of(d.org_unit_id)
           JOIN core.person p ON p.id = d.requester_id
           LEFT JOIN search.pending sp ON sp.entity_type = 'collab.kb_document' AND sp.entity_id = d.id
           WHERE d.tenant_id = %(tenant)s AND d.status = 'APPROVED'
             AND collab.kb_can_read_published(d, %(person)s)
           ORDER BY d.published_at DESC""",
        {"tenant": tenant, "person": person, "tz": TZ, "companies": _companies(conn, person)},
    ).fetchall()
    can_propose = conn.execute(
        """SELECT EXISTS (SELECT 1 FROM core.assignment a JOIN core.position pos ON pos.id = a.position_id
                          WHERE a.person_id = %s AND a.valid_period @> now()
                            AND core.has_permission(%s, 'kb.document.create', pos.org_unit_id))""",
        (person, person),
    ).fetchone()[0]
    return {
        "can_propose": can_propose,
        "documents": [
            {**d, "id": str(d["id"]), "supersedes_id": str(d["supersedes_id"]) if d["supersedes_id"] else None}
            for d in docs
        ],
    }


def _companies(conn: psycopg.Connection, person: str) -> list:
    rows = conn.execute(
        """SELECT DISTINCT core.company_of(pos.org_unit_id) FROM core.assignment a
           JOIN core.position pos ON pos.id = a.position_id
           WHERE a.person_id = %s AND a.valid_period @> now()""",
        (person,),
    ).fetchall()
    return [r[0] for r in rows if r[0]]


HANDLERS = {
    "submit_kb_document": submit_kb_document,
    "cancel_kb_document": cancel_kb_document,
    "retire_kb_document": retire_kb_document,
    "kb_reindex": kb_reindex,
    "kb_library": kb_library,
}
