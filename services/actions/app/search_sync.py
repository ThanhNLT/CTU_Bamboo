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

import logging
import time
import uuid

import psycopg
from psycopg.rows import dict_row

from bamboo_common.ollama import WAKE_SECONDS, Ollama, OllamaUnavailable

from . import ai_chunks, config, ocr, search, storage

log = logging.getLogger("search_sync")
MAX_BACKOFF = 300
EMBED_BATCH = 16
# AI không sẵn sàng (chưa bật, máy thiếu RAM): chờ lâu mới thử đánh thức lại để nạp vector còn thiếu.
EMBED_RETRY_SECONDS = 600.0
BACKFILL_BATCH = 200


def with_vectors(docs: list[dict], ai: Ollama | None, settings: config.Settings) -> tuple[list[dict], bool]:
    """Gắn `_vectors` cho mọi tài liệu (ADR #92): Meilisearch từ chối tài liệu thiếu khóa này khi chỉ mục có embedder.

    AI không có hoặc lỗi thì vector là null: tài liệu vẫn tìm được theo từ khóa, trả False để nạp lại vector sau.
    """
    vectors: list | None = None
    if ai is not None and docs:
        try:
            vectors = []
            texts = [search.semantic_text(d) or d.get("title") or d.get("file_name") or "-" for d in docs]
            for i in range(0, len(texts), EMBED_BATCH):
                vectors += ai.embed(settings.ai_embed_model, texts[i : i + EMBED_BATCH])
        except OllamaUnavailable as exc:
            log.info("chưa tạo được vector, nạp tạm không vector: %s", exc)
            vectors = None
    if vectors is None:
        return [{**d, "_vectors": {search.EMBEDDER: None}} for d in docs], False
    return [{**d, "_vectors": {search.EMBEDDER: v}} for d, v in zip(docs, vectors, strict=True)], True


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


def attachment_docs(conn: psycopg.Connection, settings: config.Settings, entity_id) -> list[dict]:
    att = conn.execute(
        """SELECT tenant_id, entity_type, entity_id, file_name, content_type, storage_key,
                  search.attachment_name_only(entity_type) AS name_only,
                  extract(epoch FROM created_at)::bigint AS created_at
           FROM core.attachment WHERE id = %s AND status = 'CLEAN' AND deleted_at IS NULL
             AND search.attachment_searchable(entity_type) AND search.attachment_visible(entity_type, entity_id)""",
        (entity_id,),
    ).fetchone()
    if att is None:
        return []
    content = ""
    if att["name_only"]:
        pass
    elif att["content_type"] in search.TEXT_TYPES:
        data = storage.read_document(settings, att["storage_key"])
        if data is None:
            log.warning("tệp %s không còn trong bucket tài liệu", entity_id)
        else:
            content = search.extract_text(settings.tika_url, data, att["content_type"])
    if not att["name_only"] and (scanned := ocr.text_of(conn, entity_id)):
        content = " ".join(f"{content} {scanned}".split())
    base = search.doc_id("core.attachment", entity_id)
    return [
        {
            "id": search.part_id(base, n),
            "kind": "attachment",
            "tenant_id": str(att["tenant_id"]),
            "entity_type": att["entity_type"],
            "entity_id": str(att["entity_id"]),
            "attachment_id": str(entity_id),
            "file_name": att["file_name"],
            "content": part,
            "created_at": att["created_at"],
        }
        for n, part in enumerate(search.split_parts(content))
    ]


def sync_one(
    conn: psycopg.Connection,
    meili: search.Meili,
    settings: config.Settings,
    entity_type: str,
    entity_id,
    ai: Ollama | None = None,
) -> bool:
    """Nạp lại một tài liệu vào chỉ mục. Trả True khi chỉ mục đã đủ (có vector, hoặc tài liệu đã gỡ khỏi chỉ mục)."""
    if entity_type == "core.attachment":
        docs = attachment_docs(conn, settings, entity_id)
        conn.rollback()
        docs, embedded = with_vectors(docs, ai, settings)
        meili.delete_by_filter(settings.meili_index, f'attachment_id = "{uuid.UUID(str(entity_id))}"')
        if docs:
            meili.put_documents(settings.meili_index, docs)
        return embedded or not docs
    if entity_type == "proc.purchase_request":
        doc = purchase_request_doc(conn, entity_id)
    elif entity_type == "collab.kb_document":
        doc = kb_document_doc(conn, entity_id)
    else:
        raise ValueError(f"Không đồng bộ loại {entity_type}")
    conn.rollback()
    if doc is None:
        meili.delete_document(settings.meili_index, search.doc_id(entity_type, entity_id))
        return True
    docs, embedded = with_vectors([doc], ai, settings)
    meili.put_documents(settings.meili_index, docs)
    return embedded


def run_once(
    conn: psycopg.Connection,
    meili: search.Meili,
    settings: config.Settings,
    limit: int = 50,
    ai: Ollama | None = None,
) -> int:
    rows = conn.execute(
        """SELECT entity_type, entity_id, attempts, updated_at FROM search.pending
           WHERE dirty AND next_attempt_at <= now()
           ORDER BY next_attempt_at, updated_at LIMIT %s""",
        (limit,),
    ).fetchall()
    conn.commit()
    if rows and ai is not None and not ai_ready(ai):
        ai = None
    for row in rows:
        key = (row["entity_type"], row["entity_id"])
        try:
            embedded = sync_one(conn, meili, settings, *key, ai=ai)
            conn.execute(
                """UPDATE search.pending
                   SET dirty = (updated_at <> %s), attempts = 0, last_error = NULL, indexed_at = now(), embedded = %s
                   WHERE entity_type = %s AND entity_id = %s""",
                (row["updated_at"], embedded, *key),
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


def chunks_pending(conn: psycopg.Connection) -> bool:
    row = conn.execute("SELECT 1 FROM search.pending_chunk WHERE dirty AND next_attempt_at <= now() LIMIT 1").fetchone()
    conn.commit()
    return row is not None


def ai_ready(ai: Ollama | None) -> bool:
    if ai is None:
        return False
    try:
        ai.models(timeout=WAKE_SECONDS)
        return True
    except OllamaUnavailable:
        return False


def mark_missing_vectors(conn: psycopg.Connection, limit: int = BACKFILL_BATCH) -> int:
    """Đánh dấu nạp lại các tài liệu đã nạp khi AI chưa chạy (chưa có vector); trả số tài liệu đã đánh dấu."""
    marked = conn.execute(
        """UPDATE search.pending SET dirty = true, attempts = 0, next_attempt_at = now()
           WHERE (entity_type, entity_id) IN (
               SELECT entity_type, entity_id FROM search.pending
               WHERE NOT embedded AND NOT dirty AND indexed_at IS NOT NULL LIMIT %s)""",
        (limit,),
    ).rowcount
    conn.commit()
    return marked


def missing_vectors(conn: psycopg.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM search.pending WHERE NOT embedded AND NOT dirty AND indexed_at IS NOT NULL LIMIT 1"
    ).fetchone()
    conn.commit()
    return row is not None


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
    backfill_after = 0.0
    while True:
        while run_once(work, meili, settings, ai=ai):
            pass
        try:
            # Bootstrap làm trống chỉ mục khi thêm embedder (ADR #92) có thể xảy ra sau lúc search-sync khởi động.
            reindex_if_empty(work, meili, settings.meili_index)
            if ai is not None and time.monotonic() >= backfill_after and missing_vectors(work):
                if ai_ready(ai):
                    log.info("AI sẵn sàng: nạp lại %s tài liệu chưa có vector", mark_missing_vectors(work))
                    continue
                backfill_after = time.monotonic() + EMBED_RETRY_SECONDS
        except search.SearchUnavailable as exc:
            work.rollback()
            log.warning("chỉ mục tìm kiếm chưa sẵn sàng: %s", exc)
        try:
            if ai is not None and not chunks_checked:
                reindex_chunks_if_empty(work, meili, settings.meili_chunk_index)
                chunks_checked = True
            if ai is not None and chunks_pending(work) and ai_ready(ai):
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
