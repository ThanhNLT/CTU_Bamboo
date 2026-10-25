# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Bộ quét tệp nội bộ: luôn chạy trước khi một tệp được coi là sạch.

Bộ quét không thay ClamAV (không có cơ sở dữ liệu mẫu virus); nó kiểm tra những gì kiểm tra được ngay trong tiến trình:
chữ ký thử nghiệm (EICAR), tệp thực thi nhúng, cấu trúc đúng chuẩn của từng định dạng, dữ liệu thừa sau ảnh, mã chủ động
trong PDF, macro / đối tượng nhúng / liên kết ngoài trong DOCX và XLSX, bom nén, đường dẫn nguy hiểm, DTD (XXE).
Nguyên tắc: không quét hết được (hết thời gian, bị mã hóa, nén quá mức) thì không phải là sạch.
"""

import io
import re
import struct
import time
import zipfile
import zlib
from dataclasses import dataclass, field

VERSION = "1.0"
ENGINE = f"Bamboo Scan {VERSION} (chữ ký, cấu trúc, mã chủ động)"

TIME_BUDGET = 15.0
MAX_ENTRIES = 3000
MAX_ENTRY_BYTES = 40 * 1024 * 1024
MAX_TOTAL_BYTES = 200 * 1024 * 1024
MAX_RATIO = 200
MAX_STREAMS = 4000

EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
DOS_STUB = b"This program cannot be run in DOS mode"
SCRIPT_MARKERS = (b"<?php", b"<script", b"powershell -", b"cmd.exe /c")
DANGEROUS_EXTENSIONS = {
    "exe", "dll", "scr", "bat", "cmd", "com", "ps1", "vbs", "vbe", "js", "jse", "wsf", "hta", "jar", "msi", "lnk",
    "pif", "sh", "reg", "cpl", "msc", "gadget",
}  # fmt: skip
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_CHUNKS = {
    b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"cHRM", b"gAMA", b"iCCP", b"sBIT", b"sRGB", b"cICP", b"mDCV",
    b"cLLI", b"tEXt", b"zTXt", b"iTXt", b"bKGD", b"hIST", b"pHYs", b"sPLT", b"eXIf", b"tIME", b"acTL", b"fcTL",
    b"fdAT", b"oFFs", b"pCAL", b"sCAL", b"gIFg", b"gIFx", b"sTER",
}  # fmt: skip
PDF_REJECT = {
    b"JavaScript": "mã JavaScript",
    b"JS": "mã JavaScript",
    b"Launch": "lệnh chạy chương trình (Launch)",
    b"EmbeddedFile": "tệp nhúng",
    b"RichMedia": "đa phương tiện chủ động (RichMedia)",
    b"XFA": "biểu mẫu XFA",
    b"ImportData": "nhập dữ liệu (ImportData)",
    b"SubmitForm": "gửi biểu mẫu ra ngoài (SubmitForm)",
    b"GoToE": "mở tệp nhúng (GoToE)",
    b"GoToR": "mở tệp ngoài (GoToR)",
    b"Encrypt": "mã hóa nên không quét được",
}
DANGEROUS_RELS = ("attachedtemplate", "oleobject", "frame", "subdocument", "package", "externallinkpath", "afchunk")
# DDE chỉ nguy hiểm khi nằm trong trường lệnh của Word hoặc công thức của Excel, không phải chữ trong nội dung văn bản
_WORD_FIELD = re.compile(rb"<w:instrText[^>]*>(.*?)</w:instrText>|\bw:instr=\"([^\"]*)\"", re.S)
_WORD_DDE = re.compile(rb"^\s*(?:DDE|DDEAUTO)\b", re.I)
_XL_FORMULA = re.compile(rb"<f\b[^>]*>(.*?)</f>", re.S)
_XL_DDE = re.compile(rb"(?i)\b(?:cmd|msexcel|powershell|mshta|regsvr32|rundll32)\s*\||\bDDE\s*\(")


class ScanIncomplete(Exception):
    pass


@dataclass
class Finding:
    severity: str  # infected | reject | warn
    code: str
    detail: str

    def as_dict(self) -> dict:
        return {"severity": self.severity, "code": self.code, "detail": self.detail}


@dataclass
class Report:
    engines: list[str] = field(default_factory=lambda: [ENGINE])
    findings: list[Finding] = field(default_factory=list)
    checked: list[str] = field(default_factory=list)

    @property
    def verdict(self) -> str:
        if any(f.severity == "infected" for f in self.findings):
            return "INFECTED"
        if any(f.severity == "reject" for f in self.findings):
            return "REJECTED"
        return "CLEAN"

    def add(self, severity: str, code: str, detail: str) -> None:
        if len(self.findings) < 40:
            self.findings.append(Finding(severity, code, detail))

    def summary(self) -> str:
        blocking = [f for f in self.findings if f.severity != "warn"]
        if blocking:
            return "; ".join(f.detail for f in blocking[:3])[:500]
        return f"Đã quét xong, không phát hiện vấn đề ({'; '.join(self.engines)})"[:500]

    def as_dict(self) -> dict:
        return {
            "verdict": self.verdict,
            "engines": self.engines,
            "checked": self.checked,
            "findings": [f.as_dict() for f in self.findings],
        }


class _Clock:
    def __init__(self, budget: float):
        self.deadline = time.monotonic() + budget

    def tick(self) -> None:
        if time.monotonic() > self.deadline:
            raise ScanIncomplete("Quá thời gian quét")


def _payload(report: Report, data: bytes, where: str) -> None:
    """Kiểm tra nội dung thô: chữ ký thử nghiệm và tệp thực thi."""
    if EICAR in data:
        report.add("infected", "eicar", f"Eicar-Test-Signature trong {where}")
    if DOS_STUB in data or (data[:2] == b"MZ" and b"PE\x00\x00" in data[:4096]):
        report.add("infected", "embedded-pe", f"Heuristic.EmbeddedExecutable: tệp thực thi Windows trong {where}")
    if data[:4] == b"\x7fELF" or data[:4] in (b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe"):
        report.add("infected", "embedded-elf", f"Heuristic.EmbeddedExecutable: tệp thực thi trong {where}")


def _scripts(report: Report, data: bytes, where: str) -> None:
    low = data.lower()
    for marker in SCRIPT_MARKERS:
        if marker in low:
            report.add("reject", "embedded-script", f"Có mã script ({marker.decode()}) trong {where}")
            return


def _text(report: Report, data: bytes) -> None:
    report.checked.append("văn bản")
    if b"\x00" in data:
        report.add("reject", "binary-text", "Không phải văn bản thuần (có byte NUL)")
        return
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = data.decode("utf-16") if data[:2] in (b"\xff\xfe", b"\xfe\xff") else data.decode("cp1258")
        except (UnicodeDecodeError, LookupError):
            report.add("reject", "text-encoding", "Văn bản không đọc được bằng UTF-8, UTF-16 hay Windows-1258")
            return
    control = sum(1 for ch in text if ord(ch) < 32 and ch not in "\t\r\n\f")
    if text and control / len(text) > 0.02:
        report.add("reject", "control-chars", "Quá nhiều ký tự điều khiển, không phải văn bản")


# --- PDF ---------------------------------------------------------------------------------------------------------

_NAME = re.compile(rb"/([A-Za-z0-9#]{1,40})")
_STREAM = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.S)


def _pdf_names(chunk: bytes) -> set[bytes]:
    names = set()
    for raw in _NAME.findall(chunk):
        # Tên có thể viết che bằng #xx (ví dụ /Java#53cript)
        names.add(re.sub(rb"#([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]), raw))
    return names


def _inflate(blob: bytes, clock: _Clock, budget: list[int]) -> bytes | None:
    try:
        d = zlib.decompressobj()
        out = d.decompress(blob, 8 * 1024 * 1024)
    except zlib.error:
        return None
    clock.tick()
    budget[0] -= len(out)
    if budget[0] < 0:
        raise ScanIncomplete("PDF giải nén quá lớn")
    return out


def _pdf(report: Report, data: bytes, clock: _Clock) -> None:
    report.checked.append("PDF: cấu trúc, mã chủ động, luồng nén")
    if not data.startswith(b"%PDF-"):
        report.add("reject", "pdf-header", "Không phải PDF (thiếu %PDF- ở đầu tệp)")
        return
    if b"%%EOF" not in data[-2048:]:
        report.add("reject", "pdf-eof", "PDF bị cắt cụt hoặc có dữ liệu thừa sau %%EOF")
    # Tên khóa chỉ tìm ở phần cấu trúc và trong luồng đối tượng (ObjStm): tìm trong dữ liệu nén/ảnh nhị phân sẽ trùng
    # ngẫu nhiên. Mọi luồng giải nén được vẫn quét chữ ký, tệp thực thi và script.
    skeleton, last = [], 0
    structure_streams: list[bytes] = []
    budget = [64 * 1024 * 1024]
    for count, match in enumerate(_STREAM.finditer(data)):
        if count >= MAX_STREAMS:
            raise ScanIncomplete("PDF có quá nhiều luồng dữ liệu")
        skeleton.append(data[last : match.start()])
        last = match.end()
        out = _inflate(match.group(1), clock, budget)
        if out:
            _payload(report, out, "luồng nén của PDF")
            _scripts(report, out, "luồng nén của PDF")
            if b"ObjStm" in data[max(0, match.start() - 400) : match.start()]:
                structure_streams.append(out)
    skeleton.append(data[last:])
    found: set[bytes] = set()
    for chunk in [b"".join(skeleton), *structure_streams]:
        found |= _pdf_names(chunk) & set(PDF_REJECT)
    for name in sorted(found):
        report.add("reject", f"pdf-{name.decode().lower()}", f"PDF có {PDF_REJECT[name]}")
    names = _pdf_names(b"".join(skeleton))
    if b"OpenAction" in names or b"AA" in names:
        report.add("warn", "pdf-open-action", "PDF có hành động tự chạy khi mở (OpenAction/AA), không có mã chủ động")


# --- Ảnh ---------------------------------------------------------------------------------------------------------


def _png(report: Report, data: bytes) -> None:
    report.checked.append("PNG: chunk, CRC, dữ liệu sau IEND")
    pos, first, ended = len(PNG_SIGNATURE), True, False
    while pos < len(data):
        if pos + 12 > len(data):
            report.add("reject", "png-truncated", "PNG bị cắt cụt")
            return
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        end = pos + 8 + length + 4
        if end > len(data):
            report.add("reject", "png-truncated", "PNG bị cắt cụt")
            return
        if first and kind != b"IHDR":
            report.add("reject", "png-header", "PNG không bắt đầu bằng IHDR")
            return
        first = False
        crc = struct.unpack(">I", data[end - 4 : end])[0]
        if zlib.crc32(data[pos + 4 : end - 4]) & 0xFFFFFFFF != crc:
            report.add("reject", "png-crc", f"Chunk {kind.decode('latin-1')} sai CRC")
            return
        if kind not in PNG_CHUNKS and kind[0:1].isupper():
            report.add("reject", "png-chunk", f"Chunk bắt buộc lạ {kind.decode('latin-1')}")
            return
        pos = end
        if kind == b"IEND":
            ended = True
            break
    if not ended:
        report.add("reject", "png-no-iend", "PNG thiếu chunk IEND")
    elif pos < len(data):
        extra = data[pos:]
        _payload(report, extra, "dữ liệu thừa sau ảnh PNG")
        report.add("reject", "png-trailing", f"Có {len(extra)} byte dữ liệu thừa sau ảnh PNG")


def _jpeg(report: Report, data: bytes) -> None:
    report.checked.append("JPEG: cấu trúc, dữ liệu sau EOI")
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        report.add("reject", "jpeg-soi", "JPEG thiếu dấu bắt đầu")
        return
    eoi = data.rfind(b"\xff\xd9")
    if eoi < 0:
        report.add("reject", "jpeg-eoi", "JPEG thiếu dấu kết thúc")
        return
    tail = data[eoi + 2 :]
    if tail.strip(b"\x00\r\n ") != b"":
        _payload(report, tail, "dữ liệu thừa sau ảnh JPEG")
        _scripts(report, tail, "dữ liệu thừa sau ảnh JPEG")
        if len(tail) > 64:
            report.add("reject", "jpeg-trailing", f"Có {len(tail)} byte dữ liệu thừa sau ảnh JPEG")
    _scripts(report, data[: min(len(data), 262144)], "siêu dữ liệu ảnh")


# --- OOXML -------------------------------------------------------------------------------------------------------

_REL = re.compile(rb"<Relationship\b[^>]*>", re.I)


def _attr(tag: bytes, name: bytes) -> bytes:
    m = re.search(rb'\b' + name + rb'\s*=\s*"([^"]*)"', tag, re.I)
    return m.group(1) if m else b""


def _ooxml(report: Report, data: bytes, content_type: str, clock: _Clock) -> None:
    kind = "docx" if "wordprocessingml" in content_type else "xlsx"
    report.checked.append(f"{kind.upper()}: cấu trúc zip, macro, đối tượng nhúng, liên kết ngoài, bom nén")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        report.add("reject", "zip-bad", "Tệp Office không phải zip hợp lệ")
        return
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        report.add("reject", "zip-entries", f"Quá nhiều mục trong tệp ({len(infos)})")
        return
    names = {i.filename for i in infos}
    required = "word/document.xml" if kind == "docx" else "xl/workbook.xml"
    if "[Content_Types].xml" not in names or required not in names:
        report.add("reject", "ooxml-structure", f"Không đúng cấu trúc {kind.upper()} (thiếu {required})")
        return
    total = 0
    for info in infos:
        clock.tick()
        name = info.filename
        parts = name.replace("\\", "/").split("/")
        if name.startswith("/") or ".." in parts or "\\" in name or any(ord(c) < 32 for c in name):
            report.add("reject", "zip-path", f"Đường dẫn nguy hiểm trong tệp: {name[:80]!r}")
            continue
        if info.flag_bits & 0x1:
            report.add("reject", "zip-encrypted", f"Mục {name[:60]} bị mã hóa nên không quét được")
            continue
        total += info.file_size
        if info.file_size > MAX_ENTRY_BYTES or total > MAX_TOTAL_BYTES:
            report.add("reject", "zip-bomb", "Dung lượng giải nén quá lớn (nghi bom nén)")
            return
        if info.file_size > 1024 * 1024 and info.file_size / max(info.compress_size, 1) > MAX_RATIO:
            report.add("reject", "zip-bomb", f"Tỷ lệ nén bất thường ở {name[:60]} (nghi bom nén)")
            return
        low = name.lower()
        ext = low.rsplit(".", 1)[-1] if "." in low.rsplit("/", 1)[-1] else ""
        if "vbaproject" in low or "vbadata" in low:
            report.add("reject", "macro", "Tệp có macro VBA")
        if "/activex/" in low or low.startswith("activex/") or "/embeddings/" in low:
            report.add("reject", "embedded-object", f"Có đối tượng nhúng (ActiveX/OLE): {name[:60]}")
        if ext in DANGEROUS_EXTENSIONS:
            report.add("reject", "dangerous-file", f"Có tệp thực thi hoặc script nhúng: {name[:60]}")
        try:
            body = archive.read(info)
        except (zipfile.BadZipFile, zlib.error, RuntimeError, NotImplementedError) as exc:
            report.add("reject", "zip-corrupt", f"Mục {name[:60]} hỏng hoặc không đọc được: {exc}"[:200])
            continue
        _payload(report, body, f"mục {name[:60]}")
        if body[:4] == b"PK\x03\x04" and ext not in ("docx", "xlsx"):
            report.add("reject", "nested-zip", f"Có tệp nén lồng bên trong: {name[:60]}")
        if ext in ("xml", "rels"):
            if b"<!DOCTYPE" in body or b"<!ENTITY" in body:
                report.add("reject", "xxe", f"{name[:60]} có khai báo DTD/Entity (nguy cơ XXE)")
            if ext == "rels":
                for rel in _REL.findall(body):
                    target = _attr(rel, b"Target").lower()
                    rel_type = _attr(rel, b"Type").lower().rsplit(b"/", 1)[-1].decode("latin-1")
                    external = _attr(rel, b"TargetMode").lower() == b"external"
                    if target.startswith((b"file:", b"\\\\", b"//")):
                        report.add("reject", "rel-local", f"Liên kết tới tệp cục bộ hoặc mạng nội bộ trong {name[:60]}")
                    elif external and rel_type in DANGEROUS_RELS:
                        report.add("reject", "rel-external", f"Liên kết ngoài nguy hiểm ({rel_type}) trong {name[:60]}")
            if kind == "docx" and name.startswith("word/") and name.endswith(".xml"):
                for match in _WORD_FIELD.finditer(body):
                    if _WORD_DDE.match(match.group(1) or match.group(2) or b""):
                        report.add("infected", "dde", f"Heuristic.DDE: trường lệnh chạy chương trình trong {name[:60]}")
                        break
            if name.startswith("xl/worksheets/") or name == "xl/workbook.xml":
                if any(_XL_DDE.search(f) for f in _XL_FORMULA.findall(body)):
                    report.add("infected", "dde", f"Heuristic.DDE: công thức chạy chương trình trong {name[:60]}")
            if name.startswith("xl/externalLinks/"):
                report.add("warn", "external-link", "Bảng tính có liên kết tới sổ tính ngoài")


def scan_file(content_type: str, data: bytes, budget: float = TIME_BUDGET) -> Report:
    """Quét một tệp; chỉ trả CLEAN khi mọi kiểm tra đã chạy xong."""
    report = Report()
    clock = _Clock(budget)
    try:
        report.checked.append("chữ ký thử nghiệm và tệp thực thi nhúng")
        _payload(report, data, "tệp")
        if content_type == "application/pdf":
            _pdf(report, data, clock)
        elif content_type == "image/png":
            _png(report, data)
        elif content_type == "image/jpeg":
            _jpeg(report, data)
        elif content_type.startswith("application/vnd.openxmlformats-officedocument."):
            _ooxml(report, data, content_type, clock)
        elif content_type == "text/plain":
            _text(report, data)
        else:
            report.add("reject", "unsupported", f"Chưa có bộ kiểm tra cho loại tệp {content_type}")
        clock.tick()
    except ScanIncomplete as exc:
        report.add("reject", "scan-incomplete", f"{exc}: không quét hết nên không xác nhận là sạch")
    except Exception as exc:  # noqa: BLE001
        report.add("reject", "scan-error", f"Lỗi khi quét ({type(exc).__name__}): không xác nhận là sạch")
    return report
