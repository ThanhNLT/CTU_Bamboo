# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

import json
import logging
import pathlib

import httpx
import psycopg

log = logging.getLogger("keycloak_sync")

REALM = "bms"
CLIENT_ID = "bms-web"
LOGIN_THEME = "dxos-login"
PROVISIONER_ID = "bms-provisioner"
PROVISIONER_ROLES = ("manage-users", "view-users", "query-users")
REALM_FILE = pathlib.Path(__file__).resolve().parents[3] / "infra/platform/keycloak/realm/bms-realm.json"


def admin_token(base_url: str, user: str, password: str) -> str:
    resp = httpx.post(
        f"{base_url}/realms/master/protocol/openid-connect/token",
        timeout=15,
        data={"grant_type": "password", "client_id": "admin-cli", "username": user, "password": password},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def desired_changes(client: dict, web_origin: str) -> dict:
    origin = web_origin.rstrip("/")
    changes = {}
    redirects = list(client.get("redirectUris") or [])
    if f"{origin}/*" not in redirects:
        changes["redirectUris"] = [*redirects, f"{origin}/*"]
    origins = list(client.get("webOrigins") or [])
    if origin not in origins and "+" not in origins:
        changes["webOrigins"] = [*origins, origin]
    attrs = dict(client.get("attributes") or {})
    logout = [u for u in (attrs.get("post.logout.redirect.uris") or "").split("##") if u]
    if f"{origin}/*" not in logout and "+" not in logout:
        attrs["post.logout.redirect.uris"] = "##".join([*logout, f"{origin}/*"])
        changes["attributes"] = attrs
    return changes


def ensure_web_client(base_url: str, user: str, password: str, web_origin: str) -> bool:
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    with httpx.Client(base_url=f"{base_url}/admin/realms/{REALM}", headers=headers, timeout=15) as http:
        found = http.get("/clients", params={"clientId": CLIENT_ID})
        found.raise_for_status()
        if not found.json():
            raise RuntimeError(f"Không có client {CLIENT_ID} trong realm {REALM}")
        client = found.json()[0]
        changes = desired_changes(client, web_origin)
        if not changes:
            return False
        http.put(f"/clients/{client['id']}", json={**client, **changes}).raise_for_status()
    log.info("đã bổ sung %s vào client %s: %s", web_origin, CLIENT_ID, ", ".join(changes))
    return True


def ensure_admin_console_url(base_url: str, user: str, password: str, admin_url: str) -> bool:
    if not admin_url:
        return False
    admin_url = admin_url.rstrip("/")
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    with httpx.Client(base_url=f"{base_url}/admin/realms/master", headers=headers, timeout=15) as http:
        realm = http.get("")
        realm.raise_for_status()
        attrs = dict(realm.json().get("attributes") or {})
        if attrs.get("frontendUrl") == admin_url:
            return False
        http.put("", json={"attributes": {**attrs, "frontendUrl": admin_url}}).raise_for_status()
    log.info("realm master dùng địa chỉ quản trị %s", admin_url)
    return True


def ensure_login_theme(base_url: str, user: str, password: str, theme: str = LOGIN_THEME) -> bool:
    """Realm đã có từ trước không nhận lại tệp import, nên đặt theme đăng nhập qua Admin API."""
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    with httpx.Client(base_url=f"{base_url}/admin/realms/{REALM}", headers=headers, timeout=15) as http:
        realm = http.get("")
        realm.raise_for_status()
        if realm.json().get("loginTheme") == theme:
            return False
        http.put("", json={"loginTheme": theme}).raise_for_status()
    log.info("realm %s dùng theme đăng nhập %s", REALM, theme)
    return True


def ensure_provisioner_client(base_url: str, user: str, password: str, secret: str) -> bool:
    if not secret:
        raise RuntimeError("Thiếu secret bms/keycloak-provisioner (chạy openbao-init trước)")
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    changed = False
    with httpx.Client(base_url=f"{base_url}/admin/realms/{REALM}", headers=headers, timeout=15) as http:
        desired = {
            "clientId": PROVISIONER_ID,
            "name": "Tạo tài khoản nhân viên (dịch vụ nội bộ)",
            "enabled": True,
            "publicClient": False,
            "serviceAccountsEnabled": True,
            "standardFlowEnabled": False,
            "implicitFlowEnabled": False,
            "directAccessGrantsEnabled": False,
            "clientAuthenticatorType": "client-secret",
            "secret": secret,
        }
        found = http.get("/clients", params={"clientId": PROVISIONER_ID})
        found.raise_for_status()
        if not found.json():
            http.post("/clients", json=desired).raise_for_status()
            found = http.get("/clients", params={"clientId": PROVISIONER_ID})
            found.raise_for_status()
            changed = True
        client = found.json()[0]
        current = http.get(f"/clients/{client['id']}/client-secret")
        current.raise_for_status()
        if (
            any(client.get(k) != v for k, v in desired.items() if k != "secret")
            or current.json().get("value") != secret
        ):
            http.put(f"/clients/{client['id']}", json={**client, **desired}).raise_for_status()
            changed = True

        account = http.get(f"/clients/{client['id']}/service-account-user")
        account.raise_for_status()
        realm_mgmt = http.get("/clients", params={"clientId": "realm-management"})
        realm_mgmt.raise_for_status()
        rm_id = realm_mgmt.json()[0]["id"]
        mapped = http.get(f"/users/{account.json()['id']}/role-mappings/clients/{rm_id}")
        mapped.raise_for_status()
        missing = set(PROVISIONER_ROLES) - {r["name"] for r in mapped.json()}
        if missing:
            roles = []
            for name in sorted(missing):
                role = http.get(f"/clients/{rm_id}/roles/{name}")
                role.raise_for_status()
                roles.append(role.json())
            http.post(f"/users/{account.json()['id']}/role-mappings/clients/{rm_id}", json=roles).raise_for_status()
            changed = True
    if changed:
        log.info("đã cấu hình client %s", PROVISIONER_ID)
    return changed


def ensure_demo_users(
    base_url: str, user: str, password: str, demo_password: str, realm_file: pathlib.Path = REALM_FILE
) -> int:
    if not demo_password:
        return 0
    users = json.loads(realm_file.read_text(encoding="utf-8").replace("${DEMO_PASSWORD}", demo_password))["users"]
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    resp = httpx.post(
        f"{base_url}/admin/realms/{REALM}/partialImport",
        headers=headers,
        timeout=30,
        json={"ifResourceExists": "SKIP", "users": users},
    )
    resp.raise_for_status()
    added = int(resp.json().get("added", 0))
    if added:
        log.info("đã thêm %d tài khoản demo vào realm %s", added, REALM)
    return added


def fix_demo_user_ids(
    base_url: str, user: str, password: str, demo_password: str, realm_file: pathlib.Path = REALM_FILE
) -> list[tuple[str, str]]:
    """Tài khoản demo trùng tên đăng nhập nhưng lệch id so với realm (volume Keycloak cũ, tài khoản tạo lại bằng tay):
    token mang `sub` không khớp người nào trong CSDL nên đăng nhập báo "chưa thuộc tenant nào". Xóa tài khoản lệch rồi
    nhập lại đúng id, mật khẩu demo; trả các cặp (id cũ, id đúng) để chuyển liên kết trong CSDL. Chỉ chạy ở chế độ demo
    (có mật khẩu demo) và chỉ chạm các tên đăng nhập có trong realm demo."""
    if not demo_password:
        return []
    users = json.loads(realm_file.read_text(encoding="utf-8").replace("${DEMO_PASSWORD}", demo_password))["users"]
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    fixed: list[tuple[str, str]] = []
    with httpx.Client(base_url=f"{base_url}/admin/realms/{REALM}", headers=headers, timeout=30) as http:
        for wanted in users:
            found = http.get("/users", params={"username": wanted["username"], "exact": "true"})
            found.raise_for_status()
            current = next((u for u in found.json() if u["username"] == wanted["username"]), None)
            if current is None or current["id"] == wanted["id"]:
                continue
            taken = http.get(f"/users/{wanted['id']}")
            if taken.status_code == 200:
                log.warning(
                    "tài khoản demo %s: id %s đang thuộc tài khoản %s, không tự sửa",
                    wanted["username"],
                    wanted["id"],
                    taken.json().get("username"),
                )
                continue
            http.delete(f"/users/{current['id']}").raise_for_status()
            http.post("/partialImport", json={"ifResourceExists": "SKIP", "users": [wanted]}).raise_for_status()
            log.warning(
                "tài khoản demo %s lệch id (%s), đã tạo lại đúng id %s", wanted["username"], current["id"], wanted["id"]
            )
            fixed.append((current["id"], wanted["id"]))
    return fixed


def relink_people(database_url: str, fixed: list[tuple[str, str]]) -> int:
    """Người trong CSDL đang gắn id cũ của tài khoản demo vừa tạo lại thì chuyển sang id đúng."""
    if not fixed:
        return 0
    with psycopg.connect(database_url) as conn:
        n = 0
        for old, new in fixed:
            n += conn.execute(
                """UPDATE core.person p SET idp_subject = %s WHERE idp_subject = %s
                   AND NOT EXISTS (SELECT FROM core.person q WHERE q.tenant_id = p.tenant_id AND q.idp_subject = %s)""",
                (new, old, new),
            ).rowcount
    return n
