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

import argparse
import json
import logging
import os
import secrets
import ssl
import string
import sys
import urllib.error
import urllib.parse
import urllib.request

import psycopg

from .demo import UNIT_TYPES

log = logging.getLogger("tenant")

REALM = "bms"


def _internal_tls(url: str) -> ssl.SSLContext | None:
    """mTLS tới Keycloak (infra/compose/mtls.yml): chứng chỉ dịch vụ trong INTERNAL_TLS_DIR do openbao-init cấp."""
    directory, identity = os.environ.get("INTERNAL_TLS_DIR", ""), os.environ.get("INTERNAL_TLS_IDENTITY", "")
    if not url.startswith("https://") or not directory or not identity:
        return None
    ctx = ssl.create_default_context(cafile=os.path.join(directory, "ca.crt"))
    ctx.load_cert_chain(os.path.join(directory, f"{identity}.crt"), os.path.join(directory, f"{identity}.key"))
    return ctx


class Keycloak:
    def __init__(self, base_url: str, user: str, password: str):
        self.base_url = base_url.rstrip("/")
        body = urllib.parse.urlencode(
            {"grant_type": "password", "client_id": "admin-cli", "username": user, "password": password}
        ).encode()
        token = self._call("POST", "/realms/master/protocol/openid-connect/token", body, form=True)[1]
        self.token = json.loads(token)["access_token"]

    def _call(self, method: str, path: str, body: bytes | None = None, form: bool = False):
        headers = {"Content-Type": "application/x-www-form-urlencoded" if form else "application/json"}
        if getattr(self, "token", None):
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.base_url + path, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15, context=_internal_tls(self.base_url)) as resp:
                return resp, resp.read().decode()
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                return exc, ""
            raise SystemExit(f"Keycloak trả lỗi {exc.code} cho {path}: {exc.read().decode()[:200]}") from exc
        except urllib.error.URLError as exc:
            raise SystemExit(f"Không kết nối được Keycloak {self.base_url}: {exc.reason}") from exc

    def find(self, username: str) -> dict | None:
        query = urllib.parse.urlencode({"username": username, "exact": "true"})
        users = json.loads(self._call("GET", f"/admin/realms/{REALM}/users?{query}")[1])
        return next((u for u in users if u["username"] == username), None)

    def create(self, username: str, full_name: str, email: str | None, password: str) -> str | None:
        last, _, first = full_name.strip().rpartition(" ")
        body = {
            "username": username,
            "enabled": True,
            "firstName": first,
            "lastName": last,
            "credentials": [{"type": "password", "value": password, "temporary": True}],
            "requiredActions": ["UPDATE_PASSWORD"],
        }
        if email:
            body |= {"email": email, "emailVerified": False}
        resp, _ = self._call("POST", f"/admin/realms/{REALM}/users", json.dumps(body).encode())
        if resp.status == 409:
            return None
        return resp.headers["Location"].rstrip("/").rsplit("/", 1)[-1]


def temporary_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isdigit() for c in password) and any(c.isupper() for c in password):
            return password


def create_tenant(
    conn: psycopg.Connection,
    code: str,
    name: str,
    admin_subject: str,
    admin_name: str,
    root_type: str = "CONG_TY",
    parent: str | None = None,
) -> dict:
    """Khung công ty dựng bằng core.create_tenant (dùng chung với trang khởi tạo, ADR #57). Người chạy lệnh trên máy chủ
    có toàn quyền nên quản trị viên đầu tiên đồng thời là chủ sở hữu."""
    x = conn.execute
    if x("SELECT 1 FROM core.tenant WHERE code = %s", (code,)).fetchone():
        raise SystemExit(f"Công ty {code} đã có, không tạo lại")
    if root_type not in UNIT_TYPES:
        raise SystemExit(f"Loại đơn vị gốc {root_type} không hợp lệ: {', '.join(UNIT_TYPES)}")
    if parent and not x("SELECT 1 FROM core.tenant WHERE code = %s", (parent,)).fetchone():
        raise SystemExit(f"Không có công ty mẹ {parent}")
    with conn.transaction():
        tid, root, _director, seat = x(
            "SELECT * FROM core.create_tenant(%s, %s, %s, %s)", (code, name, root_type, parent)
        ).fetchone()
        person = x(
            "SELECT core.place_person(%s, %s, %s, %s, %s)", (tid, admin_subject, admin_name, f"{code}-0001", seat)
        ).fetchone()[0]
        x("INSERT INTO core.tenant_owner (tenant_id, person_id) VALUES (%s, %s)", (tid, person))
    return {"tenant_id": tid, "root_unit_id": root, "person_id": person}


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="python -m app.tenant", description="Tạo công ty mới và quản trị viên đầu tiên")
    p.add_argument("--code", required=True, help="Mã công ty, viết hoa không dấu, ví dụ ABC")
    p.add_argument("--name", required=True, help="Tên công ty")
    p.add_argument("--root-type", default="CONG_TY", help="Loại đơn vị gốc: CONG_TY (mặc định), TAP_DOAN…")
    p.add_argument("--parent", help="Mã công ty mẹ, khi công ty mới là thành viên của một tập đoàn đã tạo")
    p.add_argument("--admin-username", required=True, help="Tên đăng nhập của quản trị viên")
    p.add_argument("--admin-name", required=True, help="Họ tên quản trị viên")
    p.add_argument("--admin-email")
    args = p.parse_args(argv)
    code, username = args.code.strip().upper(), args.admin_username.strip().lower()

    kc = Keycloak(
        os.environ.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080"),
        os.environ.get("KEYCLOAK_ADMIN", "kcadmin"),
        os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"),
    )
    url = os.environ.get("DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms")
    with psycopg.connect(url) as conn:
        if conn.execute("SELECT 1 FROM core.tenant WHERE code = %s", (code,)).fetchone():
            raise SystemExit(f"Công ty {code} đã có, không tạo lại")
        password = temporary_password()
        subject = kc.create(username, args.admin_name, args.admin_email, password)
        if subject is None:
            existing = kc.find(username)
            if existing is None:
                raise SystemExit(f"Email {args.admin_email} đã thuộc một tài khoản khác")
            subject, password = existing["id"], None
        try:
            create_tenant(conn, code, args.name.strip(), subject, args.admin_name.strip(), args.root_type, args.parent)
        except psycopg.Error as exc:
            raise SystemExit(f"Không tạo được công ty: {exc.diag.message_primary or exc}") from exc
    print(f"Đã tạo công ty {code} – {args.name}")
    print(f"Quản trị viên: {username}")
    if password:
        print(f"Mật khẩu tạm (đổi ở lần đăng nhập đầu): {password}")
    else:
        print("Tài khoản đã có sẵn: dùng mật khẩu hiện tại")
    return 0


if __name__ == "__main__":
    sys.exit(main())
