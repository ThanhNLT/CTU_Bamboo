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

"""mTLS nội bộ (ADR #76, infra/compose/mtls.yml): actions nghe HTTPS bắt buộc chứng chỉ máy khách của CA nội bộ, HTTP
chỉ ở 127.0.0.1; máy khách Python trình chứng chỉ dịch vụ qua bamboo_common.tls."""

import datetime
import os
import signal
import socket
import ssl
import subprocess
import sys
import textwrap
import time

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from bamboo_common import tls


def _cert(name: str, issuer: tuple | None, ca: bool = False):
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    now = datetime.datetime.now(datetime.UTC)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer[0].subject if issuer else subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=1))
        .not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key((issuer[1] if issuer else key).public_key()),
            critical=False,
        )
    )
    if ca:
        builder = builder.add_extension(
            x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True
        )
    if not ca:
        builder = builder.add_extension(
            x509.SubjectAlternativeName([x509.DNSName(name), x509.DNSName("localhost")]), critical=False
        )
    cert = builder.sign(issuer[1] if issuer else key, hashes.SHA256())
    return cert, key


def _write(directory, identity: str, cert, key, ca) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{identity}.crt").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (directory / f"{identity}.key").write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    (directory / "ca.crt").write_bytes(ca.public_bytes(serialization.Encoding.PEM))


def _port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def pki(tmp_path):
    ca = _cert("bamboo-test-ca", None, ca=True)
    rogue = _cert("rogue-ca", None, ca=True)
    _write(tmp_path / "actions", "actions", *_cert("actions", ca), ca[0])
    _write(tmp_path / "gateway", "gateway", *_cert("gateway", ca), ca[0])
    _write(tmp_path / "rogue", "gateway", *_cert("gateway", rogue), ca[0])
    return tmp_path


def _client(directory, identity: str) -> ssl.SSLContext:
    os.environ["INTERNAL_TLS_DIR"], os.environ["INTERNAL_TLS_IDENTITY"] = str(directory), identity
    tls.context.cache_clear()
    try:
        return tls.context()
    finally:
        del os.environ["INTERNAL_TLS_DIR"], os.environ["INTERNAL_TLS_IDENTITY"]
        tls.context.cache_clear()


def test_actions_hai_cong_va_bat_buoc_chung_chi_may_khach(pki):
    http_port, tls_port = _port(), _port()
    script = textwrap.dedent(
        """
        import asyncio
        from app import serve

        async def app(scope, receive, send):
            if scope["type"] != "http":
                return
            await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"text/plain")]})
            await send({"type": "http.response.body", "body": b"ok"})

        asyncio.run(serve.serve([serve._Server(c) for c in serve.configs(app=app)]))
        """
    )
    env = {
        **os.environ,
        "INTERNAL_TLS_DIR": str(pki / "actions"),
        "INTERNAL_TLS_IDENTITY": "actions",
        "ACTIONS_HTTP_PORT": str(http_port),
        "ACTIONS_TLS_PORT": str(tls_port),
    }
    proc = subprocess.Popen([sys.executable, "-c", script], env=env)
    try:
        url = f"https://localhost:{tls_port}/"
        deadline = time.monotonic() + 20
        while True:
            try:
                assert httpx.get(url, verify=_client(pki / "gateway", "gateway")).text == "ok"
                break
            except httpx.ConnectError:
                if time.monotonic() > deadline or proc.poll() is not None:
                    raise
                time.sleep(0.2)
        assert httpx.get(f"http://127.0.0.1:{http_port}/").text == "ok", "HTTP cho healthcheck trong container"
        no_cert = ssl.create_default_context(cafile=str(pki / "actions" / "ca.crt"))
        with pytest.raises((httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError)):
            httpx.get(url, verify=no_cert).raise_for_status()
        with pytest.raises((httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError)):
            httpx.get(url, verify=_client(pki / "rogue", "gateway")).raise_for_status()
    finally:
        proc.send_signal(signal.SIGTERM)
        assert proc.wait(timeout=10) == 0, "SIGTERM dừng cả hai cổng"


def test_may_khach_chi_dung_mtls_voi_https(pki, monkeypatch):
    assert tls.verify("https://keycloak:8443") is True, "chưa bật mTLS: mặc định của httpx"
    monkeypatch.setenv("INTERNAL_TLS_DIR", str(pki / "gateway"))
    monkeypatch.setenv("INTERNAL_TLS_IDENTITY", "gateway")
    tls.context.cache_clear()
    try:
        assert isinstance(tls.verify("https://keycloak:8443"), ssl.SSLContext)
        assert tls.verify("http://keycloak:8080") is True
    finally:
        tls.context.cache_clear()
