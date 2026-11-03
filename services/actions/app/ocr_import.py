# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Nhập liệu từ bản quét (ADR #52): trả chữ đã đọc của một tệp đính kèm cùng các trường rút ra và gợi ý khớp danh mục.

Tệp là ảnh, hoặc PDF quét, đã được OCR xếp hàng khi tải lên; PDF đã có chữ thì lấy thẳng lớp chữ. Hành động chỉ đọc: việc
điền vào đề nghị mua sắm do người dùng xem lại rồi bấm lưu ở giao diện.
"""

import logging

import psycopg
import pypdfium2 as pdfium
from psycopg.rows import dict_row

from . import ocr_fields
from .common import ActionError, Context, require_read, session_identity

log = logging.getLogger("ocr-import")

MAX_TEXT = 60_000
TERMINAL = ("DONE", "SKIPPED")


def pdf_text(data: bytes) -> str:
    pdf = pdfium.PdfDocument(data)
    try:
        return "\n".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    finally:
        pdf.close()


def match_partner(rows: list[dict], name: str | None, tax_code: str | None) -> dict | None:
    """Khớp nhà cung cấp theo mã số thuế (chắc chắn nhất) rồi theo tên đã bỏ dấu."""
    digits = "".join(c for c in (tax_code or "") if c.isdigit())
    if digits:
        for r in rows:
            if "".join(c for c in (r["tax_code"] or "") if c.isdigit()) == digits:
                return {"id": str(r["id"]), "code": r["code"], "name": r["name"], "by": "tax_code"}
    folded = ocr_fields.fold(name or "")
    if folded:
        for r in rows:
            if ocr_fields.fold(r["name"]) == folded:
                return {"id": str(r["id"]), "code": r["code"], "name": r["name"], "by": "name"}
    return None


def match_items(rows: list[dict], items: list[dict]) -> list[dict | None]:
    by_code = {r["code"].casefold(): r for r in rows}
    by_name = {ocr_fields.fold(r["name"]): r for r in rows}
    out: list[dict | None] = []
    for it in items:
        hit = by_code.get((it.get("item_code") or "").casefold()) or by_name.get(ocr_fields.fold(it["description"]))
        out.append(
            {
                "id": str(hit["id"]),
                "code": hit["code"],
                "name": hit["name"],
                "uom": hit["uom"],
                "category_code": hit["category_code"],
                "ref_price": str(hit["ref_price"]) if hit["ref_price"] is not None else None,
            }
            if hit
            else None
        )
    return out


def ocr_document(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    cur = conn.cursor(row_factory=dict_row)
    att = cur.execute(
        """SELECT id, tenant_id, entity_type, entity_id, file_name, content_type, storage_key, status
           FROM core.attachment WHERE id = %s AND deleted_at IS NULL""",
        (args["attachment_id"],),
    ).fetchone()
    person = session_identity(session, att["tenant_id"] if att else None)
    if att is None:
        raise ActionError("Không tìm thấy tệp đính kèm", "not-found", 404)
    require_read(conn, att["entity_type"], att["entity_id"], person)
    base = {"attachment_id": str(att["id"]), "file_name": att["file_name"], "scan_status": att["status"]}
    if att["status"] != "CLEAN":
        return {**base, "phase": "SCANNING" if att["status"] == "PENDING" else "REJECTED", "text": None, "parsed": None}
    ocr = cur.execute(
        """SELECT status, pages_total, pages_done, note, error, page_texts FROM core.attachment_ocr
           WHERE attachment_id = %s""",
        (att["id"],),
    ).fetchone()
    if ocr is None:
        return {
            **base,
            "phase": "UNSUPPORTED",
            "text": None,
            "parsed": None,
            "message": "Loại tệp này không đọc được chữ; dùng ảnh PNG, JPEG hoặc PDF",
        }
    progress = {
        "pages_total": ocr["pages_total"],
        "pages_done": ocr["pages_done"],
        "note": ocr["note"],
        "error": ocr["error"],
    }
    if ocr["status"] not in TERMINAL:
        return {
            **base,
            "phase": {"PENDING": "QUEUED", "RUNNING": "OCR", "ERROR": "ERROR"}[ocr["status"]],
            "ocr": progress,
            "text": None,
            "parsed": None,
        }
    if ocr["status"] == "DONE":
        text = "\n".join(ocr["page_texts"])
    else:  # PDF đã có chữ: lấy lớp chữ sẵn có
        if ctx.storage is None:
            raise ActionError("Chưa cấu hình kho tệp", "unavailable", 503)
        data = ctx.storage.read_stored(att["storage_key"])
        if data is None:
            raise ActionError("Không tìm thấy nội dung tệp", "not-found", 404)
        try:
            text = pdf_text(data)
        except pdfium.PdfiumError as exc:
            raise ActionError("Không đọc được tệp PDF", "bad-file", 422) from exc
    text = text[:MAX_TEXT]
    parsed = ocr_fields.parse_document(text)
    tenant = att["tenant_id"]
    partners = cur.execute(
        "SELECT id, code, name, tax_code FROM mdm.partner WHERE tenant_id = %s AND is_active", (tenant,)
    ).fetchall()
    catalog = cur.execute(
        "SELECT id, code, name, uom, category_code, ref_price FROM mdm.item WHERE tenant_id = %s AND is_active",
        (tenant,),
    ).fetchall()
    supplier = parsed["supplier_name"]["value"] if parsed["supplier_name"] else None
    tax = parsed["supplier_tax_code"]["value"] if parsed["supplier_tax_code"] else None
    return {
        **base,
        "phase": "READY",
        "ocr": progress,
        "text": text,
        "parsed": parsed,
        "partner": match_partner(partners, supplier, tax),
        "item_matches": match_items(catalog, parsed["items"]),
        "doc_label": ocr_fields.DOC_LABELS[parsed["doc_type"]["value"]],
    }


HANDLERS = {"ocr_document": ocr_document}
