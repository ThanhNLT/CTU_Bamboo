# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import logging
import time

import psycopg
from psycopg.rows import dict_row

from . import ai_chunks, config, ocr, search, storage
from .ollama import Ollama, OllamaUnavailable

log = logging.getLogger("search_sync")
MAX_BACKOFF = 300


def purchase_request_doc(conn: psycopg.Connection, entity_id) -> dict | None:
    row = conn.execute("SELECT search.purchase_request_doc(%s) AS doc", (entity_id,)).fetchone()
    doc = row["doc"] if row else None
    if doc is None:
        return None
    return {
        **doc,
        "id": search.doc_id("proc.purchase_request", entity_id),
        "kind": "purchase_request",
        "total_amount": float(doc["total_amount"]),
    }


def kb_document_doc(conn: psycopg.Connection, entity_id) -> dict | None:
    row = conn.execute("SELECT search.kb_document_doc(%s) AS doc", (entity_id,)).fetchone()
    doc = row["doc"] if row else None
    if doc is None:
        return None
    return {**doc, "id": search.doc_id("collab.kb_document", entity_id), "kind": "kb_document"}


def attachment_doc(conn: psycopg.Connection, settings: config.Settings, entity_id) -> dict | None:
    att = conn.execute(
        """SELECT tenant_id, entity_type, entity_id, file_name, content_type, storage_key,
                  extract(epoch FROM created_at)::bigint AS created_at
           FROM core.attachment WHERE id = %s AND status = 'CLEAN' AND deleted_at IS NULL
             AND search.attachment_indexable(entity_type) AND search.attachment_visible(entity_type, entity_id)""",
        (entity_id,),
    ).fetchone()
    if att is None:
        return None
    content = ""
    if att["content_type"] in search.TEXT_TYPES:
        data = storage.read_document(settings, att["storage_key"])
        if data is None:
            log.warning("tệp %s không còn trong bucket tài liệu", entity_id)
        else:
            content = search.extract_text(settings.tika_url, data, att["content_type"])
    if scanned := ocr.text_of(conn, entity_id):
        content = " ".join(f"{content} {scanned}".split())[: search.MAX_TEXT]
    return {
        "id": search.doc_id("core.attachment", entity_id),
        "kind": "attachment",
        "tenant_id": str(att["tenant_id"]),
        "entity_type": att["entity_type"],
        "entity_id": str(att["entity_id"]),
        "attachment_id": str(entity_id),
        "file_name": att["file_name"],
        "content": content,
        "created_at": att["created_at"],
    }


def sync_one(
    conn: psycopg.Connection, meili: search.Meili, settings: config.Settings, entity_type: str, entity_id
) -> bool:
    if entity_type == "proc.purchase_request":
        doc = purchase_request_doc(conn, entity_id)
    elif entity_type == "core.attachment":
        doc = attachment_doc(conn, settings, entity_id)
    elif entity_type == "collab.kb_document":
        doc = kb_document_doc(conn, entity_id)
    else:
        raise ValueError(f"Không đồng bộ loại {entity_type}")
    conn.rollback()
    if doc is None:
        meili.delete_document(settings.meili_index, search.doc_id(entity_type, entity_id))
        return False
    meili.put_documents(settings.meili_index, [doc])
    return True


def run_once(conn: psycopg.Connection, meili: search.Meili, settings: config.Settings, limit: int = 50) -> int:
    rows = conn.execute(
        """SELECT entity_type, entity_id, attempts, updated_at FROM search.pending
           WHERE dirty AND next_attempt_at <= now()
           ORDER BY next_attempt_at, updated_at LIMIT %s""",
        (limit,),
    ).fetchall()
    conn.commit()
    for row in rows:
        key = (row["entity_type"], row["entity_id"])
        try:
            sync_one(conn, meili, settings, *key)
            conn.execute(
                """UPDATE search.pending
                   SET dirty = (updated_at <> %s), attempts = 0, last_error = NULL, indexed_at = now()
                   WHERE entity_type = %s AND entity_id = %s""",
                (row["updated_at"], *key),
            )
            conn.commit()
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            delay = min(2 ** row["attempts"], MAX_BACKOFF)
            log.warning("search-sync %s lỗi (thử lại sau %s giây): %s", key, delay, exc)
            conn.execute(
                """UPDATE search.pending
                   SET attempts = attempts + 1, last_error = %s, next_attempt_at = now() + make_interval(secs => %s)
                   WHERE entity_type = %s AND entity_id = %s AND updated_at = %s""",
                (str(exc)[:1000], delay, *key, row["updated_at"]),
            )
            conn.commit()
    return len(rows)


def run_chunks_once(
    conn: psycopg.Connection, meili: search.Meili, ai: Ollama, settings: config.Settings, limit: int = 10
) -> int:
    """Nạp đoạn cho tài liệu thư viện trong search.pending_chunk; lỗi không ảnh hưởng chỉ mục toàn văn."""
    rows = conn.execute(
        """SELECT kb_document_id, attempts, updated_at FROM search.pending_chunk
           WHERE dirty AND next_attempt_at <= now()
           ORDER BY next_attempt_at, updated_at LIMIT %s""",
        (limit,),
    ).fetchall()
    conn.commit()
    for row in rows:
        doc_id = row["kb_document_id"]
        try:
            ai_chunks.sync_document(conn, meili, ai, settings, doc_id)
            conn.execute(
                """UPDATE search.pending_chunk
                   SET dirty = (updated_at <> %s), attempts = 0, last_error = NULL, indexed_at = now()
                   WHERE kb_document_id = %s""",
                (row["updated_at"], doc_id),
            )
            conn.commit()
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            delay = min(2 ** row["attempts"], MAX_BACKOFF)
            log.warning("nạp đoạn %s lỗi (thử lại sau %s giây): %s", doc_id, delay, exc)
            conn.execute(
                """UPDATE search.pending_chunk
                   SET attempts = attempts + 1, last_error = %s, next_attempt_at = now() + make_interval(secs => %s)
                   WHERE kb_document_id = %s AND updated_at = %s""",
                (str(exc)[:1000], delay, doc_id, row["updated_at"]),
            )
            conn.commit()
    return len(rows)


def reindex_chunks_if_empty(conn: psycopg.Connection, meili: search.Meili, index: str) -> int:
    if meili.document_count(index) > 0:
        return 0
    marked = conn.execute("SELECT search.mark_all_chunks() AS n").fetchone()["n"]
    conn.commit()
    if marked:
        log.info("chỉ mục đoạn trống: đánh dấu lại %s tài liệu", marked)
    return marked


def ai_ready(ai: Ollama | None) -> bool:
    if ai is None:
        return False
    try:
        ai.models()
        return True
    except OllamaUnavailable:
        return False


def reindex_if_empty(conn: psycopg.Connection, meili: search.Meili, index: str) -> int:
    if meili.document_count(index) > 0:
        return 0
    marked = conn.execute("SELECT search.mark_all() AS n").fetchone()["n"]
    conn.commit()
    if marked:
        log.info("chỉ mục trống: đánh dấu lại %s tài liệu", marked)
    return marked


def run_forever(settings: config.Settings, idle_seconds: float = 30.0) -> None:
    meili = search.Meili(settings.meili_url, settings.meili_indexer_key)
    listen = psycopg.connect(settings.database_url, autocommit=True)
    listen.execute("LISTEN search_sync")
    work = psycopg.connect(settings.database_url, row_factory=dict_row)
    while True:
        try:
            reindex_if_empty(work, meili, settings.meili_index)
            break
        except search.SearchUnavailable as exc:
            work.rollback()
            log.warning("chờ Meilisearch: %s", exc)
            time.sleep(5)
    log.info("search-sync đang chạy")
    ai = Ollama(settings.ollama_url) if settings.ollama_url else None
    chunks_checked = False
    while True:
        while run_once(work, meili, settings):
            pass
        if ai_ready(ai):
            try:
                if not chunks_checked:
                    reindex_chunks_if_empty(work, meili, settings.meili_chunk_index)
                    chunks_checked = True
                while run_chunks_once(work, meili, ai, settings):
                    pass
            except search.SearchUnavailable as exc:
                work.rollback()
                log.warning("chỉ mục đoạn chưa sẵn sàng: %s", exc)
        for _ in listen.notifies(timeout=idle_seconds, stop_after=1):
            pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    run_forever(config.load())
