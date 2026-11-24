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

import hashlib
import hmac
import html
import logging
import re
import time
import uuid

import httpx
import psycopg

from .common import ActionError, Context, session_identity

log = logging.getLogger("search")

INDEX = "documents"
SEARCH_KEY_UID = "8f1d6a52-3c1e-4c55-9a43-6a0b7f5e2c01"
INDEXER_KEY_UID = "2b7e4c90-5d2f-4b8a-8e61-0c9d3a4f7b12"
KEY_INDEXES = ["documents*"]
SEARCH_ACTIONS = ["search"]
INDEXER_ACTIONS = ["documents.add", "documents.get", "documents.delete", "indexes.get", "tasks.get", "stats.get"]

MAX_TEXT = 100_000
PART_CHARS = 50_000
MAX_PARTS = 40
MAX_FULL_TEXT = PART_CHARS * MAX_PARTS
MAX_LIMIT = 50
MAX_CANDIDATES = 1000
TEXT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "text/markdown",
}
PLAIN_TYPES = {"text/plain", "text/csv", "text/markdown"}
_PRE, _POST = "", ""
_SNIPPET_FIELDS = ("content", "description", "items", "title", "file_name", "partner", "requester", "doc_no")

# Tìm theo ý nghĩa (ADR #92): vector bge-m3 1024 chiều do search-sync tạo (embedder `userProvided`, cùng mô hình với
# chỉ mục đoạn của trợ lý RAG). Điểm ngữ nghĩa của Meilisearch là (1 + cos) / 2; đo trên dữ liệu demo, câu hỏi và
# chứng từ liên quan có cos ≈ 0,56–0,67, câu vô nghĩa ≤ 0,40, trung vị 0,45–0,51 nên chỉ lấy cos ≥ SEMANTIC_MIN_COS.
EMBEDDER = "bge"
DIMENSIONS = 1024
SEMANTIC_MIN_COS = 0.55
SEMANTIC_QUERY_SECONDS = 4.0
SEMANTIC_TEXT_CHARS = 2000
# Câu tìm có mã số (PR-2026-000123, mã số thuế...) chỉ tìm theo từ khóa: vector của các mã giống nhau rất gần nhau.
_CODE_QUERY = re.compile(r"\d{3,}")


def derive_key(master_key: str, uid: str) -> str:
    return hmac.new(master_key.encode(), uid.encode(), hashlib.sha256).hexdigest()


def index_settings() -> dict:
    return {
        "searchableAttributes": [
            "doc_no",
            "title",
            "file_name",
            "items",
            "partner",
            "requester",
            "org_unit",
            "description",
            "content",
        ],
        "filterableAttributes": ["tenant_id", "kind", "entity_type", "status", "attachment_id"],
        "sortableAttributes": ["created_at"],
        "displayedAttributes": [
            "id",
            "kind",
            "entity_type",
            "entity_id",
            "attachment_id",
            "tenant_id",
            "status",
            "doc_no",
            "title",
            "file_name",
            "items",
            "partner",
            "requester",
            "description",
            "content",
        ],
        "typoTolerance": {"disableOnAttributes": ["doc_no"]},
        "pagination": {"maxTotalHits": MAX_CANDIDATES},
        "embedders": {EMBEDDER: {"source": "userProvided", "dimensions": DIMENSIONS}},
    }


def semantic_text(doc: dict) -> str:
    """Văn bản đại diện cho vector của một tài liệu: tiêu đề, dòng hàng, nhà cung cấp, mô tả, đầu nội dung tệp.

    Không đưa số chứng từ, mã: vector của các mã gần như trùng nhau làm mọi chứng từ giống nhau.
    """
    items = doc.get("items")
    parts = [
        doc.get("title"),
        doc.get("file_name"),
        f"Hàng hóa: {'; '.join(i for i in items if isinstance(i, str))}" if isinstance(items, list) and items else None,
        f"Nhà cung cấp: {doc['partner']}" if doc.get("partner") else None,
        doc.get("org_unit"),
        doc.get("description"),
        (doc.get("content") or "")[:SEMANTIC_TEXT_CHARS],
    ]
    return ". ".join(p.strip() for p in parts if isinstance(p, str) and p.strip())[:SEMANTIC_TEXT_CHARS]


def doc_id(entity_type: str, entity_id) -> str:
    return f"{entity_type.replace('.', '_')}-{entity_id}"


class SearchUnavailable(Exception):
    pass


class Meili:
    def __init__(self, url: str, key: str, timeout: float = 10.0):
        self.http = httpx.Client(
            base_url=url.rstrip("/"), timeout=timeout, headers={"Authorization": f"Bearer {key}"} if key else {}
        )

    def request(self, method: str, path: str, body=None, ok404: bool = False):
        try:
            resp = self.http.request(method, path, json=body)
        except httpx.HTTPError as exc:
            raise SearchUnavailable(f"Meilisearch không truy cập được: {exc}") from exc
        if ok404 and resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            raise SearchUnavailable(f"Meilisearch {method} {path}: {resp.status_code} {resp.text[:500]}")
        return resp.json() if resp.content else None

    def wait(self, task: dict, timeout: float = 60.0) -> dict:
        uid = task["taskUid"]
        deadline = time.monotonic() + timeout
        delay = 0.02
        while True:
            info = self.request("GET", f"/tasks/{uid}")
            if info["status"] == "succeeded":
                return info
            if info["status"] in ("failed", "canceled"):
                raise SearchUnavailable(f"Meilisearch tác vụ {uid} {info['status']}: {info.get('error')}")
            if time.monotonic() > deadline:
                raise SearchUnavailable(f"Meilisearch tác vụ {uid} chưa xong sau {timeout} giây")
            time.sleep(delay)
            delay = min(delay * 2, 0.5)

    def put_documents(self, index: str, docs: list[dict]) -> None:
        self.wait(self.request("PUT", f"/indexes/{index}/documents?primaryKey=id", docs))

    def delete_document(self, index: str, document_id: str) -> None:
        self.wait(self.request("DELETE", f"/indexes/{index}/documents/{document_id}"))

    def delete_by_filter(self, index: str, flt: str) -> None:
        self.wait(self.request("POST", f"/indexes/{index}/documents/delete", {"filter": flt}))

    def document_count(self, index: str) -> int:
        return self.request("GET", f"/indexes/{index}/stats")["numberOfDocuments"]

    def search(self, index: str, body: dict) -> dict:
        return self.request("POST", f"/indexes/{index}/search", body)


def ensure_index(admin: Meili, index: str = INDEX, settings: dict | None = None) -> bool:
    """Tạo hoặc cập nhật cài đặt chỉ mục. Trả True khi chỉ mục mới tạo hoặc vừa bị làm trống (search-sync nạp lại).

    Meilisearch không thêm được embedder `userProvided` vào chỉ mục đang có tài liệu chưa có vector (bản trước ADR #92):
    khi đó xóa tài liệu rồi đặt lại cài đặt; search-sync thấy chỉ mục trống thì đánh dấu nạp lại toàn bộ.
    """
    created = admin.request("GET", f"/indexes/{index}", ok404=True) is None
    if created:
        admin.wait(admin.request("POST", "/indexes", {"uid": index, "primaryKey": "id"}))
    body = settings or index_settings()
    try:
        admin.wait(admin.request("PATCH", f"/indexes/{index}/settings", body))
    except SearchUnavailable as exc:
        if "no vectors provided" not in str(exc):
            raise
        log.info("chỉ mục %s chưa có vector: xóa tài liệu để thêm embedder, search-sync sẽ nạp lại", index)
        admin.wait(admin.request("DELETE", f"/indexes/{index}/documents"))
        admin.wait(admin.request("PATCH", f"/indexes/{index}/settings", body))
        created = True
    return created


def ensure_keys(admin: Meili) -> None:
    for uid, name, actions in (
        (SEARCH_KEY_UID, "bamboo-search", SEARCH_ACTIONS),
        (INDEXER_KEY_UID, "bamboo-indexer", INDEXER_ACTIONS),
    ):
        key = admin.request("GET", f"/keys/{uid}", ok404=True)
        if key and sorted(key["actions"]) == sorted(actions) and key["indexes"] == KEY_INDEXES:
            continue
        if key:
            admin.request("DELETE", f"/keys/{uid}")
        admin.request(
            "POST", "/keys", {"uid": uid, "name": name, "actions": actions, "indexes": KEY_INDEXES, "expiresAt": None}
        )


def config_toml(master_key: str) -> str:
    return f'master_key = "{master_key}"\nenv = "production"\ndb_path = "/meili_data/data.ms"\nno_analytics = true\n'


def decode_text(data: bytes) -> str:
    """Giải mã văn bản thuần theo các bảng mã trình quét tệp chấp nhận: UTF-8, UTF-16 (có BOM), Windows-1258."""
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return data.decode("utf-16", "replace")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1258", "replace")


def extract_text(
    tika_url: str, data: bytes, content_type: str, timeout: float = 120.0, limit: int = MAX_FULL_TEXT
) -> str:
    if content_type in PLAIN_TYPES:
        return " ".join(decode_text(data).split())[:limit]
    return " ".join(extract_lines(tika_url, data, content_type, timeout).split())[:limit]


def split_parts(text: str, size: int = PART_CHARS, max_parts: int = MAX_PARTS) -> list[str]:
    """Chia văn bản đã chuẩn hóa khoảng trắng thành các phần ≤ size ký tự, cắt ở khoảng trắng; luôn trả ít nhất một phần."""
    parts: list[str] = []
    while len(text) > size and len(parts) < max_parts:
        cut = text.rfind(" ", size // 2, size)
        cut = cut if cut > 0 else size
        parts.append(text[:cut].strip())
        text = text[cut:].lstrip()
    parts.append(text[:size])
    return parts


def part_id(base: str, n: int) -> str:
    return base if n == 0 else f"{base}-p{n}"


def extract_lines(tika_url: str, data: bytes, content_type: str, timeout: float = 120.0) -> str:
    if content_type not in TEXT_TYPES or not data:
        return ""
    if content_type in PLAIN_TYPES:
        return decode_text(data)
    try:
        resp = httpx.put(
            f"{tika_url.rstrip('/')}/tika",
            content=data,
            timeout=timeout,
            headers={"Content-Type": content_type, "Accept": "text/plain; charset=UTF-8"},
        )
    except httpx.HTTPError as exc:
        raise SearchUnavailable(f"Tika không truy cập được: {exc}") from exc
    if resp.status_code == 422:
        return ""
    if resp.status_code >= 400:
        raise SearchUnavailable(f"Tika lỗi {resp.status_code}: {resp.text[:300]}")
    return resp.content.decode("utf-8", "replace")


def _snippet(hit: dict) -> tuple[str | None, str]:
    formatted = hit.get("_formatted") or {}
    fallback = None
    for field in _SNIPPET_FIELDS:
        value = formatted.get(field)
        if isinstance(value, list):
            value = "; ".join(v for v in value if isinstance(v, str))
        if not isinstance(value, str) or not value:
            continue
        if _PRE in value:
            return field, html.escape(value).replace(_PRE, "<mark>").replace(_POST, "</mark>")
        fallback = fallback or (field, html.escape(value))
    return fallback or (None, "")


def _readable(conn: psycopg.Connection, person: str, hits: list[dict]) -> set[str]:
    if not hits:
        return set()
    rows = conn.execute(
        """SELECT h.id
           FROM jsonb_to_recordset(%s::jsonb) AS h(id text, entity_type text, entity_id uuid, attachment_id uuid)
           WHERE wf.entity_can_read(h.entity_type, h.entity_id, %s)
             AND (h.attachment_id IS NULL OR EXISTS (
                     SELECT 1 FROM core.attachment a
                     WHERE a.id = h.attachment_id AND a.entity_id = h.entity_id
                       AND a.status = 'CLEAN' AND a.scan_engines <> '{unscanned}' AND a.deleted_at IS NULL))""",
        (
            psycopg.types.json.Jsonb(
                [{k: h.get(k) for k in ("id", "entity_type", "entity_id", "attachment_id")} for h in hits]
            ),
            person,
        ),
    ).fetchall()
    return {r[0] for r in rows}


def _query_vector(ctx: Context, query: str) -> list[float] | None:
    """Vector của câu tìm, hoặc None để chỉ tìm theo từ khóa (AI chưa bật, câu tìm là mã số, Ollama không trả kịp)."""
    ai, model = getattr(ctx, "ai", None), getattr(ctx, "ai_embed_model", "")
    if ai is None or not model or len(query) < 3 or _CODE_QUERY.search(query):
        return None
    try:
        [vector] = ai.embed(model, [query], timeout=SEMANTIC_QUERY_SECONDS)
    except Exception as exc:  # noqa: BLE001
        log.info("tìm theo ý nghĩa tạm không dùng được, chỉ tìm từ khóa: %s", exc)
        return None
    return vector if len(vector) == DIMENSIONS else None


def search_documents(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> list[dict]:
    """Tìm theo từ khóa (ADR #36), rồi bổ sung kết quả gần về ý nghĩa mà từ khóa không ra (ADR #92).

    `mode`: `hybrid` (mặc định) trả kết quả từ khóa trước theo thứ tự của Meilisearch rồi nối kết quả theo ý nghĩa;
    `keyword` chỉ tìm từ khóa; `semantic` chỉ tìm theo ý nghĩa, quay về từ khóa khi AI chưa sẵn sàng. Kết quả theo ý
    nghĩa chỉ lấy khi cos ≥ SEMANTIC_MIN_COS và mang `semantic_score` (cos). Mọi kết quả đều lọc lại theo quyền xem.
    """
    query = (args.get("query") or "").strip()
    if not query:
        raise ActionError("Nhập từ khóa để tìm", "query-required")
    if len(query) > 200:
        raise ActionError("Từ khóa tối đa 200 ký tự")
    limit = max(1, min(int(args.get("limit") or 20), MAX_LIMIT))
    offset = max(0, int(args.get("offset") or 0))
    kind = args.get("kind")
    if kind not in (None, "purchase_request", "attachment", "kb_document"):
        raise ActionError(f"Loại kết quả không hợp lệ: {kind}")
    mode = args.get("mode") or "hybrid"
    if mode not in ("hybrid", "keyword", "semantic"):
        raise ActionError(f"Chế độ tìm không hợp lệ: {mode}")
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if ctx.search is None:
        raise ActionError("Chưa cấu hình tìm kiếm", "unavailable", 503)

    filters = [f'tenant_id = "{uuid.UUID(tenant)}"']
    if kind:
        filters.append(f'kind = "{kind}"')
    common = {
        "filter": " AND ".join(filters),
        "attributesToRetrieve": ["id", "kind", "entity_type", "entity_id", "attachment_id", "file_name"],
        "attributesToCrop": ["content", "description"],
        "cropLength": 24,
        "attributesToHighlight": list(_SNIPPET_FIELDS),
        "highlightPreTag": _PRE,
        "highlightPostTag": _POST,
        "showRankingScore": True,
    }
    results: list[dict] = []
    seen: set[str] = set()
    want = offset + limit
    page_size = min(max(2 * want, 40), 200)

    def collect(body: dict, semantic: bool, required: bool) -> None:
        start = 0
        while len(results) < want and start < MAX_CANDIDATES:
            try:
                found = ctx.search.search(ctx.search_index, {**body, "offset": start, "limit": page_size})
            except SearchUnavailable as exc:
                if not required:
                    log.info("bỏ qua tìm theo ý nghĩa: %s", exc)
                    return
                raise ActionError("Tìm kiếm tạm thời không dùng được", "search-unavailable", 503) from exc
            hits = [h for h in found["hits"] if (h.get("attachment_id") or h["id"]) not in seen]
            allowed = _readable(conn, person, hits)
            for hit in hits:
                key = hit.get("attachment_id") or hit["id"]
                if hit["id"] not in allowed or key in seen:
                    continue
                seen.add(key)
                field, snippet = _snippet(hit)
                score = hit.get("_rankingScore", 0.0)
                results.append(
                    {
                        "kind": hit["kind"],
                        "entity_type": hit["entity_type"],
                        "entity_id": hit["entity_id"],
                        "attachment_id": hit.get("attachment_id"),
                        "file_name": hit.get("file_name"),
                        "matched_field": None if semantic else field,
                        "snippet": snippet,
                        "score": round(score, 4),
                        "semantic_score": round(2 * score - 1, 4) if semantic else None,
                    }
                )
            if len(found["hits"]) < page_size:
                break
            start += page_size

    vector = _query_vector(ctx, query) if mode == "semantic" else None
    if mode != "semantic" or vector is None:
        # Từ khóa phải có đủ mọi từ đã gõ (như giao diện hứa): mặc định `last` của Meilisearch bỏ dần từ cuối câu nên
        # "đồ dùng văn phòng" ra mọi tài liệu có chữ "phòng" và chiếm hết chỗ của kết quả gần về ý nghĩa.
        collect({**common, "q": query, "matchingStrategy": "all"}, semantic=False, required=True)
    if mode == "hybrid" and len(results) < want:
        vector = _query_vector(ctx, query)
    if len(results) < want and vector is not None:
        semantic = {
            **common,
            "q": "",
            "vector": vector,
            "hybrid": {"embedder": EMBEDDER, "semanticRatio": 1.0},
            "rankingScoreThreshold": (1 + SEMANTIC_MIN_COS) / 2,
        }
        collect(semantic, semantic=True, required=False)
    return results[offset : offset + limit]
