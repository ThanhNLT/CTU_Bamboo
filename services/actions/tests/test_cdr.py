# Bamboo - DX-OS Open-Core
# @version 0.5.2
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

import io
import zipfile

import pytest
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, TextStringObject
from test_quet_tep import DOCX, PDF, PNG, XLSX, ooxml

from app import attachments, cdr
from bamboo_common import scanner


def real_pdf(open_action: bool = False, trailing: bytes = b"", annot_action: str | None = None) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(200, 200)
    if open_action:
        writer.root_object[NameObject("/OpenAction")] = DictionaryObject(
            {NameObject("/S"): NameObject("/URI"), NameObject("/URI"): TextStringObject("https://example.vn")}
        )
        page[NameObject("/AA")] = DictionaryObject()
    if annot_action:
        annot = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Link"),
                NameObject("/Rect"): ArrayObject(),
                NameObject("/A"): DictionaryObject({NameObject("/S"): NameObject(annot_action)}),
            }
        )
        page[NameObject("/Annots")] = ArrayObject([writer._add_object(annot)])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue() + trailing


def real_png(exif: bool = True, trailing: bytes = b"") -> bytes:
    img = Image.new("RGB", (8, 8), (10, 120, 60))
    buf = io.BytesIO()
    params = {}
    if exif:
        meta = Image.Exif()
        meta[0x010E] = "GPS ẩn trong ảnh"
        params["exif"] = meta
    img.save(buf, "PNG", **params)
    return buf.getvalue() + trailing


def real_jpeg() -> bytes:
    meta = Image.Exif()
    meta[0x0112] = 6
    meta[0x010F] = "May anh X"
    buf = io.BytesIO()
    Image.new("RGB", (16, 8), (200, 0, 0)).save(buf, "JPEG", exif=meta)
    return buf.getvalue()


def test_anh_duoc_ma_hoa_lai_bo_exif_va_xoay_dung_chieu():
    out = cdr.sanitize(PNG, real_png())
    assert out.changed and b"GPS" not in out.data
    with Image.open(io.BytesIO(out.data)) as img:
        assert img.size == (8, 8) and not img.getexif()
    out = cdr.sanitize("image/jpeg", real_jpeg())
    with Image.open(io.BytesIO(out.data)) as img:
        assert img.size == (8, 16), "đã xoay theo EXIF trước khi bỏ EXIF"
        assert not img.getexif()
    assert scanner.scan_file("image/jpeg", out.data).verdict == "CLEAN"


def test_anh_hong_khong_duoc_nhan():
    with pytest.raises(cdr.CdrError):
        cdr.sanitize(PNG, b"\x89PNG\r\n\x1a\n" + b"rac" * 10)


def test_pdf_bo_hanh_dong_tu_chay_va_du_lieu_sau_eof():
    data = real_pdf(open_action=True, trailing=b"\n<?php system($_GET[1]); ?>")
    out = cdr.sanitize(PDF, data)
    assert out.changed and any("hành động khi mở" in a for a in out.actions), out.actions
    reader = PdfReader(io.BytesIO(out.data))
    assert "/OpenAction" not in reader.trailer["/Root"] and "/AA" not in reader.pages[0]
    assert b"<?php" not in out.data and out.data.rstrip().endswith(b"%%EOF")
    assert scanner.scan_file(PDF, out.data).verdict == "CLEAN"


def test_pdf_bo_chu_thich_co_hanh_dong_nguy_hiem():
    out = cdr.sanitize(PDF, real_pdf(annot_action="/Launch"))
    assert any("chú thích" in a for a in out.actions), out.actions
    assert not PdfReader(io.BytesIO(out.data)).pages[0].get("/Annots")


def test_pdf_da_ky_so_giu_nguyen():
    data = real_pdf().replace(b"/Type /Catalog", b"/Type /Catalog /ByteRange [0 1 2 3]")
    out = cdr.sanitize(PDF, data)
    assert out.data == data and not out.changed and "ký số" in out.skipped


def test_pdf_hong_khong_duoc_nhan():
    with pytest.raises(cdr.CdrError):
        cdr.sanitize(PDF, b"%PDF-1.7\n" + b"x" * 200 + b"\n%%EOF\n")


def test_office_bo_lien_ket_ngoai_giu_sieu_lien_ket():
    rels = (
        b'<Relationships><Relationship Id="r1" Type="http://x/image" Target="http://may-chu-la/anh.png" '
        b'TargetMode="External"/><Relationship Id="r2" Type="http://x/hyperlink" Target="https://bamboo.vn" '
        b'TargetMode="External"/><Relationship Id="r3" Type="http://x/hyperlink" Target="file://may/chia-se" '
        b'TargetMode="External"/></Relationships>'
    )
    data = ooxml("docx", {"word/_rels/document.xml.rels": rels}) + b"du lieu thua sau zip"
    out = cdr.sanitize(DOCX, data)
    body = zipfile.ZipFile(io.BytesIO(out.data)).read("word/_rels/document.xml.rels")
    assert b"may-chu-la" not in body and b"file://" not in body and b"https://bamboo.vn" in body
    assert b"du lieu thua" not in out.data


def test_xlsx_bo_so_tinh_lien_ket_ngoai():
    data = ooxml(
        "xlsx",
        {
            "xl/externalLinks/externalLink1.xml": b"<externalLink/>",
            "xl/_rels/workbook.xml.rels": b'<Relationships><Relationship Id="r9" Type="http://x/externalLink" '
            b'Target="externalLinks/externalLink1.xml"/></Relationships>',
        },
        document=b'<workbook><externalReferences><externalReference r:id="r9"/></externalReferences></workbook>',
    )
    out = cdr.sanitize(XLSX, data)
    z = zipfile.ZipFile(io.BytesIO(out.data))
    assert not [n for n in z.namelist() if "externalLinks" in n]
    assert b"externalReferences" not in z.read("xl/workbook.xml")
    assert b"r9" not in z.read("xl/_rels/workbook.xml.rels")
    assert scanner.scan_file(XLSX, out.data).verdict == "CLEAN"


def test_van_ban_bo_ky_tu_dao_huong():
    out = cdr.sanitize("text/plain", "access = ‮resu‬".encode())
    assert out.data == "access = resu".encode() and out.changed
    same = "Báo giá".encode()
    assert cdr.sanitize("text/plain", same).data == same


def test_disarm_ghi_bao_cao_va_ma_bam_ban_goc():
    data = real_png(trailing=b"")
    report: dict = {}
    clean = attachments.disarm(PNG, data, "abc", report)
    assert clean is not None and report["cdr"]["original_sha256"] == "abc"
    assert report["cdr"]["engine"] == cdr.ENGINE and report["cdr"]["actions"]
