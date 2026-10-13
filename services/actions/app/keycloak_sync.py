# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Đồng bộ client của realm `bms` (job bootstrap): `bms-web` theo địa chỉ ứng dụng, `bms-provisioner` để tạo
tài khoản nhân viên mới.

Keycloak chỉ import realm ở lần chạy đầu, nên khi địa chỉ ứng dụng đổi (nâng cấp 0.1.0 → 0.2.0
chuyển sang cổng API, hoặc đổi tên miền) client vẫn giữ redirect URI cũ và đăng nhập báo lỗi.
Mỗi lần khởi động, bootstrap bổ sung `WEB_ORIGIN` vào redirect URI, web origin và URI sau đăng
xuất nếu còn thiếu; không xóa giá trị có sẵn, không đụng dữ liệu khác. Chạy lại bao nhiêu lần
cũng cho cùng kết quả.
"""

# ===== Thư viện chuẩn =====
import json
import logging
import pathlib

# ===== Thư viện bên ngoài =====
import httpx  # HTTPX

# ===== Hằng số & cấu hình =====
log = logging.getLogger("keycloak_sync")

REALM = "bms"
CLIENT_ID = "bms-web"
PROVISIONER_ID = "bms-provisioner"
# Quyền tối thiểu của client tạo tài khoản (ADR #41): quản lý người dùng realm bms, không phải admin master.
PROVISIONER_ROLES = ("manage-users", "view-users", "query-users")
REALM_FILE = pathlib.Path(__file__).resolve().parents[3] / "platform/keycloak/realm/bms-realm.json"


# ===== Hàm =====
def admin_token(base_url: str, user: str, password: str) -> str:
    resp = httpx.post(
        f"{base_url}/realms/master/protocol/openid-connect/token",
        timeout=15,
        data={"grant_type": "password", "client_id": "admin-cli", "username": user, "password": password},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def desired_changes(client: dict, web_origin: str) -> dict:
    """Các trường cần cập nhật để client chấp nhận `web_origin` (rỗng nếu đã đủ)."""
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
    """Trả về True nếu đã cập nhật client, False nếu không cần."""
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


def ensure_provisioner_client(base_url: str, user: str, password: str, secret: str) -> bool:
    """Client bí mật `bms-provisioner` (chỉ service account) với secret từ OpenBao và quyền quản lý người dùng
    của realm. Trả về True nếu đã tạo hoặc sửa. Chạy lại bao nhiêu lần cũng cho cùng kết quả."""
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
    """Thêm tài khoản demo có trong tệp realm mà Keycloak chưa có (realm chỉ import ở lần chạy đầu, nên bản đã
    cài không tự có tài khoản demo mới). Giữ nguyên id (khớp person.idp_subject, ADR #23); không đụng tài
    khoản đã có. Trả về số tài khoản đã thêm."""
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
