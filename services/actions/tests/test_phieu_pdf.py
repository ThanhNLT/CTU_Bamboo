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

import threading
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, HTTPServer

import httpx
import pytest

from app import forms
from conftest import SETTINGS, ids, pr

PDF_QUERY = """query($id: uuid!) { get_purchase_request_pdf(request_id: $id) {
  url file_name check_code status cached expires_in } }"""


@pytest.mark.parametrize(
    "amount, words",
    [
        (0, "Không đồng"),
        (5, "Năm đồng"),
        (10, "Mười đồng"),
        (15, "Mười lăm đồng"),
        (21, "Hai mươi mốt đồng"),
        (24, "Hai mươi tư đồng"),
        (105, "Một trăm linh năm đồng"),
        (110, "Một trăm mười đồng"),
        (300_000, "Ba trăm nghìn đồng"),
        (1_000_000, "Một triệu đồng"),
        (1_005_000, "Một triệu không trăm linh năm nghìn đồng"),
        (1_234_567, "Một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy đồng"),
        (50_000_000, "Năm mươi triệu đồng"),
        (1_000_000_000, "Một tỷ đồng"),
        (2_000_005_000, "Hai tỷ không trăm linh năm nghìn đồng"),
        (1_500_000_000_000, "Một nghìn năm trăm tỷ đồng"),
        (Decimal("12000.50"), "Mười hai nghìn không trăm linh một đồng"),
    ],
)
def test_so_tien_bang_chu(amount, words):
    assert forms.amount_in_words(amount) == words


def test_dinh_dang_so():
    assert forms.number(Decimal("1234567.00")) == "1,234,567"
    assert forms.number(Decimal("1000.000"), 3) == "1,000"
    assert forms.number(Decimal("2.500"), 3) == "2.5"
    assert forms.number(Decimal("0.125"), 3) == "0.125"


def _sample(**over) -> dict:
    pr_ = {
        "id": "x",
        "tenant_id": "t",
        "doc_no": "PR-2026-000001",
        "title": "Linh kiện",
        "description": None,
        "status": "PENDING",
        "approval_round": 1,
        "total_amount": Decimal("300000"),
        "created_on": "05/10/2026",
        "needed_by": None,
        "tenant_name": "Tập đoàn X",
        "unit_name": "Phòng Mua hàng",
        "requester": "Nguyễn Văn A",
        "employee_code": None,
        "position_name": "Chuyên viên",
        "category": None,
        "partner_name": None,
        "partner_tax_code": None,
        "partner_address": None,
        "company": "Công ty Điện thoại X",
        "items": [
            {
                "line_no": 1,
                "description": "Tụ điện",
                "uom": "cái",
                "quantity": Decimal("1000.000"),
                "unit_price": Decimal("300.00"),
                "amount": Decimal("300000.00"),
                "note": None,
                "item_code": None,
            }
        ],
        "steps": [],
    }
    return {**pr_, **over}


def test_mau_escape_du_lieu_nguoi_dung():
    html = forms.render_purchase_request(
        _sample(title='<img src="http://evil/x"><script>alert(1)</script>', description="A & B")
    )
    assert "<script>" not in html and '<img src="http://evil' not in html
    assert "&lt;script&gt;" in html and "A &amp; B" in html
    assert "Ba trăm nghìn đồng" in html and "1,000" in html and "300,000" in html
    assert "Chờ duyệt" in html, "chưa duyệt thì có chữ chìm trạng thái"
    assert 'class="watermark"' not in forms.render_purchase_request(_sample(status="APPROVED"))
    assert "Đề nghị chưa gửi duyệt" in forms.render_purchase_request(_sample(status="DRAFT"))


def test_in_phieu_qua_hasura(hasura, conn, s3, gotenberg):
    i = ids(conn, "TDX", "c", "tp_mh_dt", "a")
    pr_id = pr(conn, "phieu_pdf", "c", "P_NV_MH_DT", 0, submit=False)
    conn.execute("UPDATE proc.purchase_request SET title = 'Linh kiện <dây chuyền> SMT' WHERE id = %s", (pr_id,))
    conn.execute(
        """INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
                    VALUES (%s, 'Tụ điện gốm 100nF', 'cái', 1000, 300)""",
        (pr_id,),
    )
    conn.execute("SELECT proc.submit_purchase_request(%s, %s)", (pr_id, i["c"]))

    first = hasura(PDF_QUERY, {"id": pr_id}, person=i["c"], tenant=i["TDX"])
    assert "errors" not in first, first
    first = first["data"]["get_purchase_request_pdf"]
    doc_no = conn.execute("SELECT doc_no FROM proc.purchase_request WHERE id = %s", (pr_id,)).fetchone()["doc_no"]
    assert first["file_name"] == f"{doc_no}.pdf" and first["status"] == "PENDING" and not first["cached"]
    resp = httpx.get(first["url"])
    assert resp.status_code == 200 and resp.content.startswith(b"%PDF-")
    assert resp.headers["content-type"] == "application/pdf"
    if _reachable_tika():
        text = _pdf_text(resp.content)
        for expected in (
            doc_no,
            "PHIẾU ĐỀ NGHỊ MUA SẮM",
            "Linh kiện <dây chuyền> SMT",
            "Tụ điện gốm 100nF",
            "Ba trăm nghìn đồng",
            "Đang chờ",
            f"Mã kiểm tra {first['check_code']}",
            "Trang 1/1",
        ):
            assert expected in text, (expected, text)

    again = hasura(PDF_QUERY, {"id": pr_id}, person=i["tp_mh_dt"], tenant=i["TDX"])["data"]["get_purchase_request_pdf"]
    assert again["cached"] and again["check_code"] == first["check_code"]
    denied = hasura(PDF_QUERY, {"id": pr_id}, person=i["a"], tenant=i["TDX"])
    assert denied["errors"][0]["extensions"]["code"] == "not-found"

    conn.execute("SELECT test.approve('phieu_pdf', 'tp_mh_dt')")
    approved = hasura(PDF_QUERY, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["get_purchase_request_pdf"]
    assert approved["status"] == "APPROVED" and not approved["cached"]
    assert approved["check_code"] != first["check_code"]
    if _reachable_tika():
        text = _pdf_text(httpx.get(approved["url"]).content)
        assert "Đã duyệt" in text and "Chờ duyệt" not in text, text


def test_gotenberg_khong_tai_tai_nguyen_ngoai(gotenberg):
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("0.0.0.0", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        port = server.server_address[1]
        html = f'<html><body><p>x</p><img src="http://127.0.0.1:{port}/leak.png"><img src="http://actions:8000/healthz"></body></html>'
        pdf = forms.html_to_pdf(gotenberg, html, "<html><body></body></html>")
        assert pdf.startswith(b"%PDF-")
        assert hits == [], "Gotenberg không được gọi ra mạng"
    finally:
        server.shutdown()


def _reachable_tika() -> bool:
    try:
        return httpx.get(SETTINGS.tika_url + "/version", timeout=3).status_code == 200
    except httpx.HTTPError:
        return False


def _pdf_text(data: bytes) -> str:
    resp = httpx.put(
        SETTINGS.tika_url + "/tika",
        content=data,
        timeout=60,
        headers={"Content-Type": "application/pdf", "Accept": "text/plain; charset=UTF-8"},
    )
    resp.raise_for_status()
    return " ".join(resp.content.decode("utf-8").replace("\\", "").split())
