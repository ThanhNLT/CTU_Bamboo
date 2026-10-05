# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Phiếu PDF của chứng từ (ADR #37): HTML từ mẫu Jinja2, Gotenberg (Chromium) chuyển sang PDF.

    get_purchase_request_pdf ─► quyền xem (wf.entity_can_read) ─► dữ liệu từ CSDL ─► HTML (escape tự động)
        ─► mã nội dung sha256(HTML) ─► đã có trong bucket tài liệu? ── có ─► link tải về có chữ ký
                                                                   └ chưa ─► Gotenberg ─► lưu ─┘

Phiếu chỉ chứa dữ liệu của chứng từ (không có giờ in), nên cùng nội dung thì cùng tệp: in lại không
gọi Gotenberg. Mã kiểm tra in ở chân trang là 16 ký tự đầu của mã nội dung.
"""

import hashlib
import pathlib
from decimal import ROUND_HALF_UP, Decimal

import httpx
import jinja2
import psycopg
from psycopg.rows import dict_row

from . import storage
from .common import ActionError, Context, require_read, session_identity

TEMPLATES = pathlib.Path(__file__).resolve().parent / "templates"
# Đổi khi sửa mẫu theo cách không làm đổi HTML (ví dụ tùy chọn khổ giấy) để không dùng lại tệp cũ.
FORM_VERSION = "1"
A4 = {"paperWidth": "8.27", "paperHeight": "11.69", "marginTop": "0.6", "marginBottom": "0.7",
      "marginLeft": "0.6", "marginRight": "0.6", "printBackground": "true", "preferCssPageSize": "false"}

_env = jinja2.Environment(loader=jinja2.FileSystemLoader(TEMPLATES), autoescape=True,
                          undefined=jinja2.StrictUndefined, trim_blocks=True, lstrip_blocks=True)

STATUS_LABELS = {"DRAFT": "Bản nháp", "PENDING": "Chờ duyệt", "RETURNED": "Bị trả về", "APPROVED": "Đã duyệt",
                 "REJECTED": "Từ chối", "CANCELLED": "Đã hủy"}
STEP_LABELS = {"WAITING": "Chưa tới", "ACTIVE": "Đang chờ", "APPROVED": "Đã duyệt", "REJECTED": "Từ chối",
               "RETURNED": "Trả về", "CANCELLED": "Đã hủy"}

# --- Số tiền bằng chữ -----------------------------------------------------------------

_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]


def _triple(n: int, full: bool) -> list[str]:
    """Đọc số 0–999. `full`: nhóm đứng sau nhóm khác nên đọc đủ "không trăm", "linh"."""
    a, b, c = n // 100, n // 10 % 10, n % 10
    words = []
    if full or a:
        words += [_DIGITS[a], "trăm"]
    if b == 0:
        if c and (full or a):
            words.append("linh")
    elif b == 1:
        words.append("mười")
    else:
        words += [_DIGITS[b], "mươi"]
    if c:
        if c == 1 and b > 1:
            words.append("mốt")
        elif c == 5 and b > 0:
            words.append("lăm")
        elif c == 4 and b > 1:
            words.append("tư")
        else:
            words.append(_DIGITS[c])
    return words


def _words(n: int, full: bool = False) -> list[str]:
    if n >= 1_000_000_000:
        rest = n % 1_000_000_000
        return _words(n // 1_000_000_000, full) + ["tỷ"] + (_words(rest, True) if rest else [])
    words = []
    for unit, value in (("triệu", n // 1_000_000), ("nghìn", n // 1000 % 1000), ("", n % 1000)):
        if value:
            words += _triple(value, full) + ([unit] if unit else [])
            full = True
    return words


def amount_in_words(amount) -> str:
    """Số tiền VND bằng chữ, ví dụ 1234567 → "Một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy đồng"."""
    n = int(Decimal(amount).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if n < 0:
        raise ValueError("Số tiền âm")
    text = " ".join(_words(n)) if n else "không"
    return text[0].upper() + text[1:] + " đồng"


def number(value, decimals: int = 0) -> str:
    """Định dạng số kiểu Việt Nam: 1.234.567,5 (bỏ số 0 thừa ở phần thập phân)."""
    d = Decimal(value)
    whole = int(d.quantize(Decimal(1), rounding=ROUND_HALF_UP)) if decimals == 0 else int(d)
    text = f"{whole:,}".replace(",", ".")
    if decimals:
        frac = str(abs(d) % 1)[2:2 + decimals].rstrip("0")
        if frac:
            text += "," + frac
    return text


_env.filters["number"] = number

# --- Dữ liệu ----------------------------------------------------------------------------


def _purchase_request(conn: psycopg.Connection, request_id: str) -> dict:
    cur = conn.cursor(row_factory=dict_row)
    pr = cur.execute(
        """SELECT r.id, r.tenant_id, r.doc_no, r.title, r.description, r.status, r.approval_round, r.total_amount,
                  to_char(r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS created_on,
                  to_char(r.needed_by, 'DD/MM/YYYY') AS needed_by,
                  t.name AS tenant_name, u.name AS unit_name, p.full_name AS requester, p.employee_code,
                  pos.name AS position_name, cat.name AS category,
                  pa.name AS partner_name, pa.tax_code AS partner_tax_code, pa.address AS partner_address,
                  (SELECT le.name FROM core.org_unit le
                   WHERE le.tenant_id = u.tenant_id AND le.is_legal_entity AND le.path @> u.path
                   ORDER BY nlevel(le.path) DESC LIMIT 1) AS company
           FROM proc.purchase_request r
           JOIN core.tenant t ON t.id = r.tenant_id
           JOIN core.org_unit u ON u.id = r.org_unit_id
           JOIN core.person p ON p.id = r.requester_id
           JOIN core.position pos ON pos.id = r.requester_position_id
           LEFT JOIN core.catalog_item cat ON cat.tenant_id = r.tenant_id AND cat.catalog = 'ITEM_CATEGORY'
                                          AND cat.code = r.category_code
           LEFT JOIN mdm.partner pa ON pa.id = r.partner_id
           WHERE r.id = %s""", (request_id,)).fetchone()
    pr["items"] = cur.execute(
        """SELECT i.line_no, i.description, i.uom, i.quantity, i.unit_price, i.amount, i.note, m.code AS item_code
           FROM proc.purchase_request_item i LEFT JOIN mdm.item m ON m.id = i.item_id
           WHERE i.request_id = %s ORDER BY i.line_no""", (request_id,)).fetchall()
    # Chuỗi duyệt của lần gửi duyệt gần nhất.
    pr["steps"] = cur.execute(
        """SELECT s.step_order, s.status, pos.name AS position_name, actor.full_name AS acted_by,
                  principal.full_name AS on_behalf_of, s.note,
                  to_char(s.acted_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS acted_at
           FROM wf.approval_step s
           JOIN core.position pos ON pos.id = s.position_id
           LEFT JOIN core.person actor ON actor.id = s.acted_by
           LEFT JOIN core.person principal ON principal.id = s.on_behalf_of
           WHERE s.entity_type = 'proc.purchase_request' AND s.entity_id = %s AND s.round = %s
           ORDER BY s.step_order""", (request_id, pr["approval_round"])).fetchall()
    return pr


def render_purchase_request(pr: dict) -> str:
    return _env.get_template("phieu_de_nghi_mua_sam.html").render(
        pr=pr, status_label=STATUS_LABELS.get(pr["status"], pr["status"]), step_labels=STEP_LABELS,
        amount_words=amount_in_words(pr["total_amount"]))


def footer(doc_no: str, check_code: str) -> str:
    return _env.get_template("chan_trang.html").render(doc_no=doc_no, check_code=check_code)


# --- Gotenberg --------------------------------------------------------------------------

class PdfUnavailable(Exception):
    pass


def html_to_pdf(gotenberg_url: str, html: str, footer_html: str, timeout: float = 60.0) -> bytes:
    """Chromium của Gotenberg in HTML ra PDF khổ A4. Trang không tải tài nguyên ngoài (CSS nhúng sẵn)."""
    files = [("files", ("index.html", html.encode(), "text/html")),
             ("files", ("footer.html", footer_html.encode(), "text/html"))]
    try:
        resp = httpx.post(f"{gotenberg_url.rstrip('/')}/forms/chromium/convert/html", data=A4, files=files,
                          timeout=timeout)
    except httpx.HTTPError as exc:
        raise PdfUnavailable(f"Gotenberg không truy cập được: {exc}") from exc
    if resp.status_code != 200 or not resp.content.startswith(b"%PDF-"):
        raise PdfUnavailable(f"Gotenberg lỗi {resp.status_code}: {resp.text[:300]}")
    return resp.content


# --- Hasura Action ----------------------------------------------------------------------

def get_purchase_request_pdf(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    request_id = args["request_id"]
    row = conn.execute("SELECT tenant_id FROM proc.purchase_request WHERE id = %s", (request_id,)).fetchone()
    person = session_identity(session, row[0] if row else None)
    require_read(conn, "proc.purchase_request", request_id, person)
    if ctx.storage is None or not ctx.gotenberg_url:
        raise ActionError("Chưa cấu hình in phiếu", "unavailable", 503)

    pr = _purchase_request(conn, request_id)
    content = hashlib.sha256(f"{FORM_VERSION}\n".encode())
    html = render_purchase_request(pr)
    content.update(html.encode())
    digest = content.hexdigest()
    key = f"{pr['tenant_id']}/proc.purchase_request/{request_id}/forms/{digest}.pdf"
    file_name = f"{pr['doc_no']}.pdf"
    cached = ctx.storage.document_exists(key)
    if not cached:
        try:
            pdf = html_to_pdf(ctx.gotenberg_url, html, footer(pr["doc_no"], digest[:16].upper()))
        except PdfUnavailable as exc:
            raise ActionError("Tạm thời chưa in được phiếu, thử lại sau", "pdf-unavailable", 503) from exc
        ctx.storage.put_document(key, pdf, "application/pdf")
    return {"request_id": request_id, "file_name": file_name, "check_code": digest[:16].upper(),
            "status": pr["status"], "cached": cached, "expires_in": storage.DOWNLOAD_TTL,
            "url": ctx.storage.download_url(key, file_name, "application/pdf")}
