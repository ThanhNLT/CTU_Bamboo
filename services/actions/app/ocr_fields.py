"""Rút các trường của báo giá, hóa đơn, phiếu giao nhận từ chữ OCR (ADR #52).

Chữ OCR sai được, nên mọi trường đều kèm độ tin cậy và dòng nguồn, và số tiền được tự kiểm: số lượng × đơn giá phải bằng
thành tiền, tổng các dòng phải bằng cộng tiền hàng, cộng tiền hàng + thuế phải bằng tổng cộng. Chỗ nào lệch thì hạ độ tin
cậy và báo để người dùng xem lại; không bao giờ tự điền con số không khớp mà không báo.
"""

import re
import unicodedata
from decimal import Decimal, InvalidOperation

DOC_TYPES = {
    "QUOTE": ("bảng báo giá", "báo giá", "chào giá"),
    "INVOICE": ("hóa đơn",),
    "DELIVERY": ("phiếu giao nhận", "phiếu xuất kho", "biên bản giao nhận", "phiếu giao hàng"),
    "REQUEST": ("phiếu đề nghị mua sắm", "đề nghị mua sắm"),
}
DOC_LABELS = {
    "QUOTE": "Báo giá",
    "INVOICE": "Hóa đơn",
    "DELIVERY": "Phiếu giao nhận",
    "REQUEST": "Phiếu đề nghị mua sắm",
    "UNKNOWN": "Chưa nhận ra loại chứng từ",
}

_NUM = r"\d{1,3}(?:\s*[.,]\s*\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?"
_DATE = re.compile(r"(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(20\d{2})(?!\d)")
_DATE_WORDS = re.compile(r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(20\d{2})", re.I)
_DOC_NO = re.compile(r"(?:^|\s)Số\s*(?:chứng từ|hóa đơn)?\s*[:.]\s*([A-Z0-9][A-Z0-9\-/.]{3,24})", re.I)
_TAX = re.compile(r"(?:MST|M\.S\.T|mã số thuế)\s*[:.]?\s*(\d(?:\s?\d){9}(?:\s?-\s?\d{3})?)(?!\d)", re.I)
_ITEM_ROW = re.compile(
    rf"^\s*(\d{{1,3}})\s+(?P<desc>.+?)\s+(?P<uom>[^\W\d_][\w./]{{0,9}})\s+(?P<qty>{_NUM})\s+(?P<price>{_NUM})\s+(?P<amount>{_NUM})\s*$"
)
_CODE = re.compile(r"\b([A-Z]{2,5}(?:-[A-Z0-9]{1,12}){1,3})\b")
_TOTAL_NET = re.compile(rf"(?:cộng tiền hàng|cộng tiền|thành tiền trước thuế)\D{{0,12}}({_NUM})\s*$", re.I)
_VAT = re.compile(rf"thuế\s*(?:GTGT|VAT)?\s*(\d{{1,2}})\s*%\D{{0,6}}({_NUM})\s*$", re.I)
_TOTAL = re.compile(rf"(?:tổng cộng|tổng thanh toán|tổng tiền)\D{{0,25}}({_NUM})\s*$", re.I)
_LEGAL = re.compile(
    r"^(công ty|cty|doanh nghiệp|dn|hợp tác xã|tập đoàn|tổng công ty|chi nhánh|nhà máy|bệnh viện|trung tâm)\b", re.I
)


def vn_number(text: str) -> Decimal | None:
    """12.000 → 12000; 1.234,5 → 1234.5; 2,5 → 2.5. Khoảng trắng giữa các nhóm số do OCR tách được bỏ."""
    t = re.sub(r"\s", "", text.strip())
    if not re.fullmatch(r"[\d.,]+", t):
        return None
    if "," in t and "." in t:
        last = max(t.rfind(","), t.rfind("."))
        t = t[:last].replace(".", "").replace(",", "") + "." + t[last + 1 :]
    else:
        sep = "," if "," in t else "." if "." in t else ""
        if sep:
            head, _, tail = t.rpartition(sep)
            grouped = t.count(sep) > 1 or (len(tail) == 3 and head not in ("0", ""))
            t = t.replace(sep, "") if grouped else head + "." + tail
    try:
        return Decimal(t)
    except InvalidOperation:
        return None


def fold(text: str) -> str:
    """Bỏ dấu, hạ chữ thường, gom khoảng trắng: để so tên khi OCR sai dấu."""
    t = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def _field(value, confidence: float, source: str | None = None) -> dict:
    return {"value": value, "confidence": round(confidence, 2), "source": source}


def _num_str(d: Decimal) -> str:
    return format(d.normalize(), "f") if d == d.to_integral() else format(d, "f")


def _find_type(lines: list[str]) -> tuple[str, str | None]:
    head = [ln for ln in lines[:14]]
    for ln in head:
        low = ln.casefold()
        for kind, words in DOC_TYPES.items():
            if any(w in low for w in words) and (ln.isupper() or len(ln) < 40):
                return kind, ln
    return "UNKNOWN", None


def _supplier(lines: list[str]) -> tuple[dict | None, dict | None, dict | None]:
    """(tên, mã số thuế, địa chỉ) của bên phát hành: dòng pháp nhân đầu tiên ở đầu trang."""
    name = tax = addr = None
    for i, ln in enumerate(lines[:10]):
        left = re.split(r"\s{2,}|\sSố\s*[:.]", ln)[0].strip()
        if _LEGAL.match(left) and len(left) >= 8:
            conf = 0.9 if left.isupper() else 0.7
            name = _field(left, conf, ln)
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            m = _TAX.search(ln) or _TAX.search(nxt)
            if m:
                digits = re.sub(r"\D", "", m.group(1))
                tax = _field(digits[:10] + ("-" + digits[10:] if len(digits) > 10 else ""), 0.9, m.group(0))
            if nxt and not _LEGAL.match(nxt):
                a = re.split(r"[·•|]\s*(?:MST|Mã số thuế)|\s+MST\b", nxt, flags=re.I)[0].strip(" ·•|-,")
                if len(a) >= 8 and not re.match(r"(số|ngày)\s*[:.]", a, re.I):
                    addr = _field(a, 0.7, nxt)
            break
    if tax is None:
        for ln in lines:
            m = _TAX.search(ln)
            if m:
                digits = re.sub(r"\D", "", m.group(1))
                tax = _field(digits[:10] + ("-" + digits[10:] if len(digits) > 10 else ""), 0.6, ln)
                break
    return name, tax, addr


def _items(lines: list[str]) -> list[dict]:
    rows = []
    for i, ln in enumerate(lines):
        m = _ITEM_ROW.match(ln)
        if not m:
            continue
        qty, price, amount = (vn_number(m.group(k)) for k in ("qty", "price", "amount"))
        if qty is None or price is None or amount is None:
            continue
        desc = m.group("desc").strip()
        note = None
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if (
            nxt
            and not _ITEM_ROW.match(nxt)
            and not re.match(r"^(cộng|thuế|tổng|bằng chữ)", nxt, re.I)
            and len(nxt) < 90
        ):
            note = nxt.strip()
        code_m = _CODE.search(note or "") or _CODE.search(desc)
        consistent = abs(qty * price - amount) <= max(Decimal("1"), amount * Decimal("0.001"))
        rows.append(
            {
                "line_no": len(rows) + 1,
                "description": re.sub(r"\s+", " ", desc),
                "uom": m.group("uom"),
                "quantity": _num_str(qty),
                "unit_price": _num_str(price),
                "amount": _num_str(amount),
                "item_code": code_m.group(1) if code_m else None,
                "note": note,
                "consistent": consistent,
                "confidence": 0.9 if consistent else 0.5,
                "source": ln,
            }
        )
    return rows


def _money(pattern: re.Pattern, lines: list[str], group: int = 1) -> tuple[Decimal | None, str | None]:
    for ln in lines:
        m = pattern.search(ln)
        if m:
            v = vn_number(m.group(group))
            if v is not None:
                return v, ln
    return None, None


def parse_document(text: str) -> dict:
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]
    warnings: list[str] = []
    kind, kind_line = _find_type(lines)
    out: dict = {"doc_type": _field(kind, 0.9 if kind != "UNKNOWN" else 0.0, kind_line), "warnings": warnings}

    m = next((x for x in (_DOC_NO.search(ln) for ln in lines[:12]) if x), None)
    out["doc_no"] = _field(m.group(1).rstrip(".-"), 0.85, m.group(0).strip()) if m else None

    date = None
    for ln in lines:
        if re.search(r"ngày\s*lập", ln, re.I) and (d := _DATE.search(ln)):
            date = (d, ln, 0.9)
            break
    if date is None:
        for ln in lines:
            d = _DATE.search(ln) or _DATE_WORDS.search(ln)
            if d:
                date = (d, ln, 0.7)
                break
    if date:
        d, ln, conf = date
        day, month, year = int(d.group(1)), int(d.group(2)), int(d.group(3))
        if 1 <= day <= 31 and 1 <= month <= 12:
            out["date"] = _field(f"{year:04d}-{month:02d}-{day:02d}", conf, ln)
        else:
            out["date"] = None
            warnings.append("Ngày đọc được không hợp lệ, hãy nhập lại")
    else:
        out["date"] = None

    name, tax, addr = _supplier(lines)
    out["supplier_name"], out["supplier_tax_code"], out["supplier_address"] = name, tax, addr

    items = _items(lines)
    out["items"] = items
    net, net_src = _money(_TOTAL_NET, lines)
    vat_m = next((x for x in (_VAT.search(ln) for ln in lines) if x), None)
    total, total_src = _money(_TOTAL, lines)
    out["net_amount"] = _field(_num_str(net), 0.85, net_src) if net is not None else None
    out["vat"] = (
        {"rate": int(vat_m.group(1)), "amount": _num_str(vn_number(vat_m.group(2)) or Decimal(0)), "confidence": 0.85}
        if vat_m
        else None
    )
    out["total_amount"] = _field(_num_str(total), 0.85, total_src) if total is not None else None

    line_sum = sum((Decimal(i["amount"]) for i in items), Decimal(0))
    for i in items:
        if not i["consistent"]:
            warnings.append(f"Dòng {i['line_no']}: số lượng × đơn giá khác thành tiền, hãy đối chiếu bản gốc")
    if items and net is not None and abs(line_sum - net) > Decimal(1):
        warnings.append(f"Tổng các dòng ({_num_str(line_sum)}) khác cộng tiền hàng ({_num_str(net)})")
        out["net_amount"]["confidence"] = 0.5
    if net is not None and total is not None:
        vat_amount = vn_number(out["vat"]["amount"]) if out["vat"] else Decimal(0)
        if abs(net + (vat_amount or 0) - total) > Decimal(1):
            warnings.append("Cộng tiền hàng và thuế không bằng tổng cộng")
            out["total_amount"]["confidence"] = 0.5
    if total is None and items:
        out["total_amount"] = _field(_num_str(line_sum), 0.6, "Cộng các dòng hàng")
    if not items:
        warnings.append("Không nhận ra dòng hàng nào; hãy nhập tay hoặc chụp lại rõ hơn")
    if kind == "UNKNOWN":
        warnings.append("Chưa nhận ra loại chứng từ")
    if name is None:
        warnings.append("Chưa nhận ra tên nhà cung cấp")
    return out
