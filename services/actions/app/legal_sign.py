# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Kiểm đơn đăng ký đã ký bằng chữ ký số doanh nghiệp (ADR #57).

Đơn hợp lệ khi: tệp bắt đầu đúng bằng các byte của đơn hệ thống đã sinh (ký kiểu cập nhật nối tiếp, không sửa nội dung),
có chữ ký PDF phủ trọn đơn gốc, chữ ký toàn vẹn, chứng thư người ký dẫn tới một chứng thư gốc tin cậy (Root CA quốc gia
của NEAC, đặt trong SIGNATURE_TRUST_DIR), chưa bị thu hồi (OCSP/CRL khi có Internet) và mang đúng mã số thuế đã khai.
"""

import dataclasses
import datetime as dt
import hashlib
import io
import logging
import pathlib
import re

from asn1crypto import pem, x509
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.settings import KeyUsageConstraints
from pyhanko_certvalidator import ValidationContext

log = logging.getLogger("legal_sign")

TAX_CODE = re.compile(r"^[0-9]{10}(-[0-9]{3})?$")
# Mã số thuế trong chứng thư số của doanh nghiệp: thường ở UID dạng "MST:0101234567", có nơi ghi ở OU, CN, serialNumber
_CERT_TAX = re.compile(r"(?:MST|MSDN|MSNS|TIN)\s*[:\-]?\s*([0-9]{10}(?:-[0-9]{3})?)", re.IGNORECASE)
_CERT_FIELDS = ("user_id", "serial_number", "organizational_unit_name", "common_name", "organization_name")
KEY_USAGE = KeyUsageConstraints(key_usage={"digital_signature", "non_repudiation"}, match_all_key_usages=False)


class SignatureRejected(Exception):
    pass


@dataclasses.dataclass(frozen=True)
class Signer:
    tax_code: str
    name: str | None
    subject: str
    issuer: str
    serial_number: str
    signed_at: dt.datetime | None
    document_sha256: bytes


def load_trust_roots(directory: str) -> list[x509.Certificate]:
    """Chứng thư gốc tin cậy (.crt, .cer, .pem; PEM hoặc DER) trong thư mục; thư mục thiếu thì danh sách rỗng."""
    roots = []
    path = pathlib.Path(directory) if directory else None
    if path is None or not path.is_dir():
        return roots
    for file in sorted(path.iterdir()):
        if file.suffix.lower() not in {".crt", ".cer", ".pem"}:
            continue
        data = file.read_bytes()
        try:
            blobs = [der for _, _, der in pem.unarmor(data, multiple=True)] if pem.detect(data) else [data]
            roots += [x509.Certificate.load(der) for der in blobs]
        except ValueError as exc:
            log.warning("bỏ qua chứng thư gốc %s: %s", file.name, exc)
    return roots


def cert_tax_codes(cert: x509.Certificate) -> set[str]:
    found = set()
    for field in _CERT_FIELDS:
        values = cert.subject.native.get(field)
        for value in values if isinstance(values, list) else [values]:
            if isinstance(value, str):
                found.update(_CERT_TAX.findall(value))
    return found


def verify(
    signed: bytes,
    original: bytes,
    tax_code: str,
    trust_roots: list[x509.Certificate],
    online: bool = True,
) -> Signer:
    if not trust_roots:
        raise SignatureRejected(
            "Máy chủ chưa cài chứng thư gốc để kiểm chữ ký số (SIGNATURE_TRUST_DIR); "
            "quản trị máy chủ cài chứng thư Root CA quốc gia rồi thử lại"
        )
    if not signed.startswith(b"%PDF-"):
        raise SignatureRejected("Tệp tải lên không phải PDF")
    if len(signed) <= len(original) or not signed.startswith(original):
        raise SignatureRejected(
            "Tệp không phải đơn hệ thống vừa sinh, hoặc nội dung đã bị sửa. Ký đúng tệp đã tải về, không chỉnh sửa, "
            "không in rồi quét lại"
        )
    try:
        reader = PdfFileReader(io.BytesIO(signed))
        signatures = reader.embedded_signatures
    except Exception as exc:  # noqa: BLE001 - tệp người dùng tải lên, lỗi đọc PDF có nhiều loại
        raise SignatureRejected(f"Không đọc được tệp PDF: {exc}") from exc
    if not signatures:
        raise SignatureRejected("Tệp chưa có chữ ký số")
    context = ValidationContext(
        trust_roots=trust_roots,
        allow_fetching=online,
        revocation_mode="hard-fail" if online else "soft-fail",
    )
    problems = []
    for sig in signatures:
        start, length, gap_end, tail = sig.sig_object["/ByteRange"]
        if start != 0 or gap_end + tail < len(original):
            problems.append("chữ ký không phủ trọn đơn")
            continue
        try:
            status = validate_pdf_signature(sig, context, key_usage_settings=KEY_USAGE)
        except Exception as exc:  # noqa: BLE001 - lỗi xác minh chuỗi chứng thư, thu hồi, mạng
            problems.append(f"không xác minh được chữ ký ({exc})")
            continue
        if not status.intact or not status.valid:
            problems.append("chữ ký không toàn vẹn")
            continue
        if not status.trusted:
            problems.append("chứng thư người ký không dẫn tới chứng thư gốc tin cậy hoặc đã bị thu hồi")
            continue
        cert = status.signing_cert
        codes = cert_tax_codes(cert)
        if tax_code not in codes:
            shown = ", ".join(sorted(codes)) or "không có"
            problems.append(f"chứng thư mang mã số thuế {shown}, khác mã {tax_code} đã khai")
            continue
        subject = cert.subject.native
        return Signer(
            tax_code=tax_code,
            name=subject.get("organization_name") or subject.get("common_name"),
            subject=cert.subject.human_friendly,
            issuer=cert.issuer.human_friendly,
            serial_number=format(cert.serial_number, "X"),
            signed_at=status.signer_reported_dt,
            document_sha256=hashlib.sha256(signed).digest(),
        )
    raise SignatureRejected("Chữ ký số không hợp lệ: " + "; ".join(problems))
