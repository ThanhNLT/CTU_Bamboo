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

import datetime as dt
import io

import pytest
from asn1crypto import x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.writer import PageObject, PdfFileWriter
from pyhanko.sign import signers
from pyhanko_certvalidator.registry import SimpleCertificateStore

from app import legal_sign

TAX = "0101234567"


def _name(cn: str, extra=()) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn), *extra])


def make_pki(tax: str = TAX, uid_prefix: str = "MST:"):
    """CA thử và chứng thư doanh nghiệp mang mã số thuế ở UID, giống chứng thư của VNPT-CA, Viettel-CA."""
    now = dt.datetime.now(dt.UTC)
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_name = _name("Root CA thử nghiệm")
    ca = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True)
        .sign(ca_key, hashes.SHA256())
    )
    key = ec.generate_private_key(ec.SECP256R1())
    subject = _name(
        "CÔNG TY CỔ PHẦN ABC",
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "CÔNG TY CỔ PHẦN ABC"),
            x509.NameAttribute(NameOID.USER_ID, f"{uid_prefix}{tax}"),
        ],
    )
    leaf = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=365))
        .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
        .sign(ca_key, hashes.SHA256())
    )

    def asn1(cert):
        return asn1_x509.Certificate.load(cert.public_bytes(serialization.Encoding.DER))

    return asn1(ca), asn1(leaf), key


def original_pdf(text: str = "Đơn đăng ký sử dụng — mã ABCD-1234") -> bytes:
    w = PdfFileWriter()
    stream = generic.StreamObject(stream_data=b"BT /F1 12 Tf 72 720 Td (Don dang ky) Tj ET")
    page = PageObject(
        contents=w.add_object(stream), media_box=generic.ArrayObject(map(generic.NumberObject, (0, 0, 595, 842)))
    )
    w.insert_page(page)
    w.set_info(generic.DictionaryObject({generic.NameObject("/Subject"): generic.TextStringObject(text)}))
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def sign(pdf: bytes, leaf, key) -> bytes:
    from pyhanko.keys import load_private_key_from_pemder_data

    pem_key = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    signer = signers.SimpleSigner(
        signing_cert=leaf,
        signing_key=load_private_key_from_pemder_data(pem_key, passphrase=None),
        cert_registry=SimpleCertificateStore.from_certs([leaf]),
    )
    out = signers.sign_pdf(
        IncrementalPdfFileWriter(io.BytesIO(pdf)),
        signers.PdfSignatureMetadata(field_name="ChuKyDoanhNghiep"),
        signer=signer,
    )
    return out.getvalue()


@pytest.fixture(scope="module")
def pki():
    return make_pki()


def test_don_ky_dung_ma_so_thue_hop_le(pki):
    ca, leaf, key = pki
    pdf = original_pdf()
    signer = legal_sign.verify(sign(pdf, leaf, key), pdf, TAX, [ca], online=False)
    assert signer.tax_code == TAX and signer.name == "CÔNG TY CỔ PHẦN ABC"
    assert "Root CA thử nghiệm" in signer.issuer and len(signer.document_sha256) == 32


def test_sai_ma_so_thue(pki):
    ca, leaf, key = pki
    pdf = original_pdf()
    with pytest.raises(legal_sign.SignatureRejected, match="khác mã 0109999999"):
        legal_sign.verify(sign(pdf, leaf, key), pdf, "0109999999", [ca], online=False)


def test_chung_thu_khong_tin_cay(pki):
    _, leaf, key = pki
    other_ca, _, _ = make_pki()
    pdf = original_pdf()
    with pytest.raises(legal_sign.SignatureRejected, match="không dẫn tới chứng thư gốc|không xác minh"):
        legal_sign.verify(sign(pdf, leaf, key), pdf, TAX, [other_ca], online=False)


def test_ky_tep_khac_hoac_da_sua(pki):
    ca, leaf, key = pki
    pdf = original_pdf()
    other = original_pdf("Đơn khác — mã ZZZZ-9999")
    with pytest.raises(legal_sign.SignatureRejected, match="không phải đơn hệ thống"):
        legal_sign.verify(sign(other, leaf, key), pdf, TAX, [ca], online=False)
    with pytest.raises(legal_sign.SignatureRejected, match="chưa có chữ ký"):
        legal_sign.verify(pdf + b"\n% them\n", pdf, TAX, [ca], online=False)


def test_chua_cai_chung_thu_goc(pki):
    _, leaf, key = pki
    pdf = original_pdf()
    with pytest.raises(legal_sign.SignatureRejected, match="chưa cài chứng thư gốc"):
        legal_sign.verify(sign(pdf, leaf, key), pdf, TAX, [], online=False)


def test_doc_ma_so_thue_trong_chung_thu():
    _, leaf, _ = make_pki("0101234567-001", "MST: ")
    assert legal_sign.cert_tax_codes(leaf) == {"0101234567-001"}


def test_nap_chung_thu_goc_pem_va_der(tmp_path, pki):
    ca, _, _ = pki
    from asn1crypto import pem

    (tmp_path / "root.cer").write_bytes(ca.dump())
    (tmp_path / "root.pem").write_bytes(pem.armor("CERTIFICATE", ca.dump()))
    (tmp_path / "ghi-chu.txt").write_text("bỏ qua")
    assert len(legal_sign.load_trust_roots(str(tmp_path))) == 2
    assert legal_sign.load_trust_roots(str(tmp_path / "khong-co")) == []
