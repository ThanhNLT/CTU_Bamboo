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

import json
import os

import httpx
import pytest

from app import keycloak_sync
from bamboo_common import tls
from conftest import TEST_DB_URL

KEYCLOAK = os.environ.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080")
ADMIN = (os.environ.get("KEYCLOAK_ADMIN", "kcadmin"), os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"))

OLD = {
    "redirectUris": ["http://localhost:5173/*"],
    "webOrigins": ["http://localhost:5173"],
    "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": "http://localhost:5173/*"},
}


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


@pytest.fixture
def admin():
    try:
        token = keycloak_sync.admin_token(KEYCLOAK, *ADMIN)
    except httpx.HTTPError:
        pytest.skip("Keycloak không truy cập được")
    http = httpx.Client(
        base_url=f"{KEYCLOAK}/admin/realms/bms",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
        verify=tls.verify(KEYCLOAK),
    )
    client = http.get("/clients", params={"clientId": "bms-web"}).json()[0]
    yield http, client
    http.put(f"/clients/{client['id']}", json=client).raise_for_status()
    http.close()


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
    http, _ = admin
    found = http.get("/clients", params={"clientId": keycloak_sync.PROVISIONER_ID}).json()
    original = http.get(f"/clients/{found[0]['id']}/client-secret").json()["value"] if found else None
    secret = "provisioner-test-secret"
    try:
        _check_provisioner(http, secret)
    finally:
        if original:
            keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, original)


def _check_provisioner(http, secret):
    keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, secret)
    assert keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, secret) is False
    client = http.get("/clients", params={"clientId": keycloak_sync.PROVISIONER_ID}).json()[0]
    assert client["serviceAccountsEnabled"] and not client["publicClient"] and not client["standardFlowEnabled"]
    token = httpx.post(
        f"{KEYCLOAK}/realms/bms/protocol/openid-connect/token",
        timeout=15,
        data={"grant_type": "client_credentials", "client_id": keycloak_sync.PROVISIONER_ID, "client_secret": secret},
        verify=tls.verify(KEYCLOAK),
    )
    assert token.status_code == 200
    users = httpx.get(
        f"{KEYCLOAK}/admin/realms/bms/users",
        params={"max": 1},
        timeout=15,
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
        verify=tls.verify(KEYCLOAK),
    )
    assert users.status_code == 200
    clients = httpx.get(
        f"{KEYCLOAK}/admin/realms/bms/clients",
        timeout=15,
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
        verify=tls.verify(KEYCLOAK),
    )
    assert clients.status_code == 403
    assert keycloak_sync.ensure_provisioner_client(KEYCLOAK, *ADMIN, secret + "-2") is True


def test_bo_sung_tai_khoan_demo(admin, tmp_path):
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


def master_realm() -> httpx.Client:
    token = keycloak_sync.admin_token(KEYCLOAK, *ADMIN)
    return httpx.Client(
        base_url=f"{KEYCLOAK}/admin/realms/master",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
        verify=tls.verify(KEYCLOAK),
    )


def test_realm_master_dung_dia_chi_quan_tri(admin):
    with master_realm() as http:
        original = http.get("").json()["attributes"].get("frontendUrl", "")
    try:
        url = "http://kc-admin-test.invalid:8080"
        assert keycloak_sync.ensure_admin_console_url(KEYCLOAK, *ADMIN, url + "/") is True
        with master_realm() as http:
            assert http.get("").json()["attributes"]["frontendUrl"] == url
        assert keycloak_sync.ensure_admin_console_url(KEYCLOAK, *ADMIN, url) is False
        assert keycloak_sync.ensure_admin_console_url(KEYCLOAK, *ADMIN, "") is False
    finally:
        with master_realm() as http:
            attrs = http.get("").json()["attributes"]
            http.put("", json={"attributes": {**attrs, "frontendUrl": original}}).raise_for_status()


def test_realm_dung_theme_dang_nhap_bamboo(admin):
    realm = keycloak_sync.REALM
    token = keycloak_sync.admin_token(KEYCLOAK, *ADMIN)
    with httpx.Client(
        base_url=f"{KEYCLOAK}/admin/realms/{realm}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
        verify=tls.verify(KEYCLOAK),
    ) as http:
        original = http.get("").json().get("loginTheme")
        try:
            http.put("", json={"loginTheme": "keycloak.v2"}).raise_for_status()
            assert keycloak_sync.ensure_login_theme(KEYCLOAK, *ADMIN) is True
            assert http.get("").json()["loginTheme"] == keycloak_sync.LOGIN_THEME
            assert keycloak_sync.ensure_login_theme(KEYCLOAK, *ADMIN) is False
        finally:
            http.put("", json={"loginTheme": original}).raise_for_status()


def test_realm_giu_thuoc_tinh_tai_khoan(admin):
    """Keycloak 26 bỏ thuộc tính chưa khai trong User Profile; bootstrap bật ADMIN_EDIT để giữ thuộc tính đánh dấu đơn."""
    token = keycloak_sync.admin_token(KEYCLOAK, *ADMIN)
    with httpx.Client(
        base_url=f"{KEYCLOAK}/admin/realms/{keycloak_sync.REALM}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
        verify=tls.verify(KEYCLOAK),
    ) as http:
        original = http.get("/users/profile").json()
        try:
            http.put("/users/profile", json={k: v for k, v in original.items() if k != "unmanagedAttributePolicy"})
            assert keycloak_sync.ensure_user_attributes(KEYCLOAK, *ADMIN) is True
            assert keycloak_sync.ensure_user_attributes(KEYCLOAK, *ADMIN) is False
            created = http.post(
                "/users",
                json={"username": "thuoc.tinh.thu", "enabled": True, "attributes": {"bamboo_setup_application": ["x"]}},
            )
            created.raise_for_status()
            subject = created.headers["Location"].rsplit("/", 1)[-1]
            try:
                assert http.get(f"/users/{subject}").json()["attributes"]["bamboo_setup_application"] == ["x"]
            finally:
                http.delete(f"/users/{subject}")
        finally:
            http.put("/users/profile", json=original)


def test_sua_tai_khoan_demo_lech_id(admin, tmp_path, conn):
    """Keycloak có tài khoản demo trùng tên nhưng lệch id: tạo lại đúng id, mật khẩu demo, chuyển liên kết người."""
    http, _ = admin
    wanted = "6f0c1d2e-0000-4000-8000-00000000e2e2"
    realm = tmp_path / "realm.json"
    user = {
        "id": wanted,
        "username": "demo.lech.id",
        "enabled": True,
        "firstName": "Lệch",
        "lastName": "Id",
        "email": "demo.lech.id@example.invalid",
        "emailVerified": True,
        "credentials": [{"type": "password", "value": "${DEMO_PASSWORD}", "temporary": False}],
    }
    realm.write_text(json.dumps({"users": [user]}), encoding="utf-8")
    http.post("/users", json={"username": "demo.lech.id", "enabled": True}).raise_for_status()
    wrong = http.get("/users", params={"username": "demo.lech.id", "exact": "true"}).json()[0]["id"]
    assert wrong != wanted
    person = conn.execute(
        "SELECT test.person('TDX', %s, 'Người lệch id', %s) AS id", (f"lech_{wrong[:8]}", wrong)
    ).fetchone()["id"]
    try:
        fixed = keycloak_sync.fix_demo_user_ids(KEYCLOAK, *ADMIN, "pw-lech-test", realm)
        assert fixed == [(wrong, wanted)]
        assert http.get(f"/users/{wanted}").json()["username"] == "demo.lech.id"
        assert http.get(f"/users/{wrong}").status_code == 404
        assert keycloak_sync.fix_demo_user_ids(KEYCLOAK, *ADMIN, "pw-lech-test", realm) == [], "lần sau không đổi gì"
        assert keycloak_sync.relink_people(TEST_DB_URL, fixed) == 1
        assert (
            conn.execute("SELECT idp_subject FROM core.person WHERE id = %s", (person,)).fetchone()["idp_subject"]
            == wanted
        )
    finally:
        http.delete(f"/users/{wanted}")
        http.delete(f"/users/{wrong}")
        conn.execute("DELETE FROM core.person WHERE id = %s", (person,))
