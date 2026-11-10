# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import xml.etree.ElementTree as ET

import pytest

from app import delivery, process_automation, process_design, script_sandbox
from app.script_sandbox import ScriptError, run

ORDER = {"hang_muc": [{"ten": "máy in", "sl": 2, "gia": 30_000_000}, {"ten": "giấy", "sl": 1, "gia": 500_000}]}


def test_tinh_toan_nghiep_vu_thanh_bien_quy_trinh():
    out = run(
        """
tong = 0
for h in hang_muc:
    tong += h["sl"] * h["gia"]
vat = round(tong * 0.08)
can_bao_gia = tong >= 50_000_000
muc = "cao" if tong > 100_000_000 else "thường"
nhieu = [h["ten"].upper() for h in hang_muc if h["sl"] > 1]
ghi_chu = f"Tổng {tong:,} đồng; nhiều: {', '.join(nhieu)}"
han = add_days("2026-11-06", 7)
so_ngay = days_between("2026-11-01", han)
gia = {h["ten"]: h["gia"] for h in hang_muc}
re_nhat = min(gia.values())
log("tổng", tong)
""",
        ORDER,
    )
    assert out.outputs == {
        "tong": 60_500_000,
        "vat": 4_840_000,
        "can_bao_gia": True,
        "muc": "thường",
        "ghi_chu": "Tổng 60,500,000 đồng; nhiều: MÁY IN",
        "han": "2026-11-13",
        "so_ngay": 12,
        "re_nhat": 500_000,
    }, "chỉ biến kiểu đơn thành biến quy trình; list/dict là biến tạm"
    assert out.log == ["tổng 60500000"]


def test_bien_dau_vao_khong_doi_thi_khong_ghi_lai():
    out = run(
        "amount = amount\nduyet = amount > 10\nwhile amount > 10:\n    amount -= 10\n    if amount < 15:\n        break",
        {"amount": 42},
    )
    assert out.outputs == {"duyet": True, "amount": 12}


@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("import os", "Không hỗ trợ Import"),
        ("from os import path", "Không hỗ trợ ImportFrom"),
        ("x = ().__class__", "dấu gạch dưới"),
        ("__import__('os')", "dấu gạch dưới"),
        ("open('/etc/passwd')", "Không có hàm open"),
        ("eval('1+1')", "Không có hàm eval"),
        ("getattr('a', 'upper')", "Không có hàm getattr"),
        ("'{0.__class__}'.format(1)", "Không dùng được phương thức format"),
        ("'a'.encode()", "Không dùng được phương thức encode"),
        ("def f():\n    pass", "Không hỗ trợ FunctionDef"),
        ("f = lambda: 1", "Không hỗ trợ Lambda"),
        ("class A:\n    pass", "Không hỗ trợ ClassDef"),
        ("try:\n    x = 1\nexcept Exception:\n    pass", "Không hỗ trợ Try"),
        ("x = 1\nwhile True:\n    x += 1", "bước tính"),
        ("x = 'a' * 10**9", "quá lớn"),
        ("x = 2 ** 100000", "Số mũ tối đa 64"),
        ("x = [1]\nfor i in range(20):\n    x = x + x", "quá 5000 phần tử"),
        ("x = f'{1:999999999}'", "Định dạng f-string"),
        ("x = 'abc'.zfill(10**7)", "Chuỗi quá dài"),
        ("x = len\ny = x('ab')", "Không có hàm x"),
        ("x = sorted([3, 1], key=len)", "key="),
        ("x = 1 / 0", "Chia cho 0"),
        ("x = {}['k']", "Không có phần tử"),
        ("x = khong_co", "Chưa có biến khong_co"),
        ("len = 3", "Không đặt lại hàm có sẵn len"),
        ("x = (", "Sai cú pháp"),
        ("x = 1 if 1 is 2 else 0", "is / is not"),
    ],
)
def test_kich_ban_nguy_hiem_bi_chan(source, message):
    with pytest.raises(ScriptError, match=message):
        run(source)


def test_loi_co_so_dong():
    with pytest.raises(ScriptError) as err:
        run("a = 1\nb = 2\nc = a / (b - 2)")
    assert err.value.line == 3 and str(err.value).startswith("Dòng 3:")


def test_thiet_ke_kiem_kich_ban_va_chay_tu_dong():
    bamboo = process_design.BAMBOO
    el = ET.Element("serviceTask", {f"{{{bamboo}}}action": "script", f"{{{bamboo}}}script": "x = (\n"})
    params, problems = process_design.action_params(el)
    assert params["action"] == "script" and problems and problems[0].startswith("Kịch bản: Dòng 1: Sai cú pháp")
    el.set(f"{{{bamboo}}}script", "duyet_nhanh = amount < 5_000_000\nlog('đã tính')")
    params, problems = process_design.action_params(el)
    assert problems == []

    class Conn:
        def __init__(self):
            self.calls = []

        def execute(self, sql, args):
            self.calls.append(args)

    conn = Conn()
    job = {"elementId": "tinh"}
    out = process_automation.exec_script(conn, None, "run-1", job, params, {"amount": 1_000_000, "initiator": "x"})
    assert out == {"duyet_nhanh": True, "tinh_ok": True}
    assert conn.calls and conn.calls[0][0] == "tinh_log", "nhật ký kịch bản ghi vào lần chạy"
    with pytest.raises(delivery.DeliveryError) as err:
        process_automation.exec_script(conn, None, "run-1", job, {"script": "x = 1 / 0"}, {})
    assert err.value.permanent and "Chia cho 0" in str(err.value)


def test_gioi_han_mac_dinh_hop_ly():
    assert script_sandbox.MAX_STEPS >= 100_000 and script_sandbox.MAX_SECONDS <= 5
    out = run("s = 0\nfor i in range(20000):\n    s += i")
    assert out.outputs == {"s": sum(range(20000)), "i": 19999}, "biến vòng lặp cũng là biến, như Python"
