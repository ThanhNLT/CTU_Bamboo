# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Bootstrap bổ sung WEB_ORIGIN vào client bms-web (nâng cấp không cần import lại realm)."""

# ===== Thư viện chuẩn =====
import json
import os

# ===== Thư viện bên ngoài =====
import httpx  # HTTPX
import pytest  # pytest

# ===== Module nội bộ =====
from app import keycloak_sync

# ===== Hằng số & cấu hình =====
KEYCLOAK = os.environ.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080")
ADMIN = (os.environ.get("KEYCLOAK_ADMIN", "kcadmin"), os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"))

OLD = {
    "redirectUris": ["http://localhost:5173/*"],
    "webOrigins": ["http://localhost:5173"],
    "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": "http://localhost:5173/*"},
}


# ===== Kiểm thử =====
def test_bo_sung_origin_moi_giu_gia_tri_cu():
    changes = keycloak_sync.desired_changes(OLD, "http://localhost:8000/")
    assert changes["redirectUris"] == ["http://localhost:5173/*", "http://localhost:8000/*"]
    assert changes["webOrigins"] == ["http://localhost:5173", "http://localhost:8000"]
    assert changes["attributes"]["post.logout.redirect.uris"] == "http://localhost:5173/*##http://localhost:8000/*"
    assert changes["attributes"]["pkce.code.challenge.method"] == "S256"


def test_da_du_thi_khong_doi():
    updated = {**OLD, **keycloak_sync.desired_changes(OLD, "http://localhost:8000")}
    assert keycloak_sync.desired_changes(updated, "http://localhost:8000") == {}


def test_web_origins_plus_da_bao_gom():
    client = {
        "redirectUris": ["https://bamboo.example.vn/*"],
        "webOrigins": ["+"],
        "attributes": {"post.logout.redirect.uris": "+"},
    }
    assert keycloak_sync.desired_changes(client, "https://bamboo.example.vn") == {}


# ===== Fixture kiểm thử =====
@pytest.fixture
def admin():
    try:
        token = keycloak_sync.admin_token(KEYCLOAK, *ADMIN)
    except httpx.HTTPError:
        pytest.skip("Keycloak không truy cập được")
    http = httpx.Client(
        base_url=f"{KEYCLOAK}/admin/realms/bms", headers={"Authorization": f"Bearer {token}"}, timeout=15
    )
    client = http.get("/clients", params={"clientId": "bms-web"}).json()[0]
    yield http, client
    http.put(f"/clients/{client['id']}", json=client).raise_for_status()  # trả lại như cũ
    http.close()


# ===== Kiểm thử =====
def test_dong_bo_tren_keycloak_that(admin):
    http, original = admin
    origin = "https://bamboo-sync-test.invalid"
    assert keycloak_sync.ensure_web_client(KEYCLOAK, *ADMIN, origin) is True
    client = http.get(f"/clients/{original['id']}").json()
    assert f"{origin}/*" in client["redirectUris"]
    assert set(original["redirectUris"]) <= set(client["redirectUris"])
    assert origin in client["webOrigins"]
    assert f"{origin}/*" in client["attributes"]["post.logout.redirect.uris"].split("##")
    assert keycloak_sync.ensure_web_client(KEYCLOAK, *ADMIN, origin) is False


def test_client_tao_tai_khoan(admin):
    """bms-provisioner: client bí mật chỉ có service account, quyền quản lý người dùng realm bms (ADR #41);
    tạo được người dùng bằng token của chính nó; chạy lại không đổi."""
    http, _ = admin
    found = http.get("/clients", params={"clientId": keycloak_sync.PROVISIONER_ID}).json()
    # Stack đang chạy dùng secret trong két: kiểm thử xong đặt lại đúng secret đó.
    original = http.get(f"/clients/{found[0]['id']}/client-secret").json()["value"] if found else None
    secret = "provisioner-test-secret"
    try:
        _check_provisioner(http, secret)
    finally:
        if original:
            keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, original)


# ===== Hàm hỗ trợ kiểm thử =====
def _check_provisioner(http, secret):
    keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, secret)
    assert keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, secret) is False
    client = http.get("/clients", params={"clientId": keycloak_sync.PROVISIONER_ID}).json()[0]
    assert client["serviceAccountsEnabled"] and not client["publicClient"] and not client["standardFlowEnabled"]
    token = httpx.post(
        f"{KEYCLOAK}/realms/bms/protocol/openid-connect/token",
        timeout=15,
        data={"grant_type": "client_credentials", "client_id": keycloak_sync.PROVISIONER_ID, "client_secret": secret},
    )
    assert token.status_code == 200
    users = httpx.get(
        f"{KEYCLOAK}/admin/realms/bms/users",
        params={"max": 1},
        timeout=15,
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
    )
    assert users.status_code == 200
    # Không có quyền quản trị client hay realm.
    clients = httpx.get(
        f"{KEYCLOAK}/admin/realms/bms/clients",
        timeout=15,
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
    )
    assert clients.status_code == 403
    # Đổi secret (ví dụ két sinh lại): bootstrap đặt theo két.
    assert keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, secret + "-2") is True


# ===== Kiểm thử =====
def test_bo_sung_tai_khoan_demo(admin, tmp_path):
    """Realm đã import từ trước: tài khoản demo mới được thêm, giữ id; tài khoản đã có không bị đụng."""
    http, _ = admin
    realm = tmp_path / "realm.json"
    user = {
        "id": "6f0c1d2e-0000-4000-8000-00000000e2e1",
        "username": "demo.sync.test",
        "enabled": True,
        "credentials": [{"type": "password", "value": "${DEMO_PASSWORD}", "temporary": False}],
    }
    realm.write_text(json.dumps({"users": [user]}), encoding="utf-8")
    try:
        assert keycloak_sync.ensure_demo_users(KEYCLOAK, *ADMIN, "pw-sync-test", realm) == 1
        assert keycloak_sync.ensure_demo_users(KEYCLOAK, *ADMIN, "pw-sync-test", realm) == 0
        assert http.get(f"/users/{user['id']}").json()["username"] == "demo.sync.test"
        assert keycloak_sync.ensure_demo_users(KEYCLOAK, *ADMIN, "", realm) == 0
    finally:
        http.delete(f"/users/{user['id']}")
