# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import argparse
import json
import logging
import os
import secrets
import string
import sys
import urllib.error
import urllib.parse
import urllib.request

import psycopg

from .demo import UNIT_TYPES

log = logging.getLogger("tenant")

REALM = "bms"

ROLES = {
    "NHAN_VIEN": ("Nhân viên", ["proc.purchase_request.create", "proc.purchase_request.read"]),
    "QUAN_LY": ("Quản lý", ["proc.purchase_request.read", "wf.approval.act", "hr.onboarding.read", "ic.order.read"]),
    "KIEM_SOAT": ("Kiểm soát tài chính", ["proc.purchase_request.read", "audit.read"]),
    "QUAN_TRI_TO_CHUC": (
        "Quản trị tổ chức",
        ["core.org.manage", "core.permission.manage", "mdm.manage", "audit.read", "wf.process.design"],
    ),
}

JOB_TITLES = {"GIAM_DOC": "Giám đốc", "QUAN_TRI_HE_THONG": "Quản trị hệ thống", "NHAN_VIEN": "Nhân viên"}


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
            with urllib.request.urlopen(req, timeout=15) as resp:
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
    x = conn.execute
    if x("SELECT 1 FROM core.tenant WHERE code = %s", (code,)).fetchone():
        raise SystemExit(f"Công ty {code} đã có, không tạo lại")
    if root_type not in UNIT_TYPES:
        raise SystemExit(f"Loại đơn vị gốc {root_type} không hợp lệ: {', '.join(UNIT_TYPES)}")
    with conn.transaction():
        tid = x("INSERT INTO core.tenant (code, name) VALUES (%s, %s) RETURNING id", (code, name)).fetchone()[0]
        if parent:
            row = x("SELECT id FROM core.tenant WHERE code = %s", (parent,)).fetchone()
            if row is None:
                raise SystemExit(f"Không có công ty mẹ {parent}")
            x("INSERT INTO core.tenant_relation (parent_tenant_id, child_tenant_id) VALUES (%s, %s)", (row[0], tid))

        def catalog(kind: str, item_code: str, item_name: str):
            return x(
                "INSERT INTO core.catalog_item (tenant_id, catalog, code, name) VALUES (%s, %s, %s, %s) RETURNING id",
                (tid, kind, item_code, item_name),
            ).fetchone()[0]

        unit_types = {c: catalog("UNIT_TYPE", c, n) for c, n in UNIT_TYPES.items()}
        titles = {c: catalog("JOB_TITLE", c, n) for c, n in JOB_TITLES.items()}
        root = x(
            """INSERT INTO core.org_unit (tenant_id, unit_type_id, code, name, is_legal_entity)
                  VALUES (%s, %s, %s, %s, true) RETURNING id""",
            (tid, unit_types[root_type], code, name),
        ).fetchone()[0]
        x(
            """INSERT INTO core.position (tenant_id, org_unit_id, job_title_id, name, is_head)
                  VALUES (%s, %s, %s, 'Giám đốc', true)""",
            (tid, root, titles["GIAM_DOC"]),
        )
        seat = x(
            """INSERT INTO core.position (tenant_id, org_unit_id, job_title_id, name)
                  VALUES (%s, %s, %s, 'Quản trị hệ thống') RETURNING id""",
            (tid, root, titles["QUAN_TRI_HE_THONG"]),
        ).fetchone()[0]
        person = x(
            """INSERT INTO core.person (tenant_id, idp_subject, full_name, employee_code)
                  VALUES (%s, %s, %s, %s) RETURNING id""",
            (tid, admin_subject, admin_name, f"{code}-0001"),
        ).fetchone()[0]
        x(
            """INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
                  VALUES (%s, %s, %s, 'PRIMARY', tstzrange(now(), NULL))""",
            (tid, person, seat),
        )
        roles = {}
        for role_code, (role_name, perms) in ROLES.items():
            roles[role_code] = x(
                "INSERT INTO core.role (tenant_id, code, name) VALUES (%s, %s, %s) RETURNING id",
                (tid, role_code, role_name),
            ).fetchone()[0]
            for perm in perms:
                x(
                    "INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (%s, %s, %s)",
                    (tid, roles[role_code], perm),
                )
        x(
            "INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope) VALUES (%s, %s, %s, 'UNIT')",
            (tid, roles["NHAN_VIEN"], root),
        )
        x(
            "INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope) VALUES (%s, %s, %s, 'TENANT')",
            (tid, roles["QUAN_TRI_TO_CHUC"], seat),
        )
        for process in ("PURCHASE_REQUEST", "ONBOARDING"):
            x(
                "INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order) VALUES (%s, %s, 0, 1)",
                (tid, process),
            )
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
