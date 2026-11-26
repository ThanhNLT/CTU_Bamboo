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

"""Chia tài liệu thư viện thành đoạn và nạp vào chỉ mục vector (ADR #51).

Mỗi đoạn ~800 token, gối ~100, mang tiêu đề gần nhất để trích dẫn dễ đọc. Vector do actions
gọi Ollama `/api/embed` tạo ra rồi ghi vào `_vectors` (embedder `userProvided` của Meilisearch),
nên cài đặt chỉ mục không phụ thuộc Ollama đang chạy.
"""

import logging
import math
import re
import uuid
from dataclasses import dataclass

import psycopg

from bamboo_common.ollama import Ollama

from . import config, ocr, search, storage

log = logging.getLogger("ai_chunks")

EMBEDDER = search.EMBEDDER
DIMENSIONS = search.DIMENSIONS
CHARS_PER_TOKEN = 3.5
MAX_HEADING = 120

_HEADING = re.compile(r"^(?:Điều|Chương|Mục|Phần|Phụ lục)\b", re.IGNORECASE)
_SENTENCE = re.compile(r"(?<=[.!?…;:])\s+")


@dataclass(frozen=True)
class Chunk:
    heading: str | None
    text: str


def tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def is_heading(line: str) -> bool:
    if len(line) > MAX_HEADING:
        return False
    if _HEADING.match(line):
        return True
    letters = [c for c in line if c.isalpha()]
    return len(letters) >= 3 and all(c.isupper() for c in letters)


def _pieces(sentence: str, size: int) -> list[str]:
    if tokens(sentence) <= size:
        return [sentence]
    words, out, cur = sentence.split(), [], []
    for w in words:
        if cur and tokens(" ".join(cur + [w])) > size:
            out.append(" ".join(cur))
            cur = []
        cur.append(w)
    if cur:
        out.append(" ".join(cur))
    return out


def _units(text: str, size: int) -> list[tuple[str | None, str]]:
    heading, units = None, []
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if not line:
            continue
        if is_heading(line):
            heading = line
            continue
        for sentence in _SENTENCE.split(line):
            units.extend((heading, p) for p in _pieces(sentence, size))
    return units


def split(text: str, size: int = 800, overlap: int = 100) -> list[Chunk]:
    chunks: list[Chunk] = []
    cur: list[str] = []
    cur_heading: str | None = None
    fresh = 0

    def flush():
        if fresh:
            chunks.append(Chunk(cur_heading, " ".join(cur)))

    for heading, sentence in _units(text, size):
        if cur and heading != cur_heading:
            flush()
            cur, fresh = [], 0
        elif cur and tokens(" ".join(cur + [sentence])) > size:
            flush()
            carry: list[str] = []
            for s in reversed(cur):
                if tokens(" ".join([s, *carry, sentence])) > min(overlap + tokens(sentence), size):
                    break
                carry.insert(0, s)
            cur, fresh = carry, 0
        if not cur:
            cur_heading = heading
        cur.append(sentence)
        fresh += 1
    flush()
    return chunks


def index_settings() -> dict:
    return {
        "searchableAttributes": ["heading", "text", "title", "doc_no"],
        "filterableAttributes": ["tenant_id", "kb_document_id"],
        "displayedAttributes": [
            "id",
            "kb_document_id",
            "attachment_id",
            "doc_no",
            "title",
            "file_name",
            "heading",
            "position",
            "text",
        ],
        "embedders": {EMBEDDER: {"source": "userProvided", "dimensions": DIMENSIONS}},
    }


def embed_text(record: dict) -> str:
    return ". ".join(p for p in (record["title"], record.get("heading"), record["text"]) if p)[:4000]


def records(conn: psycopg.Connection, settings: config.Settings, doc_id) -> list[dict]:
    """Các đoạn của một tài liệu đang hiệu lực (rỗng khi tài liệu không còn hiệu lực)."""
    doc = conn.execute(
        """SELECT tenant_id, doc_no, title, summary, toc FROM collab.kb_document
           WHERE id = %s AND status = 'APPROVED'""",
        (doc_id,),
    ).fetchone()
    if doc is None:
        conn.rollback()
        return []
    files = conn.execute(
        """SELECT id, file_name, content_type, storage_key FROM core.attachment
           WHERE entity_type = 'collab.kb_document' AND entity_id = %s AND status = 'CLEAN' AND deleted_at IS NULL
           ORDER BY created_at""",
        (doc_id,),
    ).fetchall()
    conn.rollback()
    base = {
        "tenant_id": str(doc["tenant_id"]),
        "kb_document_id": str(doc_id),
        "doc_no": doc["doc_no"],
        "title": doc["title"],
    }
    out = []
    toc = f"Mục lục: {'; '.join(doc['toc'])}." if doc["toc"] else ""
    meta = " ".join(p for p in (f"{doc['title']}.", doc["summary"] or "", toc) if p)
    for n, c in enumerate(split(meta)):
        out.append(
            {
                **base,
                "id": f"{doc_id}_meta_{n}",
                "attachment_id": None,
                "file_name": None,
                "heading": c.heading,
                "position": n,
                "text": c.text,
            }
        )
    scanned = {f["id"]: ocr.text_of(conn, f["id"]) for f in files}
    conn.rollback()
    for f in files:
        text = ""
        if f["content_type"] in search.TEXT_TYPES:
            data = storage.read_document(settings, f["storage_key"])
            if data is None:
                log.warning("tệp %s không còn trong bucket tài liệu", f["id"])
                continue
            text = search.extract_lines(settings.tika_url, data, f["content_type"])
        text = "\n".join(t for t in (text, scanned[f["id"]]) if t)[: search.MAX_FULL_TEXT]
        for n, c in enumerate(split(text)):
            out.append(
                {
                    **base,
                    "id": f"{doc_id}_{f['id']}_{n}",
                    "attachment_id": str(f["id"]),
                    "file_name": f["file_name"],
                    "heading": c.heading,
                    "position": n,
                    "text": c.text,
                }
            )
    return out


def sync_document(conn: psycopg.Connection, meili: search.Meili, ai: Ollama, settings: config.Settings, doc_id) -> int:
    """Xóa mọi đoạn cũ của tài liệu rồi nạp lại nếu tài liệu còn hiệu lực. Trả số đoạn đã nạp."""
    rows = records(conn, settings, doc_id)
    vectors = []
    for i in range(0, len(rows), 16):
        vectors += ai.embed(settings.ai_embed_model, [embed_text(r) for r in rows[i : i + 16]])
    meili.delete_by_filter(settings.meili_chunk_index, f'kb_document_id = "{uuid.UUID(str(doc_id))}"')
    if rows:
        meili.put_documents(
            settings.meili_chunk_index, [{**r, "_vectors": {EMBEDDER: v}} for r, v in zip(rows, vectors, strict=True)]
        )
    return len(rows)
