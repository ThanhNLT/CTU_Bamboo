"""Client tối thiểu cho OpenBao (ADR #25): KV v2 ở `secret/`, transit ở `transit/`, đăng nhập AppRole.

    bao = Bao.from_approle_file("http://openbao:8200", "/run/bms/approle.json")
    bao.read("bms/flowable")          # {"username": ..., "password": ...}
    bao.encrypt("079123456789")       # "vault:v1:..."
"""

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

    def request(self, method: str, path: str, body: dict | None = None, ok404: bool = False,
                timeout: float | None = None) -> dict | None:
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

    # --- KV v2 ----------------------------------------------------------------

    def read(self, path: str) -> dict | None:
        """Secret mới nhất ở secret/<path>; None nếu chưa có."""
        data = self.request("GET", f"secret/data/{path}", ok404=True)
        return data["data"]["data"] if data else None

    def write(self, path: str, values: dict) -> None:
        self.request("POST", f"secret/data/{path}", {"data": values})

    # --- Transit --------------------------------------------------------------

    def encrypt(self, plaintext: str, key: str = "pii") -> str:
        b64 = base64.b64encode(plaintext.encode("utf-8")).decode()
        return self.request("POST", f"transit/encrypt/{key}", {"plaintext": b64})["data"]["ciphertext"]

    def decrypt(self, ciphertext: str, key: str = "pii") -> str:
        b64 = self.request("POST", f"transit/decrypt/{key}", {"ciphertext": ciphertext})["data"]["plaintext"]
        return base64.b64decode(b64).decode("utf-8")
