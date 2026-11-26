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

import logging
import secrets
import string
import time

import httpx
import psycopg

from bamboo_common import tls
from bamboo_common.pii import PiiCipher

log = logging.getLogger("hr_account")

REALM = "bms"
ATTRIBUTE = "bamboo_onboarding_request"
MAX_ATTEMPTS = 5


class AccountConflict(Exception):
    pass


def temporary_password(length: int = 14) -> str:
    alphabet = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value):
            return value


def split_name(full_name: str) -> tuple[str, str]:
    last, _, first = full_name.strip().rpartition(" ")
    return first, last


class KeycloakUsers:
    def __init__(self, base_url: str, client_id: str, client_secret: str, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.http = httpx.Client(
            base_url=f"{self.base_url}/admin/realms/{REALM}", timeout=timeout, verify=tls.verify(self.base_url)
        )
        self._token: str | None = None
        self._expires = 0.0

    def _headers(self) -> dict:
        if self._token is None or time.monotonic() > self._expires:
            resp = httpx.post(
                f"{self.base_url}/realms/{REALM}/protocol/openid-connect/token",
                verify=tls.verify(self.base_url),
                timeout=15,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            self._token = body["access_token"]
            self._expires = time.monotonic() + max(int(body.get("expires_in", 60)) - 30, 10)
        return {"Authorization": f"Bearer {self._token}"}

    def find(self, username: str) -> dict | None:
        resp = self.http.get("/users", params={"username": username, "exact": "true"}, headers=self._headers())
        resp.raise_for_status()
        return next((u for u in resp.json() if u["username"] == username), None)

    def create(
        self,
        request_id: str,
        username: str,
        full_name: str,
        email: str | None,
        password: str,
        attribute: str = ATTRIBUTE,
        required_actions: tuple[str, ...] = ("UPDATE_PASSWORD",),
    ) -> str:
        first, last = split_name(full_name)
        body = {
            "username": username,
            "enabled": True,
            "firstName": first,
            "lastName": last,
            "attributes": {attribute: [request_id]},
            "credentials": [{"type": "password", "value": password, "temporary": True}],
            "requiredActions": list(required_actions),
        }
        if email:
            body |= {"email": email, "emailVerified": False}
        resp = self.http.post("/users", json=body, headers=self._headers())
        if resp.status_code == 201:
            return resp.headers["Location"].rstrip("/").rsplit("/", 1)[-1]
        if resp.status_code != 409:
            resp.raise_for_status()
        existing = self.find(username)
        if existing is None or existing.get("attributes", {}).get(attribute) != [request_id]:
            raise AccountConflict("Tên đăng nhập hoặc email đã thuộc một tài khoản khác")
        self.http.put(
            f"/users/{existing['id']}/reset-password",
            headers=self._headers(),
            json={"type": "password", "value": password, "temporary": True},
        ).raise_for_status()
        return existing["id"]

    def ensure_otp(self, subject: str) -> bool:
        """Bắt tài khoản cài OTP ở lần đăng nhập tới nếu chưa có; trả True nếu vừa đặt yêu cầu (ADR #57)."""
        creds = self.http.get(f"/users/{subject}/credentials", headers=self._headers())
        if creds.status_code == 404:
            return False
        creds.raise_for_status()
        if any(c.get("type") == "otp" for c in creds.json()):
            return False
        user = self.http.get(f"/users/{subject}", headers=self._headers())
        user.raise_for_status()
        body = user.json()
        if "CONFIGURE_TOTP" in body.get("requiredActions", []):
            return False
        body["requiredActions"] = [*body.get("requiredActions", []), "CONFIGURE_TOTP"]
        self.http.put(f"/users/{subject}", json=body, headers=self._headers()).raise_for_status()
        return True

    def recover(self, subject: str, password: str) -> str:
        """Khôi phục tài khoản chủ sở hữu (ADR #57): mật khẩu tạm mới, gỡ OTP cũ, bắt đổi mật khẩu và cài OTP lại.
        Trả tên đăng nhập."""
        user = self.http.get(f"/users/{subject}", headers=self._headers())
        user.raise_for_status()
        body = user.json()
        creds = self.http.get(f"/users/{subject}/credentials", headers=self._headers())
        creds.raise_for_status()
        for cred in creds.json():
            if cred.get("type") == "otp":
                self.http.delete(
                    f"/users/{subject}/credentials/{cred['id']}", headers=self._headers()
                ).raise_for_status()
        self.http.put(
            f"/users/{subject}/reset-password",
            headers=self._headers(),
            json={"type": "password", "value": password, "temporary": True},
        ).raise_for_status()
        actions = [a for a in body.get("requiredActions", []) if a not in ("UPDATE_PASSWORD", "CONFIGURE_TOTP")]
        body |= {"enabled": True, "requiredActions": [*actions, "UPDATE_PASSWORD", "CONFIGURE_TOTP"]}
        self.http.put(f"/users/{subject}", json=body, headers=self._headers()).raise_for_status()
        return body["username"]

    def disable(self, subject: str) -> bool:
        found = self.http.get(f"/users/{subject}", headers=self._headers())
        if found.status_code == 404:
            return False
        found.raise_for_status()
        self.http.put(
            f"/users/{subject}", json={**found.json(), "enabled": False}, headers=self._headers()
        ).raise_for_status()
        return True

    def delete(self, subject: str) -> bool:
        """Xóa hẳn tài khoản: gỡ tài khoản vừa tạo khi đăng ký lỗi, dọn tài khoản thử E2E (tools/demo_cleanup.sh)."""
        resp = self.http.delete(f"/users/{subject}", headers=self._headers())
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True

    def usernames_like(self, prefix: str) -> list[dict]:
        """Tài khoản có tên đăng nhập bắt đầu bằng `prefix` (tối đa 500)."""
        resp = self.http.get("/users", params={"search": prefix, "max": 500}, headers=self._headers())
        resp.raise_for_status()
        return [u for u in resp.json() if u["username"].startswith(prefix)]


def provision(conn: psycopg.Connection, users: KeycloakUsers, cipher: PiiCipher, request_id) -> str:
    row = conn.execute(
        """SELECT r.username, r.full_name, r.work_email, r.person_id, r.account_attempts
           FROM hr.onboarding_request r WHERE r.id = %s""",
        (request_id,),
    ).fetchone()
    username, full_name, email, person_id, attempts = row
    password = temporary_password()
    try:
        subject = users.create(str(request_id), username, full_name, email, password)
        encrypted = cipher.encrypt(password)
    except AccountConflict as exc:
        conn.execute(
            """UPDATE hr.onboarding_request SET account_status = 'FAILED', account_error = %s
                        WHERE id = %s""",
            (str(exc), request_id),
        )
        return "FAILED"
    except Exception as exc:  # noqa: BLE001
        failed = attempts + 1 >= MAX_ATTEMPTS
        log.warning("tạo tài khoản cho hồ sơ %s lỗi (lần %d): %s", request_id, attempts + 1, exc)
        conn.execute(
            """UPDATE hr.onboarding_request
                        SET account_attempts = account_attempts + 1, account_error = %s,
                            account_status = CASE WHEN %s THEN 'FAILED' ELSE account_status END
                        WHERE id = %s""",
            (f"Chưa tạo được tài khoản: {str(exc)[:300]}", failed, request_id),
        )
        return "FAILED" if failed else "PENDING"
    conn.execute("UPDATE core.person SET idp_subject = %s WHERE id = %s", (subject, person_id))
    conn.execute(
        """UPDATE hr.onboarding_request
                    SET account_status = 'CREATED', account_error = NULL, initial_password_enc = %s
                    WHERE id = %s""",
        (encrypted, request_id),
    )
    log.info("đã tạo tài khoản %s cho hồ sơ %s", username, request_id)
    return "CREATED"


def run_once(conn: psycopg.Connection, users: KeycloakUsers, cipher: PiiCipher, limit: int = 20) -> int:
    done = 0
    for _ in range(limit):
        row = conn.execute(
            """SELECT id FROM hr.onboarding_request
               WHERE account_status = 'PENDING' AND account_attempts < %s
                 AND updated_at <= now() - account_attempts * interval '30 seconds'
               ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED""",
            (MAX_ATTEMPTS,),
        ).fetchone()
        if row is None:
            conn.commit()
            break
        provision(conn, users, cipher, row[0])
        conn.commit()
        done += 1
    return done


def enforce_admin_otp(conn: psycopg.Connection, users: KeycloakUsers, done: set[str]) -> int:
    """Chủ sở hữu và người có quyền quản trị ở công ty có chủ sở hữu phải đăng nhập hai lớp (ADR #57): tài khoản chưa có
    OTP bị yêu cầu cài ở lần đăng nhập tới. `done` nhớ tài khoản đã kiểm trong tiến trình để không gọi Keycloak lặp lại."""
    rows = conn.execute(
        """SELECT DISTINCT p.idp_subject
           FROM core.person p JOIN core.tenant_owner o ON o.tenant_id = p.tenant_id
           WHERE p.idp_subject IS NOT NULL
             AND (p.id = o.person_id OR EXISTS (SELECT FROM core.v_admin a WHERE a.person_id = p.id))"""
    ).fetchall()
    conn.commit()
    changed = 0
    for (subject,) in rows:
        if subject in done:
            continue
        if users.ensure_otp(subject):
            changed += 1
            log.info("tài khoản quản trị %s phải cài OTP ở lần đăng nhập tới", subject)
        done.add(subject)
    return changed
