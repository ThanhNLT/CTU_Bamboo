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

"""OCR tệp đính kèm quét (ADR #52): chọn trang, gọi dịch vụ `ocr`, ghi từng trang vào core.attachment_ocr.

Ảnh luôn OCR; PDF chỉ OCR trang không có chữ (dưới MIN_PAGE_CHARS ký tự), tối đa MAX_PAGES trang.
ai-worker gọi run_once xen giữa các lượt hỏi, mỗi lần một trang, nên lượt hỏi không phải chờ cả tệp.
"""

import io
import logging
import uuid

import httpx
import psycopg
import pypdfium2 as pdfium
from PIL import Image

from .common import ActionError, Context, bind_session, require_read, session_identity

log = logging.getLogger("ocr")

MIN_PAGE_CHARS = 20
MAX_PAGES = 50
RENDER_DPI = 200
MAX_SIDE = 3200
MAX_ATTEMPTS = 5
RETRY_SECONDS = 60
OOM_ERROR = "Không đủ bộ nhớ để chạy OCR"
READ_ERROR = "Không đọc được tệp"
IMAGE_TYPES = {"image/png", "image/jpeg"}


class OcrUnavailable(Exception):
    """Dịch vụ OCR chưa chạy hoặc không trả lời: việc giữ nguyên trong hàng đợi."""


class OcrOutOfMemory(Exception):
    """Dịch vụ OCR hết VRAM khi chạy một trang."""


class OcrClient:
    def __init__(self, url: str, timeout: float = 120.0):
        self.http = httpx.Client(base_url=url.rstrip("/"), timeout=timeout)

    def _post(self, path: str, **kwargs) -> dict:
        try:
            resp = self.http.post(path, **kwargs)
        except httpx.HTTPError as exc:
            raise OcrUnavailable(f"Dịch vụ OCR không truy cập được: {exc}") from exc
        if resp.status_code == 507:
            raise OcrOutOfMemory(resp.text[:300])
        if resp.status_code >= 500:
            raise OcrUnavailable(f"Dịch vụ OCR {path}: {resp.status_code} {resp.text[:300]}")
        if resp.status_code >= 400:
            raise ValueError(f"Dịch vụ OCR từ chối ảnh: {resp.status_code} {resp.text[:300]}")
        return resp.json()

    def recognize(self, image: bytes) -> dict:
        return self._post("/ocr", content=image, headers={"Content-Type": "image/png"})

    def unload(self) -> None:
        self._post("/unload")


def _png(img: Image.Image) -> bytes:
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


def plan(content_type: str, data: bytes) -> tuple[list[int], str | None]:
    """Các trang (đếm từ 0) cần OCR và ghi chú khi bị cắt bớt."""
    if content_type in IMAGE_TYPES:
        return [0], None
    pdf = pdfium.PdfDocument(data)
    try:
        pages = []
        for i in range(len(pdf)):
            page = pdf[i]
            text = page.get_textpage().get_text_range()
            if len("".join(text.split())) < MIN_PAGE_CHARS:
                pages.append(i)
    finally:
        pdf.close()
    if len(pages) > MAX_PAGES:
        return pages[:MAX_PAGES], f"Chỉ OCR {MAX_PAGES} trang quét đầu tiên trên {len(pages)} trang"
    return pages, None


def render(content_type: str, data: bytes, page: int) -> bytes:
    if content_type in IMAGE_TYPES:
        with Image.open(io.BytesIO(data)) as img:
            return _png(img)
    pdf = pdfium.PdfDocument(data)
    try:
        return _png(pdf[page].render(scale=RENDER_DPI / 72).to_pil())
    finally:
        pdf.close()


def page_text(result: dict) -> str:
    return "\n".join(line["text"] for line in result.get("lines", []) if line.get("text"))


def claim(conn: psycopg.Connection) -> dict | None:
    return conn.execute(
        """SELECT o.attachment_id, o.tenant_id, o.status, o.pages, o.pages_done, o.attempts,
                  a.content_type, a.storage_key, a.status AS file_status, a.deleted_at
           FROM core.attachment_ocr o JOIN core.attachment a ON a.id = o.attachment_id
           WHERE o.status IN ('PENDING', 'RUNNING') AND o.next_attempt_at <= now()
           ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1"""
    ).fetchone()


def _update(conn: psycopg.Connection, attachment_id, **fields) -> None:
    sets = ", ".join(f"{k} = %s" for k in fields)
    conn.execute(
        f"UPDATE core.attachment_ocr SET {sets}, updated_at = clock_timestamp() WHERE attachment_id = %s",
        (*fields.values(), attachment_id),
    )
    conn.commit()


class Files:
    """Giữ tệp đang OCR dở trong bộ nhớ để không tải lại mỗi trang."""

    def __init__(self, read):
        self.read = read
        self.key: str | None = None
        self.data: bytes | None = None

    def get(self, key: str) -> bytes | None:
        if key != self.key:
            self.release()
            self.data = self.read(key)
            self.key = key
        return self.data

    def release(self) -> None:
        self.key, self.data = None, None


def run_once(conn: psycopg.Connection, gpu, files: Files) -> str | None:
    """OCR một trang của việc đứng đầu hàng đợi. Trả trạng thái việc sau bước này, None khi hết việc."""
    status = _run_page(conn, gpu, files)
    if status != "RUNNING":
        files.release()
    return status


def _run_page(conn: psycopg.Connection, gpu, files: Files) -> str | None:
    job = claim(conn)
    if job is None:
        conn.commit()
        return None
    aid = job["attachment_id"]
    if job["deleted_at"] is not None or job["file_status"] != "CLEAN":
        _update(conn, aid, status="SKIPPED", note="Tệp đã bị xóa")
        return "SKIPPED"
    data = files.get(job["storage_key"])
    if data is None:
        _update(conn, aid, status="ERROR", error=READ_ERROR)
        return "ERROR"
    pages = job["pages"]
    try:
        if pages is None:
            pages, note = plan(job["content_type"], data)
            if not pages:
                _update(conn, aid, status="SKIPPED", pages=[], pages_total=0, note="Tệp đã có chữ, không cần OCR")
                return "SKIPPED"
            conn.execute(
                "UPDATE core.attachment_ocr SET pages = %s, pages_total = %s, note = %s WHERE attachment_id = %s",
                (pages, len(pages), note, aid),
            )
        image = render(job["content_type"], data, pages[job["pages_done"]])
    except (pdfium.PdfiumError, OSError, ValueError) as exc:
        conn.rollback()
        log.warning("OCR %s: không đọc được tệp: %s", aid, exc)
        _update(conn, aid, status="ERROR", error=READ_ERROR)
        return "ERROR"
    try:
        result = gpu.recognize(image)
    except OcrOutOfMemory:
        conn.rollback()
        attempts = job["attempts"] + 1
        if attempts >= MAX_ATTEMPTS:
            _update(conn, aid, status="ERROR", error=OOM_ERROR, attempts=attempts)
            return "ERROR"
        log.warning("OCR %s hết VRAM, thử lại sau %s giây (lần %s)", aid, RETRY_SECONDS * attempts, attempts)
        conn.execute(
            """UPDATE core.attachment_ocr SET attempts = %s,
                      next_attempt_at = now() + make_interval(secs => %s) WHERE attachment_id = %s""",
            (attempts, RETRY_SECONDS * attempts, aid),
        )
        conn.commit()
        return job["status"]
    except OcrUnavailable:
        conn.rollback()
        raise
    except ValueError as exc:
        conn.rollback()
        log.warning("OCR %s: %s", aid, exc)
        _update(conn, aid, status="ERROR", error=READ_ERROR)
        return "ERROR"
    done = job["pages_done"] + 1
    status = "DONE" if done >= len(pages) else "RUNNING"
    conn.execute(
        """UPDATE core.attachment_ocr
           SET page_texts = page_texts || %s::text, pages_done = %s, status = %s, attempts = 0, error = NULL,
               updated_at = clock_timestamp()
           WHERE attachment_id = %s""",
        (page_text(result), done, status, aid),
    )
    conn.commit()
    return status


def text_of(conn: psycopg.Connection, attachment_id) -> str:
    """Văn bản OCR đã xong của một tệp (rỗng nếu chưa có)."""
    row = conn.execute(
        """SELECT array_to_string(page_texts, E'\\n') AS text FROM core.attachment_ocr
           WHERE attachment_id = %s AND status = 'DONE'""",
        (attachment_id,),
    ).fetchone()
    if row is None:
        return ""
    return row["text"] if isinstance(row, dict) else row[0]


def ocr_retry(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Người xem được tệp xếp lại việc OCR đã xong, bị bỏ qua hoặc lỗi; đang chờ hoặc đang chạy thì từ chối."""
    attachment_id = str(uuid.UUID(args["attachment_id"]))
    att = conn.execute(
        """SELECT tenant_id, entity_type, entity_id FROM core.attachment
           WHERE id = %s AND deleted_at IS NULL AND status = 'CLEAN'""",
        (attachment_id,),
    ).fetchone()
    person = session_identity(session, att[0] if att else None)
    if att is None:
        raise ActionError("Không tìm thấy tệp đính kèm", "not-found", 404)
    require_read(conn, att[1], att[2], person)
    row = conn.execute(
        "SELECT status FROM core.attachment_ocr WHERE attachment_id = %s FOR UPDATE", (attachment_id,)
    ).fetchone()
    if row is None:
        raise ActionError("Tệp này không cần OCR", "not-ocr", 409)
    if row[0] in ("PENDING", "RUNNING"):
        raise ActionError("Tệp đang chờ hoặc đang OCR", "busy", 409)
    bind_session(conn, session)
    conn.execute(
        """UPDATE core.attachment_ocr
           SET status = 'PENDING', pages = NULL, pages_total = NULL, pages_done = 0, page_texts = '{}', note = NULL,
               error = NULL, attempts = 0, next_attempt_at = now(), updated_at = clock_timestamp()
           WHERE attachment_id = %s""",
        (attachment_id,),
    )
    conn.execute("SELECT pg_notify('ai_question', %s)", (f"ocr:{attachment_id}",))
    return {"attachment_id": attachment_id, "status": "PENDING", "scan_result": None}


HANDLERS = {"ocr_retry": ocr_retry}
