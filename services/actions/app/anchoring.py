"""Neo chuỗi băm kiểm toán ra ngoài CSDL.

Mỗi lần neo là một văn bản chuẩn (tenant, số thứ tự, mã băm đầu chuỗi, thời điểm) được ký bằng khóa Ed25519 trong
OpenBao rồi công bố tới kho đối tượng và, nếu cấu hình ANCHOR_URL, tới một điểm công bố bên ngoài. Người chỉ có quyền
ghi CSDL không ký lại được, nên lịch sử đã neo không viết lại hay cắt bớt mà không bị phát hiện.
"""

import contextlib
import datetime as dt
import json
import logging
import threading
import time
import types

import httpx
import psycopg
from psycopg.rows import dict_row

from . import config, receipts, storage
from .common import ActionError, Context, session_identity

log = logging.getLogger("anchoring")

KEY = "anchor"
PREFIX = "_anchors"


def statement_text(tenant: str, seq: int, head_hex: str, at: str) -> str:
    return json.dumps(
        {"v": 1, "tenant": tenant, "seq": seq, "head": head_hex, "at": at}, separators=(",", ":"), sort_keys=True
    )


def object_key(tenant: str, seq: int) -> str:
    return f"{PREFIX}/{tenant}/{seq:012d}.json"


def _publish(
    settings: config.Settings, s3: storage.Storage | None, tenant: str, seq: int, document: dict
) -> list[dict]:
    out: list[dict] = []
    body = json.dumps(document, ensure_ascii=False, sort_keys=True).encode()
    if s3 is not None:
        try:
            s3.put_document(object_key(tenant, seq), body, "application/json")
            out.append({"kind": "s3", "key": object_key(tenant, seq), "ok": True})
        except Exception as exc:  # noqa: BLE001
            out.append({"kind": "s3", "ok": False, "error": f"{type(exc).__name__}"})
    if settings.anchor_url:
        try:
            resp = httpx.post(
                settings.anchor_url, content=body, headers={"Content-Type": "application/json"}, timeout=15
            )
            out.append({"kind": "http", "ok": resp.status_code < 300, "status": resp.status_code})
        except httpx.HTTPError as exc:
            out.append({"kind": "http", "ok": False, "error": type(exc).__name__})
    return out


def anchor_tenant(
    conn: psycopg.Connection,
    signer: receipts.Signer,
    settings: config.Settings,
    s3: storage.Storage | None,
    tenant: str,
    commit: bool = True,
) -> dict | None:
    """Neo đầu chuỗi hiện tại của một tenant nếu có bản ghi mới sau lần neo trước. Trả None nếu không có gì mới."""
    head = conn.execute(
        "SELECT seq, encode(hash, 'hex') AS hex FROM audit.chain_head WHERE tenant_id = %s", (tenant,)
    ).fetchone()
    if head is None or head["seq"] == 0:
        return None
    last = conn.execute("SELECT max(seq) AS seq FROM audit.anchor WHERE tenant_id = %s", (tenant,)).fetchone()["seq"]
    if last is not None and last >= head["seq"]:
        return None
    at = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    statement = statement_text(str(tenant), head["seq"], head["hex"], at)
    proof = signer.sign(statement)
    published = _publish(settings, s3, str(tenant), head["seq"], {"statement": statement, "signature": proof})
    conn.execute(
        """INSERT INTO audit.anchor (tenant_id, seq, head_hash, statement, signature, published, anchored_at)
           VALUES (%s, %s, decode(%s, 'hex'), %s, %s::jsonb, %s::jsonb, %s)""",
        (tenant, head["seq"], head["hex"], statement, json.dumps(proof), json.dumps(published), at),
    )
    if commit:
        conn.commit()
    return {"seq": head["seq"], "head": head["hex"], "published": published}


def retry_publication(
    conn: psycopg.Connection, settings: config.Settings, s3: storage.Storage | None, limit: int = 20
) -> int:
    """Công bố lại các bản neo mà lần công bố trước thất bại (kho đối tượng hoặc điểm ngoài tạm lỗi)."""
    done = 0
    for row in conn.execute(
        """SELECT id, tenant_id, seq, statement, signature, published FROM audit.anchor
           WHERE jsonb_array_length(published) = 0 OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(published) e WHERE NOT (e ->> 'ok')::boolean)
           ORDER BY anchored_at DESC LIMIT %s""",
        (limit,),
    ).fetchall():
        published = _publish(
            settings,
            s3,
            str(row["tenant_id"]),
            row["seq"],
            {"statement": row["statement"], "signature": row["signature"]},
        )
        if published != row["published"]:
            conn.execute(
                "UPDATE audit.anchor SET published = %s::jsonb WHERE id = %s", (json.dumps(published), row["id"])
            )
            conn.commit()
            done += 1
    return done


def anchor_all(
    conn: psycopg.Connection, signer: receipts.Signer, settings: config.Settings, s3: storage.Storage | None
) -> int:
    count = 0
    for row in conn.execute("SELECT tenant_id FROM audit.chain_head").fetchall():
        try:
            if anchor_tenant(conn, signer, settings, s3, str(row["tenant_id"])):
                count += 1
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("không neo được tenant %s: %s", row["tenant_id"], exc)
    return count


def verify_tenant(
    conn: psycopg.Connection, signer: receipts.Signer, s3: storage.Storage | None, tenant: str, limit: int = 200
) -> dict:
    """Kiểm tra mọi bản neo: chữ ký hợp lệ, khớp chuỗi hiện tại và bản công bố bên ngoài không bị đổi."""
    problems: list[dict] = []
    for row in conn.execute("SELECT anchor_id, anchor_seq, problem FROM audit.check_anchors(%s)", (tenant,)).fetchall():
        problems.append({"seq": row["anchor_seq"], "problem": row["problem"]})
    anchors = conn.execute(
        """SELECT seq, encode(head_hash, 'hex') AS hex, statement, signature, published
           FROM audit.anchor WHERE tenant_id = %s ORDER BY seq DESC LIMIT %s""",
        (tenant, limit),
    ).fetchall()
    for a in anchors:
        stated = json.loads(a["statement"])
        if stated["head"] != a["hex"] or stated["seq"] != a["seq"] or stated["tenant"] != str(tenant):
            problems.append({"seq": a["seq"], "problem": "STATEMENT_MISMATCH"})
        try:
            ok = signer.verify(a["statement"], a["signature"])
        except Exception:  # noqa: BLE001
            ok = False
        if not ok:
            problems.append({"seq": a["seq"], "problem": "BAD_SIGNATURE"})
        if s3 is not None and any(p.get("kind") == "s3" and p.get("ok") for p in a["published"]):
            stored = s3.read_stored(object_key(str(tenant), a["seq"]))
            if stored is None:
                problems.append({"seq": a["seq"], "problem": "PUBLICATION_MISSING"})
            else:
                doc = json.loads(stored)
                if doc.get("statement") != a["statement"] or doc.get("signature") != a["signature"]:
                    problems.append({"seq": a["seq"], "problem": "PUBLICATION_DIFFERS"})
    return {"ok": not problems, "checked": len(anchors), "problems": problems}


def run_forever(settings: config.Settings) -> None:
    signer = receipts.Signer.from_env(settings.actions_secret, KEY)
    s3 = storage.Storage(settings)
    conn = psycopg.connect(settings.database_url, row_factory=dict_row)
    log.info("neo chuỗi kiểm toán đang chạy (mỗi %s giây)", settings.anchor_interval)
    while True:
        try:
            anchor_all(conn, signer, settings, s3)
            retry_publication(conn, settings, s3)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("vòng neo chuỗi lỗi: %s", exc)
        time.sleep(settings.anchor_interval)


def start_background(settings: config.Settings) -> threading.Thread:
    thread = threading.Thread(target=run_forever, args=(settings,), name="audit-anchor", daemon=True)
    thread.start()
    return thread


def _reader(conn: psycopg.Connection, session: dict) -> str:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if not conn.execute(
        "SELECT 1 FROM audit.v_reader WHERE tenant_id = %s AND person_id = %s", (tenant, person)
    ).fetchone():
        raise ActionError("Cần quyền audit.read để xem bản neo chuỗi kiểm toán", "forbidden", 403)
    return tenant


def audit_anchors(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    tenant = _reader(conn, session)
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT id, seq, encode(head_hash, 'hex') AS head_hash, signature ->> 'alg' AS alg, published,
                  to_char(anchored_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS anchored_at
           FROM audit.anchor WHERE tenant_id = %s ORDER BY seq DESC LIMIT 20""",
            (tenant,),
        )
        .fetchall()
    )
    head = conn.execute("SELECT seq FROM audit.chain_head WHERE tenant_id = %s", (tenant,)).fetchone()
    return {"head_seq": head[0] if head else 0, "anchors": [{**r, "id": str(r["id"])} for r in rows]}


@contextlib.contextmanager
def _dict_rows(conn: psycopg.Connection):
    previous = conn.row_factory
    conn.row_factory = dict_row
    try:
        yield conn
    finally:
        conn.row_factory = previous


def audit_anchor_verify(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    tenant = _reader(conn, session)
    if ctx.anchor_signer is None:
        raise ActionError("Chưa cấu hình khóa ký", "unavailable", 503)
    with _dict_rows(conn) as c:
        return verify_tenant(c, ctx.anchor_signer, ctx.storage, tenant)


def audit_anchor_now(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    tenant = _reader(conn, session)
    if ctx.anchor_signer is None:
        raise ActionError("Chưa cấu hình khóa ký", "unavailable", 503)
    with _dict_rows(conn) as c:
        result = anchor_tenant(
            c, ctx.anchor_signer, types.SimpleNamespace(anchor_url=ctx.anchor_url), ctx.storage, tenant, commit=False
        )
    return {"anchored": result is not None, "seq": result["seq"] if result else None}


HANDLERS = {
    "audit_anchors": audit_anchors,
    "audit_anchor_verify": audit_anchor_verify,
    "audit_anchor_now": audit_anchor_now,
}
