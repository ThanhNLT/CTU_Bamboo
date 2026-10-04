# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Bootstrap bổ sung WEB_ORIGIN vào client bms-web (nâng cấp không cần import lại realm)."""

import os

import httpx
import pytest

from app import keycloak_sync

KEYCLOAK = os.environ.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080")
ADMIN = (os.environ.get("KEYCLOAK_ADMIN", "kcadmin"), os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"))

OLD = {"redirectUris": ["http://localhost:5173/*"], "webOrigins": ["http://localhost:5173"],
       "attributes": {"pkce.code.challenge.method": "S256",
                      "post.logout.redirect.uris": "http://localhost:5173/*"}}


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
    client = {"redirectUris": ["https://bamboo.example.vn/*"], "webOrigins": ["+"],
              "attributes": {"post.logout.redirect.uris": "+"}}
    assert keycloak_sync.desired_changes(client, "https://bamboo.example.vn") == {}


@pytest.fixture
def admin():
    try:
        token = keycloak_sync.admin_token(KEYCLOAK, *ADMIN)
    except httpx.HTTPError:
        pytest.skip("Keycloak không truy cập được")
    http = httpx.Client(base_url=f"{KEYCLOAK}/admin/realms/bms",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)
    client = http.get("/clients", params={"clientId": "bms-web"}).json()[0]
    yield http, client
    http.put(f"/clients/{client['id']}", json=client).raise_for_status()  # trả lại như cũ
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
