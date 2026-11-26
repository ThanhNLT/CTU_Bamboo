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

"""Ký số văn bản hệ thống phát hành bằng chứng thư số của tổ chức (PAdES), khóa nằm trong HSM hoặc ở dịch vụ ký số từ xa.

Văn bản PDF (quyết định nhân sự, báo cáo KPI, phiếu đề nghị mua sắm) được ký ngay khi dựng nếu đã cấu hình bộ ký và
chứng thư của bộ ký mang mã số thuế của công ty phát hành (lấy từ chứng thư như khi kiểm đơn đăng ký, ADR #57). Khóa
riêng không bao giờ nằm trong Bamboo:

- `ORG_SIGN_PROVIDER=pkcs11`: HSM (hoặc token USB) qua thư viện PKCS#11 của hãng (`ORG_SIGN_PKCS11_LIB`), chọn token
  theo nhãn (`ORG_SIGN_PKCS11_TOKEN`), khóa và chứng thư theo nhãn; PIN đọc từ OpenBao `bms/org-sign` (khóa `pin`).
  SoftHSM2 dùng được để chạy thử.
- `ORG_SIGN_PROVIDER=csc`: dịch vụ ký số từ xa của CA theo chuẩn Cloud Signature Consortium API v1 (`ORG_SIGN_CSC_URL`,
  `ORG_SIGN_CSC_CREDENTIAL`), token OAuth2 lấy bằng client credentials (`ORG_SIGN_CSC_TOKEN_URL`,
  `ORG_SIGN_CSC_CLIENT_ID`, bí mật `csc_client_secret` trong OpenBao) hoặc token cố định; PIN gửi kèm lệnh
  credentials/authorize. Dịch vụ đòi người dùng xác nhận trên điện thoại cho từng lần ký thì không ký tự động được.

`ORG_SIGN_TSA_URL` thêm dấu thời gian RFC 3161 (PAdES B-T). Không cấu hình thì văn bản vẫn in như cũ, không ký.
"""

import asyncio
import base64
import dataclasses
import datetime as dt
import io
import logging
import os
import threading

import aiohttp
from asn1crypto import x509
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import fields, signers, timestamps
from pyhanko.sign.signers import csc_signer as csc

from . import legal_sign

log = logging.getLogger("org_sign")

FIELD_NAME = "BambooSeal"


class OrgSignError(Exception):
    pass


@dataclasses.dataclass(frozen=True)
class Config:
    provider: str
    pin: str = ""
    pkcs11_lib: str = ""
    pkcs11_token: str = ""
    pkcs11_key: str = ""
    pkcs11_cert: str = ""
    csc_url: str = ""
    csc_credential: str = ""
    csc_token: str = ""
    csc_token_url: str = ""
    csc_client_id: str = ""
    csc_client_secret: str = ""
    tsa_url: str = ""
    location: str = ""

    @classmethod
    def from_env(cls, pin: str = "", csc_client_secret: str = "", env=os.environ) -> "Config | None":
        provider = env.get("ORG_SIGN_PROVIDER", "").strip().lower()
        if provider in ("", "none"):
            return None
        if provider not in ("pkcs11", "csc"):
            raise OrgSignError(f"ORG_SIGN_PROVIDER không hợp lệ: {provider} (pkcs11, csc hoặc để trống)")
        cfg = cls(
            provider=provider,
            pin=pin or env.get("ORG_SIGN_PIN", ""),
            pkcs11_lib=env.get("ORG_SIGN_PKCS11_LIB", ""),
            pkcs11_token=env.get("ORG_SIGN_PKCS11_TOKEN", ""),
            pkcs11_key=env.get("ORG_SIGN_PKCS11_KEY", ""),
            pkcs11_cert=env.get("ORG_SIGN_PKCS11_CERT", "") or env.get("ORG_SIGN_PKCS11_KEY", ""),
            csc_url=env.get("ORG_SIGN_CSC_URL", "").rstrip("/"),
            csc_credential=env.get("ORG_SIGN_CSC_CREDENTIAL", ""),
            csc_token=env.get("ORG_SIGN_CSC_TOKEN", ""),
            csc_token_url=env.get("ORG_SIGN_CSC_TOKEN_URL", ""),
            csc_client_id=env.get("ORG_SIGN_CSC_CLIENT_ID", ""),
            csc_client_secret=csc_client_secret or env.get("ORG_SIGN_CSC_CLIENT_SECRET", ""),
            tsa_url=env.get("ORG_SIGN_TSA_URL", ""),
            location=env.get("ORG_SIGN_LOCATION", ""),
        )
        missing = {
            "pkcs11": [("ORG_SIGN_PKCS11_LIB", cfg.pkcs11_lib), ("ORG_SIGN_PKCS11_TOKEN", cfg.pkcs11_token),
                       ("ORG_SIGN_PKCS11_KEY", cfg.pkcs11_key)],
            "csc": [("ORG_SIGN_CSC_URL", cfg.csc_url), ("ORG_SIGN_CSC_CREDENTIAL", cfg.csc_credential)],
        }[provider]  # fmt: skip
        absent = [name for name, value in missing if not value]
        if absent:
            raise OrgSignError(f"Thiếu cấu hình ký số tổ chức: {', '.join(absent)}")
        return cfg


class OrgSigner:
    """Ký PDF bằng chứng thư của tổ chức. An toàn khi gọi từ nhiều luồng (mỗi lần ký mở phiên riêng)."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._lock = threading.Lock()
        self._cert: x509.Certificate | None = None

    def certificate(self) -> x509.Certificate:
        with self._lock:
            if self._cert is None:
                if self.cfg.provider == "pkcs11":
                    with self._pkcs11() as signer:
                        self._cert = signer.signing_cert
                else:

                    async def cert(_signer, cred):
                        return cred.signing_cert

                    self._cert = asyncio.run(self._csc(cert))
            return self._cert

    def tax_codes(self) -> set[str]:
        return legal_sign.cert_tax_codes(self.certificate())

    def status(self) -> dict:
        try:
            cert = self.certificate()
        except Exception as exc:  # noqa: BLE001
            return {"provider": self.cfg.provider, "ready": False, "error": str(exc)[:300]}
        return {
            "provider": self.cfg.provider,
            "ready": True,
            "subject": cert.subject.human_friendly,
            "issuer": cert.issuer.human_friendly,
            "not_after": cert["tbs_certificate"]["validity"]["not_after"].native.isoformat(),
            "tax_codes": sorted(legal_sign.cert_tax_codes(cert)),
            "timestamp": bool(self.cfg.tsa_url),
        }

    def sign(self, pdf: bytes, reason: str) -> bytes:
        meta = signers.PdfSignatureMetadata(
            field_name=FIELD_NAME,
            md_algorithm="sha256",
            reason=reason,
            location=self.cfg.location or None,
            subfilter=fields.SigSeedSubFilter.PADES,
        )
        stamper = timestamps.HTTPTimeStamper(self.cfg.tsa_url) if self.cfg.tsa_url else None
        writer = IncrementalPdfFileWriter(io.BytesIO(pdf), strict=False)
        if self.cfg.provider == "pkcs11":
            with self._pkcs11() as signer:
                return signers.sign_pdf(writer, meta, signer=signer, timestamper=stamper).getvalue()

        async def run(signer, _cred):
            out = await signers.async_sign_pdf(writer, meta, signer=signer, timestamper=stamper)
            return out.getvalue()

        return asyncio.run(self._csc(run))

    # --- PKCS#11 ---------------------------------------------------------------------------------------------------

    def _pkcs11(self):
        from pyhanko.config.pkcs11 import TokenCriteria
        from pyhanko.sign import pkcs11

        cfg = self.cfg

        class _Session:
            def __enter__(self_inner):
                self_inner.session = pkcs11.open_pkcs11_session(
                    cfg.pkcs11_lib, token_criteria=TokenCriteria(label=cfg.pkcs11_token), user_pin=cfg.pin or None
                )
                return pkcs11.PKCS11Signer(self_inner.session, cert_label=cfg.pkcs11_cert, key_label=cfg.pkcs11_key)

            def __exit__(self_inner, *exc):
                self_inner.session.close()

        return _Session()

    # --- CSC (ký số từ xa) -------------------------------------------------------------------------------------------

    async def _csc(self, work):
        cfg = self.cfg
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            token = cfg.csc_token or await self._csc_token(http)
            info = csc.CSCServiceSessionInfo(cfg.csc_url, cfg.csc_credential, oauth_token=token or None)
            cred = await csc.fetch_certs_in_csc_credential(http, info)
            auth = _PinAuthorization(info, cred, http, cfg.pin)
            return await work(csc.CSCSigner(http, auth), cred)

    async def _csc_token(self, http) -> str:
        cfg = self.cfg
        if not cfg.csc_token_url:
            return ""
        headers = {}
        if cfg.csc_client_id:
            pair = f"{cfg.csc_client_id}:{cfg.csc_client_secret}".encode()
            headers["Authorization"] = "Basic " + base64.b64encode(pair).decode()
        async with http.post(
            cfg.csc_token_url,
            data={"grant_type": "client_credentials", "client_id": cfg.csc_client_id, "scope": "service"},
            headers=headers,
        ) as resp:
            if resp.status >= 400:
                raise OrgSignError(f"Dịch vụ ký số từ chối cấp token ({resp.status})")
            return (await resp.json())["access_token"]


class _PinAuthorization(csc.CSCAuthorizationManager):
    """Xin SAD (credentials/authorize) cho mỗi lô chữ ký, gửi kèm PIN; ràng mã băm khi dịch vụ yêu cầu (SCAL2)."""

    def __init__(self, info, cred, http: aiohttp.ClientSession, pin: str):
        super().__init__(info, cred)
        self.http, self.pin = http, pin

    async def authorize_signature(self, hash_b64s: list[str]) -> csc.CSCAuthorizationInfo:
        body = self.format_csc_auth_request(
            pin=self.pin or None,
            hash_b64s=hash_b64s if self.credential_info.hash_pinning_required else None,
            num_signatures=len(hash_b64s),
        )
        url = self.csc_session_info.endpoint_url("credentials/authorize")
        async with self.http.post(url, json=body, headers=self.csc_session_info.auth_headers) as resp:
            if resp.status >= 400:
                raise OrgSignError(f"Dịch vụ ký số từ chối ủy quyền ký ({resp.status}): {(await resp.text())[:200]}")
            data = await resp.json()
        expires = data.get("expiresIn")
        return csc.CSCAuthorizationInfo(
            sad=data["SAD"],
            expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(seconds=int(expires)) if expires else None,
        )


def tenant_tax_code(conn, tenant_id) -> str | None:
    row = conn.execute("SELECT tax_code FROM core.tenant WHERE id = %s", (tenant_id,)).fetchone()
    return row[0] if row else None


def covers(signer: "OrgSigner | None", tax_code: str | None) -> bool:
    """Bộ ký có chứng thư mang mã số thuế của công ty phát hành văn bản (lỗi đọc chứng thư thì coi như không)."""
    if signer is None or not tax_code:
        return False
    try:
        return tax_code in signer.tax_codes()
    except Exception as exc:  # noqa: BLE001
        log.error("không đọc được chứng thư ký số tổ chức: %s", exc)
        return False


def seal(signer: "OrgSigner | None", tax_code: str | None, pdf: bytes, reason: str) -> tuple[bytes, bool]:
    """Ký PDF nếu có bộ ký và chứng thư mang đúng mã số thuế của công ty phát hành; lỗi ký thì trả bản chưa ký."""
    if signer is None or not tax_code:
        return pdf, False
    try:
        if tax_code not in signer.tax_codes():
            return pdf, False
        return signer.sign(pdf, reason), True
    except Exception as exc:  # noqa: BLE001
        log.error("không ký được văn bản bằng chứng thư tổ chức: %s", exc)
        return pdf, False
