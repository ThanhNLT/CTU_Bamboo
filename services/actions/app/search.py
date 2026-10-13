# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Tìm kiếm toàn văn (ADR #36): Meilisearch giữ chỉ mục, Apache Tika trích chữ từ tệp đính kèm.

    CSDL (trigger) ─► search.pending ─► search-sync ─► Meilisearch (index `documents`)
    search_documents ─► Meilisearch (lọc tenant) ─► CSDL lọc lại theo quyền xem (wf.entity_can_read)

Chỉ mục chỉ dùng để tìm ứng viên. Quyền xem luôn kiểm tra lại trong CSDL lúc tìm, nên tài liệu cũ
trong chỉ mục (chưa kịp đồng bộ) không làm lộ chứng từ người gọi không xem được.

Khóa API của Meilisearch suy ra từ khóa chủ và uid cố định (HMAC-SHA256, cách Meilisearch tự tính):
openbao-init ghi sẵn vào OpenBao, job bootstrap tạo khóa với đúng uid đó.
"""

# ===== Thư viện chuẩn =====
import hashlib
import hmac
import html
import time
import uuid

# ===== Thư viện bên ngoài =====
import httpx  # HTTPX
import psycopg  # psycopg

# ===== Module nội bộ =====
from .common import ActionError, Context, session_identity

# ===== Hằng số & cấu hình =====
INDEX = "documents"
# uid cố định của hai khóa API; khóa chỉ dùng được trên các index `documents*` (kể cả index kiểm thử).
SEARCH_KEY_UID = "8f1d6a52-3c1e-4c55-9a43-6a0b7f5e2c01"
INDEXER_KEY_UID = "2b7e4c90-5d2f-4b8a-8e61-0c9d3a4f7b12"
KEY_INDEXES = ["documents*"]
SEARCH_ACTIONS = ["search"]
INDEXER_ACTIONS = ["documents.add", "documents.get", "documents.delete", "indexes.get", "tasks.get", "stats.get"]

MAX_TEXT = 100_000  # ký tự trích từ một tệp
MAX_LIMIT = 50
MAX_CANDIDATES = 1000  # số ứng viên tối đa lấy từ chỉ mục cho một lần tìm
# Loại tệp có chữ để trích; ảnh chỉ tìm theo tên tệp (chưa OCR).
TEXT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}
# Ký tự đánh dấu chữ khớp (vùng dùng riêng của Unicode): escape HTML xong mới đổi thành <mark>.
_PRE, _POST = "", ""
_SNIPPET_FIELDS = ("content", "description", "items", "title", "file_name", "partner", "requester", "doc_no")


# ===== Hàm =====
def derive_key(master_key: str, uid: str) -> str:
    return hmac.new(master_key.encode(), uid.encode(), hashlib.sha256).hexdigest()


def index_settings() -> dict:
    return {
        # Thứ tự là độ ưu tiên khi xếp hạng.
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
        "filterableAttributes": ["tenant_id", "kind", "entity_type", "status"],
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
    }


def doc_id(entity_type: str, entity_id) -> str:
    return f"{entity_type.replace('.', '_')}-{entity_id}"


# ===== Lỗi (exception) =====
class SearchUnavailable(Exception):
    pass


# ===== Lớp =====
class Meili:
    """Client HTTP tối giản cho Meilisearch (chỉ các API dự án dùng)."""

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
        """Chờ tác vụ nền của Meilisearch xong; lỗi thì báo."""
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

    def document_count(self, index: str) -> int:
        return self.request("GET", f"/indexes/{index}/stats")["numberOfDocuments"]

    def search(self, index: str, body: dict) -> dict:
        return self.request("POST", f"/indexes/{index}/search", body)


# ===== Khởi tạo (job bootstrap, khóa chủ) =====


def ensure_index(admin: Meili, index: str = INDEX) -> bool:
    """Tạo index nếu chưa có và đặt cấu hình. Trả về True nếu vừa tạo."""
    created = admin.request("GET", f"/indexes/{index}", ok404=True) is None
    if created:
        admin.wait(admin.request("POST", "/indexes", {"uid": index, "primaryKey": "id"}))
    admin.wait(admin.request("PATCH", f"/indexes/{index}/settings", index_settings()))
    return created


def ensure_keys(admin: Meili) -> None:
    """Hai khóa API với uid cố định: tìm kiếm (actions) và ghi chỉ mục (search-sync).
    Khóa có sẵn mà sai quyền thì xóa rồi tạo lại (giá trị khóa không đổi vì cùng uid)."""
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
    """Tệp cấu hình Meilisearch (openbao-init ghi vào volume, khóa chủ lấy từ OpenBao)."""
    return f'master_key = "{master_key}"\nenv = "production"\ndb_path = "/meili_data/data.ms"\nno_analytics = true\n'


# ===== Trích chữ =====


def extract_text(tika_url: str, data: bytes, content_type: str, timeout: float = 120.0) -> str:
    """Chữ trong tệp (Apache Tika). Loại tệp không có chữ (ảnh) trả về chuỗi rỗng."""
    if content_type not in TEXT_TYPES or not data:
        return ""
    if content_type == "text/plain":
        return data.decode("utf-8", "replace")[:MAX_TEXT]
    try:
        resp = httpx.put(
            f"{tika_url.rstrip('/')}/tika",
            content=data,
            timeout=timeout,
            headers={"Content-Type": content_type, "Accept": "text/plain; charset=UTF-8"},
        )
    except httpx.HTTPError as exc:
        raise SearchUnavailable(f"Tika không truy cập được: {exc}") from exc
    if resp.status_code == 422:  # tệp hỏng hoặc có mật khẩu: chỉ tìm theo tên tệp
        return ""
    if resp.status_code >= 400:
        raise SearchUnavailable(f"Tika lỗi {resp.status_code}: {resp.text[:300]}")
    return " ".join(resp.content.decode("utf-8", "replace").split())[:MAX_TEXT]


# ===== Hasura Action =====


def _snippet(hit: dict) -> tuple[str | None, str]:
    """Đoạn có chữ khớp (HTML an toàn, chữ khớp bọc trong <mark>) và tên trường chứa nó."""
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
    """Id tài liệu người gọi được xem: chứng từ gốc qua wf.entity_can_read, tệp còn và sạch."""
    if not hits:
        return set()
    rows = conn.execute(
        """SELECT h.id
           FROM jsonb_to_recordset(%s::jsonb) AS h(id text, entity_type text, entity_id uuid, attachment_id uuid)
           WHERE wf.entity_can_read(h.entity_type, h.entity_id, %s)
             AND (h.attachment_id IS NULL OR EXISTS (
                     SELECT 1 FROM core.attachment a
                     WHERE a.id = h.attachment_id AND a.entity_id = h.entity_id
                       AND a.status = 'CLEAN' AND a.deleted_at IS NULL))""",
        (
            psycopg.types.json.Jsonb(
                [{k: h.get(k) for k in ("id", "entity_type", "entity_id", "attachment_id")} for h in hits]
            ),
            person,
        ),
    ).fetchall()
    return {r[0] for r in rows}


def search_documents(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> list[dict]:
    query = (args.get("query") or "").strip()
    if not query:
        raise ActionError("Nhập từ khóa để tìm", "query-required")
    if len(query) > 200:
        raise ActionError("Từ khóa tối đa 200 ký tự")
    limit = max(1, min(int(args.get("limit") or 20), MAX_LIMIT))
    offset = max(0, int(args.get("offset") or 0))
    kind = args.get("kind")
    if kind not in (None, "purchase_request", "attachment"):
        raise ActionError(f"Loại kết quả không hợp lệ: {kind}")
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if ctx.search is None:
        raise ActionError("Chưa cấu hình tìm kiếm", "unavailable", 503)

    filters = [f'tenant_id = "{uuid.UUID(tenant)}"']  # tenant của phiên, chuẩn hóa thành uuid trước khi ghép
    if kind:
        filters.append(f'kind = "{kind}"')
    body = {
        "q": query,
        "filter": " AND ".join(filters),
        "attributesToRetrieve": ["id", "kind", "entity_type", "entity_id", "attachment_id", "file_name"],
        "attributesToCrop": ["content", "description"],
        "cropLength": 24,
        "attributesToHighlight": list(_SNIPPET_FIELDS),
        "highlightPreTag": _PRE,
        "highlightPostTag": _POST,
        "showRankingScore": True,
    }
    # Lọc quyền sau khi tìm: lấy ứng viên theo từng trang tới khi đủ offset + limit kết quả xem được.
    results: list[dict] = []
    page_size = min(max(2 * (offset + limit), 40), 200)
    start = 0
    while len(results) < offset + limit and start < MAX_CANDIDATES:
        try:
            found = ctx.search.search(ctx.search_index, {**body, "offset": start, "limit": page_size})
        except SearchUnavailable as exc:
            raise ActionError("Tìm kiếm tạm thời không dùng được", "search-unavailable", 503) from exc
        hits = found["hits"]
        allowed = _readable(conn, person, hits)
        for hit in hits:
            if hit["id"] not in allowed:
                continue
            field, snippet = _snippet(hit)
            results.append(
                {
                    "kind": hit["kind"],
                    "entity_type": hit["entity_type"],
                    "entity_id": hit["entity_id"],
                    "attachment_id": hit.get("attachment_id"),
                    "file_name": hit.get("file_name"),
                    "matched_field": field,
                    "snippet": snippet,
                    "score": round(hit.get("_rankingScore", 0.0), 4),
                }
            )
        if len(hits) < page_size:
            break
        start += page_size
    return results[offset : offset + limit]
