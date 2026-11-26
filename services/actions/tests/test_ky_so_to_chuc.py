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

"""Ký số văn bản bằng chứng thư của tổ chức (app.org_sign): dịch vụ ký số từ xa chuẩn CSC (máy chủ giả lập trong kiểm
thử) và HSM qua PKCS#11 (SoftHSM2 khi image có)."""

import base64
import datetime
import io
import os
import pathlib
import shutil
import socket
import subprocess
import threading
import time
import urllib.parse

import pytest
import uvicorn
from asn1crypto import x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.x509.oid import NameOID
from fastapi import FastAPI, HTTPException, Request
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from pypdf import PdfWriter

from app import org_sign

TAX = "0101234567"
PIN = "246810"
SOFTHSM = next(
    (p for p in ("/usr/lib/softhsm/libsofthsm2.so", "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so",
                 "/usr/lib/aarch64-linux-gnu/softhsm/libsofthsm2.so") if os.path.exists(p)),
    None,
)  # fmt: skip


def _cert(subject: x509.Name, key, issuer: tuple | None, ca: bool):
    now = datetime.datetime.now(datetime.UTC)
    signer_key = issuer[1] if issuer else key
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer[0].subject if issuer else subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(signer_key.public_key()), critical=False)
        .add_extension(
            x509.KeyUsage(not ca, not ca, False, False, False, ca, ca, False, False),
            critical=True,
        )
    )
    return builder.sign(signer_key, hashes.SHA256())


@pytest.fixture(scope="module")
def pki():
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca = _cert(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Bamboo Test CA")]), ca_key, None, True)
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, "CÔNG TY THỬ KÝ SỐ"),
            x509.NameAttribute(NameOID.USER_ID, f"MST:{TAX}"),
        ]
    )
    leaf = _cert(subject, key, (ca, ca_key), False)
    return {"ca": ca, "key": key, "leaf": leaf}


def _pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _check_signed(pdf: bytes, ca: x509.Certificate) -> None:
    sig = PdfFileReader(io.BytesIO(pdf)).embedded_signatures[0]
    assert sig.field_name == org_sign.FIELD_NAME
    root = asn1_x509.Certificate.load(ca.public_bytes(serialization.Encoding.DER))
    status = validate_pdf_signature(sig, ValidationContext(trust_roots=[root]))
    assert status.intact and status.valid and status.trusted, status.pretty_print_details()


def _port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _fake_csc(pki, hash_pinning: bool):
    """Dịch vụ ký số từ xa tối thiểu theo CSC API v1: OAuth2 client credentials, credentials/info|authorize,
    signatures/signHash ký bằng khóa EC trong bộ nhớ."""
    app = FastAPI()
    seen = {"authorize": [], "sign": 0}

    def bearer(request: Request) -> None:
        if request.headers.get("authorization") != "Bearer tok-1":
            raise HTTPException(401)

    @app.post("/oauth2/token")
    async def token(request: Request):
        form = {k: v[0] for k, v in urllib.parse.parse_qs((await request.body()).decode()).items()}
        if form.get("grant_type") != "client_credentials" or request.headers.get("authorization") is None:
            raise HTTPException(400)
        return {"access_token": "tok-1", "token_type": "Bearer", "expires_in": 3600}

    @app.post("/csc/v1/credentials/info")
    async def info(request: Request):
        bearer(request)
        body = await request.json()
        assert body["credentialID"] == "cred-1"
        der = [base64.b64encode(c.public_bytes(serialization.Encoding.DER)).decode() for c in (pki["leaf"], pki["ca"])]
        return {
            "key": {"status": "enabled", "algo": ["1.2.840.10045.4.3.2"], "len": 256},
            "cert": {"status": "valid", "certificates": der},
            "authMode": "explicit",
            "SCAL": "2" if hash_pinning else "1",
            "multisign": 1,
        }

    @app.post("/csc/v1/credentials/authorize")
    async def authorize(request: Request):
        bearer(request)
        body = await request.json()
        seen["authorize"].append(body)
        if body.get("PIN") != PIN:
            raise HTTPException(400, "sai PIN")
        if hash_pinning and not body.get("hash"):
            raise HTTPException(400, "thiếu hash")
        return {"SAD": "sad-1", "expiresIn": 300}

    @app.post("/csc/v1/signatures/signHash")
    async def sign_hash(request: Request):
        bearer(request)
        body = await request.json()
        assert body["SAD"] == "sad-1" and body["signAlgo"] == "1.2.840.10045.4.3.2"
        seen["sign"] += 1
        sigs = [
            base64.b64encode(pki["key"].sign(base64.b64decode(h), ec.ECDSA(utils.Prehashed(hashes.SHA256())))).decode()
            for h in body["hash"]
        ]
        return {"signatures": sigs}

    port = _port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    while not server.started:
        time.sleep(0.05)
    return server, f"http://127.0.0.1:{port}", seen


@pytest.mark.parametrize("hash_pinning", [False, True], ids=["scal1", "scal2"])
def test_ky_qua_dich_vu_ky_so_tu_xa_csc(pki, hash_pinning):
    server, url, seen = _fake_csc(pki, hash_pinning)
    try:
        cfg = org_sign.Config.from_env(
            pin=PIN,
            csc_client_secret="client-secret",
            env={
                "ORG_SIGN_PROVIDER": "csc",
                "ORG_SIGN_CSC_URL": url,
                "ORG_SIGN_CSC_CREDENTIAL": "cred-1",
                "ORG_SIGN_CSC_TOKEN_URL": f"{url}/oauth2/token",
                "ORG_SIGN_CSC_CLIENT_ID": "bamboo",
                "ORG_SIGN_LOCATION": "Hà Nội",
            },
        )
        signer = org_sign.OrgSigner(cfg)
        assert signer.tax_codes() == {TAX}
        assert signer.status()["ready"] is True

        signed, ok = org_sign.seal(signer, TAX, _pdf(), "Quyết định nhân sự QD-2026-000001")
        assert ok and seen["sign"] == 1
        _check_signed(signed, pki["ca"])
        assert ("hash" in seen["authorize"][-1]) is hash_pinning, "SCAL2 thì SAD ràng mã băm"

        original = _pdf()
        assert org_sign.seal(signer, "0109999999", original, "x") == (original, False), "công ty khác MST: không ký"
    finally:
        server.should_exit = True


def test_cau_hinh_ky_so_to_chuc():
    assert org_sign.Config.from_env(env={}) is None
    assert org_sign.Config.from_env(env={"ORG_SIGN_PROVIDER": "none"}) is None
    with pytest.raises(org_sign.OrgSignError, match="ORG_SIGN_PKCS11_LIB"):
        org_sign.Config.from_env(env={"ORG_SIGN_PROVIDER": "pkcs11"})
    with pytest.raises(org_sign.OrgSignError, match="không hợp lệ"):
        org_sign.Config.from_env(env={"ORG_SIGN_PROVIDER": "usb"})
    assert org_sign.seal(None, TAX, b"%PDF-", "x") == (b"%PDF-", False)


@pytest.mark.skipif(SOFTHSM is None or shutil.which("softhsm2-util") is None, reason="image không có SoftHSM2")
def test_ky_bang_hsm_pkcs11_softhsm(pki, tmp_path, monkeypatch):
    import pkcs11
    from pkcs11 import Attribute, ObjectClass

    (tmp_path / "tokens").mkdir()
    conf = tmp_path / "softhsm2.conf"
    conf.write_text(f"directories.tokendir = {tmp_path / 'tokens'}\nobjectstore.backend = file\n")
    monkeypatch.setenv("SOFTHSM2_CONF", str(conf))
    subprocess.run(
        ["softhsm2-util", "--init-token", "--free", "--label", "bamboo-seal", "--pin", PIN, "--so-pin", "13579"],
        check=True,
        capture_output=True,
    )
    key_pem = tmp_path / "seal.pem"
    key_pem.write_bytes(
        pki["key"].private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )
    )
    subprocess.run(
        ["softhsm2-util", "--import", str(key_pem), "--token", "bamboo-seal", "--label", "seal", "--id", "01",
         "--pin", PIN],
        check=True,
        capture_output=True,
    )  # fmt: skip
    lib = pkcs11.lib(SOFTHSM)
    with lib.get_token(token_label="bamboo-seal").open(user_pin=PIN, rw=True) as session:
        session.create_object(
            {
                Attribute.CLASS: ObjectClass.CERTIFICATE,
                Attribute.CERTIFICATE_TYPE: pkcs11.CertificateType.X_509,
                Attribute.TOKEN: True,
                Attribute.LABEL: "seal",
                Attribute.ID: b"\x01",
                Attribute.SUBJECT: pki["leaf"].subject.public_bytes(),
                Attribute.VALUE: pki["leaf"].public_bytes(serialization.Encoding.DER),
            }
        )

    cfg = org_sign.Config.from_env(
        pin=PIN,
        env={
            "ORG_SIGN_PROVIDER": "pkcs11",
            "ORG_SIGN_PKCS11_LIB": SOFTHSM,
            "ORG_SIGN_PKCS11_TOKEN": "bamboo-seal",
            "ORG_SIGN_PKCS11_KEY": "seal",
        },
    )
    signer = org_sign.OrgSigner(cfg)
    assert signer.tax_codes() == {TAX}
    signed, ok = org_sign.seal(signer, TAX, _pdf(), "Báo cáo KPI")
    assert ok
    _check_signed(signed, pki["ca"])
    assert pathlib.Path(SOFTHSM).exists()


class _Storage:
    def __init__(self):
        self.files: dict[str, bytes] = {}

    def document_exists(self, key: str) -> bool:
        return key in self.files

    def put_document(self, key: str, data: bytes, _content_type: str) -> None:
        self.files[key] = data


class _Signer:
    def __init__(self, fail: bool = False):
        self.fail, self.calls = fail, 0

    def tax_codes(self) -> set[str]:
        return {TAX}

    def sign(self, pdf: bytes, _reason: str) -> bytes:
        self.calls += 1
        if self.fail:
            raise RuntimeError("HSM không phản hồi")
        return pdf + b"%sealed"


def test_luu_pdf_da_ky_tach_khoi_ban_chua_ky():
    from app import forms
    from app.common import Context

    ctx = Context(storage=_Storage(), org_signer=_Signer())
    assert forms.cached_pdf_key(ctx, "t/doc", "abc", TAX) == ("t/doc/abc.pdf", False)
    assert forms.store_pdf(ctx, "t/doc", "abc", b"%PDF-1", TAX, "x") == "t/doc/abc.sealed.pdf"
    assert forms.cached_pdf_key(ctx, "t/doc", "abc", TAX) == ("t/doc/abc.sealed.pdf", True)
    assert forms.cached_pdf_key(ctx, "t/doc", "abc", "0109999999") == ("t/doc/abc.pdf", False), "công ty khác MST"

    failing = Context(storage=_Storage(), org_signer=_Signer(fail=True))
    assert forms.store_pdf(failing, "t/doc", "abc", b"%PDF-1", TAX, "x") == "t/doc/abc.pdf", "ký lỗi: vẫn in"
    assert forms.cached_pdf_key(failing, "t/doc", "abc", TAX) == ("t/doc/abc.pdf", False), "lần sau thử ký lại"

    plain = Context(storage=_Storage())
    forms.store_pdf(plain, "t/doc", "abc", b"%PDF-1", TAX, "x")
    assert forms.cached_pdf_key(plain, "t/doc", "abc", TAX) == ("t/doc/abc.pdf", True)
