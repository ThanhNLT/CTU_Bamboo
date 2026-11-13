# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

import pytest

from app.ocr_fields import fold, parse_document, vn_number

QUOTE = """CÔNG TY TNHH THIẾT BỊ KỸ THUẬT A   Số: BG-2026-0412
Số 25 đường Láng Hạ, quận Đống Đa, Hà Nội · MST 0101234567   Ngày lập: 21/10/2026
BẢNG BÁO GIÁ
Linh kiện sản xuất điện thoại quý IV/2026
BÊN MUA   BÊN BÁN
Công ty Điện thoại X   Công ty TNHH Thiết bị Kỹ thuật A
Hiệu lực báo giá 30 ngày kể từ ngày lập
HÀNG HÓA, DỊCH VỤ CHÀO GIÁ
TT Tên hàng hóa, dịch vụ ĐVT Số lượng Đơn giá (₫) Thành tiền (₫)
1 Chip quản lý nguồn PMIC cái 50.000 12.000 600.000.000
Mã LK-PMIC · bảo hành 12 tháng
2 Tụ điện gốm 100nF cái 200.000 300 60.000.000
Mã LK-CAP-100N
3 Dịch vụ vận chuyển nội địa chuyến 1 5.000.000 5.000.000
Giao tại kho Công ty Điện thoại X
Cộng tiền hàng 665.000.000
Thuế GTGT 10% 66.500.000
Tổng cộng 731.500.000
Bằng chữ: Bảy trăm ba mươi mốt triệu năm trăm nghìn đồng.
"""


def test_bao_gia_day_du():
    d = parse_document(QUOTE)
    assert d["doc_type"]["value"] == "QUOTE" and d["doc_no"]["value"] == "BG-2026-0412"
    assert d["date"]["value"] == "2026-10-21"
    assert d["supplier_name"]["value"] == "CÔNG TY TNHH THIẾT BỊ KỸ THUẬT A"
    assert d["supplier_tax_code"]["value"] == "0101234567"
    assert d["supplier_address"]["value"].startswith("Số 25 đường Láng Hạ")
    assert [(i["description"], i["uom"], i["quantity"], i["unit_price"], i["amount"]) for i in d["items"]] == [
        ("Chip quản lý nguồn PMIC", "cái", "50000", "12000", "600000000"),
        ("Tụ điện gốm 100nF", "cái", "200000", "300", "60000000"),
        ("Dịch vụ vận chuyển nội địa", "chuyến", "1", "5000000", "5000000"),
    ]
    assert d["items"][0]["item_code"] == "LK-PMIC" and d["items"][1]["item_code"] == "LK-CAP-100N"
    assert d["net_amount"]["value"] == "665000000" and d["vat"] == {
        "rate": 10,
        "amount": "66500000",
        "confidence": 0.85,
    }
    assert d["total_amount"]["value"] == "731500000"
    assert d["warnings"] == []


def test_so_tien_lech_bi_bao():
    bad = QUOTE.replace("200.000 300 60.000.000", "200.000 300 61.000.000").replace("731.500.000", "700.000.000")
    d = parse_document(bad)
    joined = " | ".join(d["warnings"])
    assert "Dòng 2" in joined and "Tổng các dòng" in joined and "không bằng tổng cộng" in joined
    assert d["items"][1]["confidence"] == 0.5 and d["total_amount"]["confidence"] == 0.5


def test_ocr_nhieu_van_doc_duoc():
    noisy = (
        QUOTE.replace("600.000.000", "600 .000.000")
        .replace("50.000 12.000", "50.000   12.000")
        .replace("21/10/2026", "21 / 10 / 2026")
        .replace("MST 0101234567", "MST: 0101 234567")
    )
    d = parse_document(noisy)
    assert d["items"][0]["amount"] == "600000000" and d["date"]["value"] == "2026-10-21"
    assert d["supplier_tax_code"]["value"] == "0101234567"


HOA_DON = """CÔNG TY TNHH THIẾT BỊ KỸ THUẬT A   Số: HD-0000592
Số 25 đường Láng Hạ, Đống Đa, Hà Nội · MST 0101234567-001   Ngày lập: 05/11/2026
HÓA ĐƠN BÁN HÀNG
Ký hiệu 1C26TAA
1 Chip quản lý nguồn PMIC cái 50.000 12.000 600.000.000
2 Tụ điện gốm 100nF cái 200.000 300 60.000.000
Cộng tiền hàng 660.000.000
Thuế GTGT 10% 66.000.000
Tổng cộng 726.000.000
"""


def test_hoa_don_mst_13_so():
    d = parse_document(HOA_DON)
    assert d["doc_type"]["value"] == "INVOICE" and d["supplier_tax_code"]["value"] == "0101234567-001"
    assert d["total_amount"]["value"] == "726000000" and d["warnings"] == []


def test_khong_nhan_ra_thi_noi_that():
    d = parse_document("Ghi chú nội bộ\nhôm nay họp lúc 9 giờ")
    assert d["doc_type"]["value"] == "UNKNOWN" and d["items"] == [] and d["supplier_name"] is None
    assert any("dòng hàng" in w for w in d["warnings"]) and any("loại chứng từ" in w for w in d["warnings"])
    assert parse_document("")["items"] == []


@pytest.mark.parametrize(
    ("text", "value"),
    [("12.000", 12000), ("1.234,5", 1234.5), ("2,5", 2.5), ("0,125", 0.125), ("1,234,567", 1234567), ("abc", None)],
)
def test_so_viet_nam(text, value):
    got = vn_number(text)
    assert (float(got) if got is not None else None) == value


def test_fold_bo_dau():
    assert (
        fold("Công ty TNHH Thiết bị Kỹ thuật A")
        == "cong ty tnhh thiet bi ky thuat a"
        == fold("CÔNG TY TNHH THIẾT BỊ KỸ THUẬT A")
    )
    assert fold("Đỗ Thị Hương") == "do thi huong"
