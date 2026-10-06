# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Nhận diện, che dữ liệu cá nhân tiếng Việt bằng Presidio (ADR #43): không cần CSDL."""

import pytest

from app.pii_guard import guard, mask_value


@pytest.mark.parametrize(("text", "masked", "entities"), [
    ("Gọi chị Hương 0912 345 678 nhé", "Gọi chị Hương 0912 *** 678 nhé", ["VN_PHONE"]),
    ("SĐT: 0912.345.678", "SĐT: 0912 *** 678", ["VN_PHONE"]),
    ("liên hệ +84 912 345 678", "liên hệ 0912 *** 678", ["VN_PHONE"]),
    ("Văn phòng 024 3826 1234", "Văn phòng 0243 *** 234", ["VN_PHONE"]),
    ("CCCD 079203456789 cấp tại Hà Nội", "CCCD •••••••••789 cấp tại Hà Nội", ["VN_CCCD"]),
    ("số định danh 079 203 456 789", "số định danh •••••••••789", ["VN_CCCD"]),
    ("CMND số 123456789", "CMND số ••••••789", ["VN_CMND"]),
    ("STK 0071000123456 Vietcombank", "STK ••••••••••456 Vietcombank", ["VN_BANK_ACCOUNT"]),
    ("Số tài khoản ngân hàng: 1903 5678 9012", "Số tài khoản ngân hàng: •••••••••012", ["VN_BANK_ACCOUNT"]),
    ("gửi về nam.pv@dienthoai.tapdoanx.vn giúp", "gửi về n***@dienthoai.tapdoanx.vn giúp", ["EMAIL_ADDRESS"]),
    ("thẻ 4111 1111 1111 1111", "thẻ ••••••••••••1111", ["CREDIT_CARD"]),
    ("Chị gọi 0987654321, gửi CCCD 001190012345 qua a@b.vn",
     "Chị gọi 0987 *** 321, gửi CCCD •••••••••345 qua a***@b.vn", ["VN_PHONE", "VN_CCCD", "EMAIL_ADDRESS"]),
])
def test_che(text, masked, entities):
    out, findings = guard().mask(text)
    assert out == masked
    assert [f.entity for f in findings] == entities


@pytest.mark.parametrize("text", [
    "Tổng tiền 12.000.000 đ, đơn giá 1500000000",
    "Đề nghị PR-2026-000001 và đơn IC-2026-000001, mã nhân viên NV-2026-000012",
    "Ngày cần hàng 06/10/2026, số lượng 50000 cái, lô PMIC-2609-A",
    "Mã số 123456789 không có từ khóa",           # 9 số không đi kèm CMND
    "Tài khoản đăng nhập e2e.k3x9 đã tạo",
    "0,912345678 là tỉ lệ",
    "Hóa đơn 4111 1111 1111 1112 (không qua Luhn)",
    "",
])
def test_khong_che_nham(text):
    assert guard().mask(text) == (text, [])


def test_che_thua_duoc_chap_nhan():
    """12 chữ số bắt đầu bằng 0 luôn coi là CCCD, kể cả không có từ khóa: che thừa an toàn hơn sót."""
    assert guard().mask("mã 012345678901")[0] == "mã •••••••••901"


def test_che_json():
    data = {"title": "Mua PMIC", "note": "Gọi 0912345678", "items": [{"desc": "STK 0071000123456"}],
            "total_amount": 18000000, "doc_no": "PR-2026-000002", "nested": None}
    masked, found = guard().mask_json(data)
    assert masked == {"title": "Mua PMIC", "note": "Gọi 0912 *** 678", "items": [{"desc": "STK ••••••••••456"}],
                      "total_amount": 18000000, "doc_no": "PR-2026-000002", "nested": None}
    assert found == {"VN_PHONE", "VN_BANK_ACCOUNT"}


def test_vi_tri_va_nhan():
    findings = guard().analyze("A: 0912345678")
    assert [(f.entity, f.start, f.end, f.label) for f in findings] == [("VN_PHONE", 3, 13, "Số điện thoại")]


def test_mask_value_gia_tri_la():
    # Presidio thử lambda với chuỗi mẫu: không được ném lỗi.
    for entity in ("EMAIL_ADDRESS", "VN_PHONE", "VN_CCCD", "CREDIT_CARD"):
        assert isinstance(mask_value(entity, "PII"), str)
