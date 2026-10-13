# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Tạo tài khoản Keycloak cho nhân viên mới sau khi đề nghị tiếp nhận được duyệt (ADR #41).

CSDL đưa hồ sơ vào hàng đợi (account_status = PENDING, kênh `hr_account`); dịch vụ này (chạy trong vòng lặp
flow-sync) tạo tài khoản bằng client `bms-provisioner` (chỉ quản lý người dùng realm bms), đặt mật khẩu tạm
bắt đổi ở lần đăng nhập đầu, gắn `sub` vào người, lưu mật khẩu tạm dạng bản mã để phòng nhân sự bàn giao.

Chạy lại an toàn: tài khoản mang thuộc tính `bamboo_onboarding_request`; lần trước đã tạo mà chưa kịp ghi
CSDL thì lần sau nhận lại tài khoản đó và đặt mật khẩu tạm mới. Lỗi mạng thử lại tối đa MAX_ATTEMPTS lần,
lần sau cách lần trước lâu hơn 30 giây.
"""

import logging
import secrets
import string
import time

import httpx
import psycopg

from .pii import PiiCipher

log = logging.getLogger("hr_account")

REALM = "bms"
ATTRIBUTE = "bamboo_onboarding_request"
MAX_ATTEMPTS = 5


class AccountConflict(Exception):
    """Tên đăng nhập hoặc email đã thuộc một tài khoản khác: cần người sửa, không tự thử lại."""


def temporary_password(length: int = 14) -> str:
    """Mật khẩu tạm có đủ chữ hoa, chữ thường, chữ số (bỏ ký tự dễ nhầm: 0 O 1 l I)."""
    alphabet = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value):
            return value


def split_name(full_name: str) -> tuple[str, str]:
    """ "Nguyễn Văn An" → ("An", "Nguyễn Văn") theo cách realm demo đặt firstName/lastName."""
    last, _, first = full_name.strip().rpartition(" ")
    return first, last


class KeycloakUsers:
    """Admin API của realm bms bằng token client_credentials của bms-provisioner."""

    def __init__(self, base_url: str, client_id: str, client_secret: str, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.http = httpx.Client(base_url=f"{self.base_url}/admin/realms/{REALM}", timeout=timeout)
        self._token: str | None = None
        self._expires = 0.0

    def _headers(self) -> dict:
        if self._token is None or time.monotonic() > self._expires:
            resp = httpx.post(
                f"{self.base_url}/realms/{REALM}/protocol/openid-connect/token",
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
    ) -> str:
        """Tạo tài khoản, trả về id (`sub`). Đã có tài khoản do chính hồ sơ này tạo thì dùng lại.

        `attribute` đánh dấu nguồn tạo: hồ sơ tiếp nhận (mặc định) hoặc người do quản trị thêm (ADR #44)."""
        first, last = split_name(full_name)
        body = {
            "username": username,
            "enabled": True,
            "firstName": first,
            "lastName": last,
            "attributes": {attribute: [request_id]},
            "credentials": [{"type": "password", "value": password, "temporary": True}],
            "requiredActions": ["UPDATE_PASSWORD"],
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


def provision(conn: psycopg.Connection, users: KeycloakUsers, cipher: PiiCipher, request_id) -> str:
    """Tạo tài khoản cho một hồ sơ đang chờ (đã khóa dòng). Trả về trạng thái mới."""
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
    except Exception as exc:  # noqa: BLE001 - lỗi mạng, Keycloak hay OpenBao: thử lại ở lần sau
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
    """Xử lý các hồ sơ đang chờ tạo tài khoản, mỗi hồ sơ một giao dịch. Trả về số hồ sơ đã xử lý."""
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
