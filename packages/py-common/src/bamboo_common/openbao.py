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

import base64
import json
import pathlib

import httpx


class BaoError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"OpenBao {status}: {message}")
        self.status = status


class Bao:
    def __init__(self, addr: str, token: str | None = None, timeout: float = 10.0):
        self.http = httpx.Client(base_url=addr.rstrip("/") + "/v1/", timeout=timeout)
        self.token = token

    def request(
        self, method: str, path: str, body: dict | None = None, ok404: bool = False, timeout: float | None = None
    ) -> dict | None:
        headers = {"X-Vault-Token": self.token} if self.token else {}
        extra = {"timeout": timeout} if timeout else {}
        resp = self.http.request(method, path, json=body, headers=headers, **extra)
        if resp.status_code == 404 and ok404:
            return None
        if resp.status_code >= 400:
            try:
                message = "; ".join(resp.json().get("errors", [])) or resp.text
            except ValueError:
                message = resp.text
            raise BaoError(resp.status_code, f"{method} {path}: {message[:300]}")
        return resp.json() if resp.content else {}

    @classmethod
    def login_approle(cls, addr: str, role_id: str, secret_id: str) -> "Bao":
        bao = cls(addr)
        auth = bao.request("POST", "auth/approle/login", {"role_id": role_id, "secret_id": secret_id})["auth"]
        bao.token = auth["client_token"]
        return bao

    @classmethod
    def from_approle_file(cls, addr: str, path: str | pathlib.Path) -> "Bao":
        creds = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        return cls.login_approle(addr, creds["role_id"], creds["secret_id"])

    def read(self, path: str) -> dict | None:
        data = self.request("GET", f"secret/data/{path}", ok404=True)
        return data["data"]["data"] if data else None

    def write(self, path: str, values: dict) -> None:
        self.request("POST", f"secret/data/{path}", {"data": values})

    def encrypt(self, plaintext: str, key: str = "pii") -> str:
        b64 = base64.b64encode(plaintext.encode("utf-8")).decode()
        return self.request("POST", f"transit/encrypt/{key}", {"plaintext": b64})["data"]["ciphertext"]

    def sign(self, data: bytes, key: str = "receipt") -> str:
        """Chữ ký Ed25519 của khóa transit; trả về chuỗi `vault:v1:...`."""
        b64 = base64.b64encode(data).decode()
        return self.request("POST", f"transit/sign/{key}", {"input": b64})["data"]["signature"]

    def verify(self, data: bytes, signature: str, key: str = "receipt") -> bool:
        b64 = base64.b64encode(data).decode()
        return bool(
            self.request("POST", f"transit/verify/{key}", {"input": b64, "signature": signature})["data"]["valid"]
        )

    def decrypt(self, ciphertext: str, key: str = "pii") -> str:
        b64 = self.request("POST", f"transit/decrypt/{key}", {"ciphertext": ciphertext})["data"]["plaintext"]
        return base64.b64decode(b64).decode("utf-8")
