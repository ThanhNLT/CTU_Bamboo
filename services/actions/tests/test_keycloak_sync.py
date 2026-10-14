# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import json
import os

import httpx
import pytest

from app import keycloak_sync

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
        base_url=f"{KEYCLOAK}/admin/realms/bms", headers={"Authorization": f"Bearer {token}"}, timeout=15
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
    )
    assert token.status_code == 200
    users = httpx.get(
        f"{KEYCLOAK}/admin/realms/bms/users",
        params={"max": 1},
        timeout=15,
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
    )
    assert users.status_code == 200
    clients = httpx.get(
        f"{KEYCLOAK}/admin/realms/bms/clients",
        timeout=15,
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
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
        base_url=f"{KEYCLOAK}/admin/realms/master", headers={"Authorization": f"Bearer {token}"}, timeout=15
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
