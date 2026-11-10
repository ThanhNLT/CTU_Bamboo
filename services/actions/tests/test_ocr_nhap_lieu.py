# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import hashlib
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row
from test_ocr_truong import QUOTE

from app import ocr_import
from app.common import ActionError, Context
from conftest import ids, pr


@pytest.fixture
def cur(database):
    with psycopg.connect(database, row_factory=dict_row, autocommit=True) as c:
        yield c


@pytest.fixture
def app_conn(database):
    with psycopg.connect(database, autocommit=True) as c:
        yield c


def attach(cur, request_id, tenant, person, name, ctype="image/png", status="CLEAN"):
    aid = uuid.uuid4()
    cur.execute(
        """INSERT INTO core.attachment (tenant_id, id, entity_type, entity_id, file_name, content_type, size_bytes,
                                        storage_key, status, uploaded_by, scan_engines, sha256)
           VALUES (%s, %s, 'proc.purchase_request', %s, %s, %s, 10, %s, %s, %s, ARRAY['test'], %s)""",
        (
            tenant,
            aid,
            request_id,
            name,
            ctype,
            f"{tenant}/{aid}",
            status,
            person,
            hashlib.sha256(str(aid).encode()).hexdigest(),
        ),
    )
    return str(aid)


def sess(person, tenant):
    return {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant}


def test_doc_ban_quet_da_ocr_va_khop_danh_muc(cur, app_conn):
    i = ids(cur, "TDX", "c", "a")
    request = pr(cur, "ocr_nhap", "c", "P_NV_MH_DT", 1_000_000, submit=False)
    sfx = uuid.uuid4().hex[:6].upper()
    tax = "01" + str(uuid.uuid4().int)[:8]
    name = f"Công ty TNHH Thiết bị Kỹ thuật {sfx}"
    code = f"LK-PMIC-{sfx}"
    text = (
        QUOTE.replace("CÔNG TY TNHH THIẾT BỊ KỸ THUẬT A", name.upper())
        .replace("0101234567", tax)
        .replace("LK-PMIC", code)
    )
    partner = cur.execute(
        "INSERT INTO mdm.partner (tenant_id, code, name, tax_code) VALUES (%s, %s, %s, %s) RETURNING id",
        (i["TDX"], f"NCC_{sfx}", name, tax),
    ).fetchone()["id"]
    item = cur.execute(
        "INSERT INTO mdm.item (tenant_id, code, name, uom, category_code, ref_price) VALUES (%s, %s, 'Chip quản lý nguồn PMIC', 'cái', NULL, 12000) RETURNING id",
        (i["TDX"], code),
    ).fetchone()["id"]
    aid = attach(cur, request, i["TDX"], i["c"], "bao-gia.png")
    me = sess(i["c"], i["TDX"])

    cur.execute(
        "INSERT INTO core.attachment_ocr (tenant_id, attachment_id, status) VALUES (%s, %s, 'RUNNING')", (i["TDX"], aid)
    )
    running = ocr_import.ocr_document(app_conn, me, {"attachment_id": aid}, Context())
    assert running["phase"] == "OCR" and running["parsed"] is None

    cur.execute(
        "UPDATE core.attachment_ocr SET status = 'DONE', pages = '{0}', pages_total = 1, pages_done = 1, page_texts = %s WHERE attachment_id = %s",
        ([text], aid),
    )
    out = ocr_import.ocr_document(app_conn, me, {"attachment_id": aid}, Context())
    assert out["phase"] == "READY" and out["doc_label"] == "Báo giá"
    assert out["parsed"]["total_amount"]["value"] == "731500000" and out["parsed"]["warnings"] == []
    assert out["partner"]["id"] == str(partner) and out["partner"]["by"] == "tax_code"
    assert out["item_matches"][0]["id"] == str(item) and out["item_matches"][1] is None

    with pytest.raises(ActionError) as err:
        ocr_import.ocr_document(app_conn, sess(i["a"], i["TDX"]), {"attachment_id": aid}, Context())
    assert err.value.status == 404


def test_chua_quet_xong_hoac_khong_ho_tro(cur, app_conn):
    i = ids(cur, "TDX", "c")
    request = pr(cur, "ocr_pha", "c", "P_NV_MH_DT", 1_000_000, submit=False)
    me = sess(i["c"], i["TDX"])
    waiting = attach(cur, request, i["TDX"], i["c"], "x.png", status="PENDING")
    assert ocr_import.ocr_document(app_conn, me, {"attachment_id": waiting}, Context())["phase"] == "SCANNING"
    rejected = attach(cur, request, i["TDX"], i["c"], "y.png", status="REJECTED")
    assert ocr_import.ocr_document(app_conn, me, {"attachment_id": rejected}, Context())["phase"] == "REJECTED"
    docx = attach(
        cur,
        request,
        i["TDX"],
        i["c"],
        "z.docx",
        ctype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    cur.execute("DELETE FROM core.attachment_ocr WHERE attachment_id = %s", (docx,))
    assert ocr_import.ocr_document(app_conn, me, {"attachment_id": docx}, Context())["phase"] == "UNSUPPORTED"
    errored = attach(cur, request, i["TDX"], i["c"], "e.png")
    cur.execute(
        "INSERT INTO core.attachment_ocr (tenant_id, attachment_id, status, error) VALUES (%s, %s, 'ERROR', 'Không đọc được tệp')",
        (i["TDX"], errored),
    )
    assert ocr_import.ocr_document(app_conn, me, {"attachment_id": errored}, Context())["phase"] == "ERROR"


def test_khop_nha_cung_cap_theo_ten_khi_khong_co_mst():
    rows = [{"id": uuid.uuid4(), "code": "A", "name": "Công ty TNHH Thiết bị Kỹ thuật A", "tax_code": None}]
    assert ocr_import.match_partner(rows, "CÔNG TY TNHH THIẾT BỊ KỸ THUẬT A", None)["by"] == "name"
    assert ocr_import.match_partner(rows, "Công ty khác", "999") is None


def make_pdf(lines: list[str]) -> bytes:
    """PDF một trang có lớp chữ (Helvetica, chỉ ASCII) để thử đường đọc thẳng lớp chữ."""
    stream = "BT /F1 11 Tf 40 780 Td 14 TL " + " ".join(f"({ln}) Tj T*" for ln in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = "%PDF-1.4\n", []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{body}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


class FakeStorage:
    def __init__(self, data):
        self.data = data

    def read_stored(self, key):
        return self.data


def test_pdf_da_co_chu_lay_thang_lop_chu(cur, app_conn):
    i = ids(cur, "TDX", "c")
    request = pr(cur, "ocr_pdf_chu", "c", "P_NV_MH_DT", 1_000_000, submit=False)
    aid = attach(cur, request, i["TDX"], i["c"], "bao-gia.pdf", ctype="application/pdf")
    cur.execute(
        "INSERT INTO core.attachment_ocr (tenant_id, attachment_id, status, note) VALUES (%s, %s, 'SKIPPED', 'Tệp đã có chữ')",
        (i["TDX"], aid),
    )
    text = [
        "CONG TY TNHH VAN PHONG PHAM C   So: BG-77",
        "So 9 duong Lang, Ha Noi MST 0102345678   Ngay lap: 02/11/2026",
        "BANG BAO GIA",
        "1 Giay in A4 ram 50 70.000 3.500.000",
        "Cong tien hang 3.500.000",
        "Tong cong 3.500.000",
    ]
    out = ocr_import.ocr_document(
        app_conn, sess(i["c"], i["TDX"]), {"attachment_id": aid}, Context(storage=FakeStorage(make_pdf(text)))
    )
    assert out["phase"] == "READY" and "BANG BAO GIA" in out["text"]
    assert out["parsed"]["doc_type"]["value"] == "UNKNOWN" or out["parsed"]["items"], (
        "đọc được lớp chữ (không dấu nên chỉ kiểm có chữ)"
    )
    assert out["parsed"]["date"]["value"] == "2026-11-02"
    with pytest.raises(ActionError) as err:
        ocr_import.ocr_document(app_conn, sess(i["c"], i["TDX"]), {"attachment_id": aid}, Context())
    assert err.value.status == 503
