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

"""Gỡ nội dung chủ động và dựng lại tệp (CDR, Content Disarm and Reconstruction).

Chạy sau khi bộ quét kết luận tệp sạch (ADR #70): bộ quét chặn thứ chắc chắn nguy hiểm, CDR bỏ những thứ bộ quét chỉ cảnh
báo hoặc không thấy được (siêu dữ liệu, dữ liệu thừa, đối tượng mồ côi, liên kết ngoài, hành động tự chạy) bằng cách dựng
tệp mới chỉ từ phần nội dung hiểu được. Người dùng tải về bản đã dựng lại; mã băm bản gốc giữ trong báo cáo quét.

- Ảnh PNG/JPEG: giải mã rồi mã hóa lại (bỏ EXIF, chunk văn bản, dữ liệu sau ảnh, tệp đa định dạng), xoay theo EXIF trước.
- DOCX/XLSX/PPTX: dựng lại gói zip, bỏ macro, ActiveX, OLE, sổ tính liên kết ngoài, quan hệ trỏ ra ngoài (trừ siêu liên
  kết), khai báo DTD; ghi lại [Content_Types].xml khớp phần còn lại.
- PDF: ghi lại chỉ các đối tượng còn được tham chiếu (bỏ bản cập nhật ẩn, dữ liệu sau %%EOF), bỏ OpenAction, AA, JavaScript,
  tệp nhúng, XFA và chú thích có hành động nguy hiểm. PDF đã ký số giữ nguyên: dựng lại làm mất hiệu lực chữ ký.
- Văn bản: bỏ ký tự điều khiển hướng chữ (Trojan Source) khi tệp là UTF-8.
"""

import io
import re
import zipfile
from dataclasses import dataclass, field

VERSION = "1.0"
ENGINE = f"Bamboo CDR {VERSION}"
MAX_PIXELS = 60_000_000
ZIP_DATE = (2026, 1, 1, 0, 0, 0)

_OOXML_DROP = re.compile(r"(?i)(vbaproject|vbadata|(^|/)activex/|(^|/)embeddings/|^xl/externallinks/|\.(bin|exe|dll)$)")
_REL = re.compile(rb"<Relationship\b[^>]*?/>|<Relationship\b[^>]*?>.*?</Relationship>", re.S | re.I)
_OVERRIDE = re.compile(rb"<Override\b[^>]*?/>", re.I)
_DOCTYPE = re.compile(rb"<!DOCTYPE[^>\[]*(\[[^\]]*\])?\s*>", re.S)
_EXT_REFS = re.compile(rb"<externalReferences\b.*?</externalReferences>|<externalReferences\b[^>]*/>", re.S)
_BIDI = re.compile("[‪-‮⁦-⁩]")
PDF_BAD_ACTIONS = {"/JavaScript", "/Launch", "/SubmitForm", "/ImportData", "/GoToR", "/GoToE", "/RichMediaExecute"}


class CdrError(Exception):
    """Không dựng lại được tệp: không nhận tệp (không giao bản gốc khi chưa gỡ được nội dung chủ động)."""


@dataclass
class Result:
    data: bytes
    actions: list[str] = field(default_factory=list)
    skipped: str | None = None

    @property
    def changed(self) -> bool:
        return bool(self.actions)

    def as_dict(self) -> dict:
        return {"engine": ENGINE, "actions": self.actions, "skipped": self.skipped}


def _attr(tag: bytes, name: bytes) -> bytes:
    m = re.search(rb"\b" + name + rb'\s*=\s*"([^"]*)"', tag, re.I)
    return m.group(1) if m else b""


def _image(content_type: str, data: bytes) -> Result:
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            frames = getattr(img, "n_frames", 1)
            img.load()
            out_img = ImageOps.exif_transpose(img) or img
            icc = img.info.get("icc_profile")
            buf = io.BytesIO()
            if content_type == "image/jpeg":
                if out_img.mode not in ("RGB", "L", "CMYK"):
                    out_img = out_img.convert("RGB")
                out_img.save(buf, "JPEG", quality=92, optimize=True, icc_profile=icc)
            else:
                if out_img.mode not in ("1", "L", "LA", "P", "RGB", "RGBA", "I", "I;16"):
                    out_img = out_img.convert("RGBA")
                params = {"icc_profile": icc} if icc else {}
                if "transparency" in out_img.info:
                    params["transparency"] = out_img.info["transparency"]
                out_img.save(buf, "PNG", optimize=False, **params)
    except (Image.DecompressionBombError, Image.UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise CdrError(f"Không giải mã được ảnh để dựng lại ({type(exc).__name__})") from exc
    actions = ["mã hóa lại ảnh, bỏ siêu dữ liệu và dữ liệu thừa"]
    if frames > 1:
        actions.append(f"chỉ giữ khung hình đầu (ảnh có {frames} khung)")
    return Result(buf.getvalue(), actions)


def _clean_rels(body: bytes, dropped: set[str], base: str) -> tuple[bytes, int]:
    removed = 0

    def keep(match: re.Match) -> bytes:
        nonlocal removed
        rel = match.group(0)
        external = _attr(rel, b"TargetMode").lower() == b"external"
        rel_type = _attr(rel, b"Type").lower().rsplit(b"/", 1)[-1]
        target = _attr(rel, b"Target").decode("utf-8", "replace")
        if external:
            if rel_type == b"hyperlink" and not target.lower().startswith(("file:", "\\\\", "//")):
                return rel
            removed += 1
            return b""
        path = target.lstrip("/") if target.startswith("/") else _join(base, target)
        if path.lower() in dropped:
            removed += 1
            return b""
        return rel

    return _REL.sub(keep, body), removed


def _join(base: str, target: str) -> str:
    parts = [p for p in base.split("/") if p]
    for piece in target.replace("\\", "/").split("/"):
        if piece == "..":
            if parts:
                parts.pop()
        elif piece not in ("", "."):
            parts.append(piece)
    return "/".join(parts)


def _ooxml(data: bytes) -> Result:
    try:
        src = zipfile.ZipFile(io.BytesIO(data))
        infos = [i for i in src.infolist() if not i.is_dir()]
    except zipfile.BadZipFile as exc:
        raise CdrError("Tệp Office không phải zip hợp lệ") from exc
    dropped = {i.filename.lower() for i in infos if _OOXML_DROP.search(i.filename)}
    actions: list[str] = []
    if dropped:
        actions.append(f"bỏ {len(dropped)} phần có macro, đối tượng nhúng hoặc liên kết sổ tính ngoài")
    out = io.BytesIO()
    rel_removed = doctype = 0
    try:
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in infos:
                name = info.filename
                if name.lower() in dropped:
                    continue
                body = src.read(info)
                if name.endswith((".xml", ".rels")):
                    body, n = _DOCTYPE.subn(b"", body)
                    doctype += n
                if name.endswith(".rels"):
                    folder = name.rsplit("_rels/", 1)[0]
                    body, n = _clean_rels(body, dropped, folder)
                    rel_removed += n
                elif name == "[Content_Types].xml":
                    body = _OVERRIDE.sub(
                        lambda m: b"" if _attr(m.group(0), b"PartName").decode().lstrip("/").lower() in dropped
                        else m.group(0),
                        body,
                    )  # fmt: skip
                elif name == "xl/workbook.xml" and any(d.startswith("xl/externallinks/") for d in dropped):
                    body = _EXT_REFS.sub(b"", body)
                entry = zipfile.ZipInfo(name, ZIP_DATE)
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o644 << 16
                dst.writestr(entry, body)
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError) as exc:
        raise CdrError(f"Không dựng lại được tệp Office ({type(exc).__name__})") from exc
    if rel_removed:
        actions.append(f"bỏ {rel_removed} liên kết trỏ ra ngoài hoặc tới phần đã gỡ")
    if doctype:
        actions.append("bỏ khai báo DTD")
    actions.append("dựng lại gói zip (bỏ chú thích zip, dữ liệu thừa, mục ẩn)")
    return Result(out.getvalue(), actions)


def _bad_action(action) -> bool:
    try:
        action = action.get_object()
        return action.get("/S") in PDF_BAD_ACTIONS
    except Exception:  # noqa: BLE001
        return True


def _pdf(data: bytes) -> Result:
    if b"/ByteRange" in data:
        return Result(data, [], "PDF đã ký số: giữ nguyên để chữ ký còn hiệu lực")
    from pypdf import PdfReader, PdfWriter
    from pypdf.errors import PyPdfError
    from pypdf.generic import ArrayObject, NameObject

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise CdrError("PDF bị mã hóa nên không dựng lại được")
        writer = PdfWriter(clone_from=reader)
        actions: list[str] = []
        root = writer.root_object
        for key, label in (("/OpenAction", "hành động khi mở"), ("/AA", "hành động tự chạy")):
            if key in root:
                del root[key]
                actions.append(f"bỏ {label} của tài liệu")
        names = root.get("/Names")
        if names is not None:
            names = names.get_object()
            for key in ("/JavaScript", "/EmbeddedFiles"):
                if key in names:
                    del names[key]
                    actions.append(f"bỏ danh mục {key[1:]}")
        form = root.get("/AcroForm")
        if form is not None and "/XFA" in form.get_object():
            del form.get_object()["/XFA"]
            actions.append("bỏ biểu mẫu XFA")
        page_aa = annots_removed = 0
        for page in writer.pages:
            if "/AA" in page:
                del page["/AA"]
                page_aa += 1
            annots = page.get("/Annots")
            if annots is None:
                continue
            kept = ArrayObject()
            for ref in annots.get_object():
                annot = ref.get_object()
                if annot.get("/Subtype") in ("/FileAttachment", "/RichMedia", "/Movie", "/Sound", "/Screen") or (
                    "/A" in annot and _bad_action(annot["/A"])
                ):
                    annots_removed += 1
                    continue
                if "/AA" in annot:
                    del annot["/AA"]
                kept.append(ref)
            page[NameObject("/Annots")] = kept
        if page_aa:
            actions.append(f"bỏ hành động tự chạy ở {page_aa} trang")
        if annots_removed:
            actions.append(f"bỏ {annots_removed} chú thích có hành động hoặc nội dung nhúng")
        writer.compress_identical_objects(remove_duplicates=False, remove_unreferenced=True)
        buf = io.BytesIO()
        writer.write(buf)
    except CdrError:
        raise
    except (PyPdfError, Exception) as exc:  # noqa: BLE001
        raise CdrError(f"Không dựng lại được PDF ({type(exc).__name__})") from exc
    actions.append("ghi lại PDF chỉ với đối tượng còn dùng (bỏ bản cập nhật ẩn, dữ liệu sau %%EOF)")
    return Result(buf.getvalue(), actions)


def _text(data: bytes) -> Result:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return Result(data, [], "văn bản không phải UTF-8: giữ nguyên")
    cleaned, n = _BIDI.subn("", text)
    if not n:
        return Result(data)
    return Result(cleaned.encode("utf-8"), [f"bỏ {n} ký tự điều khiển hướng chữ"])


def sanitize(content_type: str, data: bytes) -> Result:
    """Dựng lại tệp đã qua quét. Lỗi dựng lại thì ném CdrError (không giao bản gốc thay thế)."""
    if content_type in ("image/png", "image/jpeg"):
        return _image(content_type, data)
    if content_type.startswith("application/vnd.openxmlformats-officedocument."):
        return _ooxml(data)
    if content_type == "application/pdf":
        return _pdf(data)
    if content_type in ("text/plain", "text/csv", "text/markdown"):
        return _text(data)
    return Result(data, [], f"chưa có bộ dựng lại cho {content_type}")
