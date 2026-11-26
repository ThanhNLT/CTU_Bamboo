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

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth, config, main
from conftest import SETTINGS, ids

ISSUER = "http://localhost:8080/realms/bms"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class StaticJwks:
    def get_signing_key_from_jwt(self, token):
        return jwt.PyJWK.from_dict(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key(), as_dict=True))


def token(sub, key=KEY, **over):
    claims = {
        "sub": sub,
        "iss": ISSUER,
        "typ": "Bearer",
        "azp": "bms-web",
        "exp": int(time.time()) + 300,
        "realm_access": {"roles": []},
        **over,
    }
    return jwt.encode(claims, key, algorithm="RS256")


@pytest.fixture
def client(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database})
    verifier = auth.KeycloakVerifier("", ISSUER, {"bms-web", "bms-e2e"}, jwks_client=StaticJwks())
    with TestClient(main.create_app(settings, verifier=verifier)) as c:
        yield c


@pytest.fixture
def account(conn):
    sub = str(uuid.uuid4())
    conn.execute("UPDATE core.person SET idp_subject = %s WHERE id = test.id('e')", (sub,))
    conn.execute(
        "INSERT INTO core.person (tenant_id, idp_subject, full_name) VALUES (test.id('BVX'), %s, 'Chị E')", (sub,)
    )
    return sub


def hook(client, tok=None, tenant=None, role=None):
    headers = {}
    if tok:
        headers["authorization"] = f"Bearer {tok}"
    if tenant:
        headers["x-bamboo-tenant"] = tenant
    if role:
        headers["x-hasura-role"] = role
    return client.get("/auth/hasura", headers=headers)


def test_chua_chon_tenant_la_role_account(client, account):
    resp = hook(client, token(account))
    assert resp.status_code == 200
    body = resp.json()
    assert body["X-Hasura-Role"] == "account" and body["X-Hasura-Account-Id"] == account
    assert "X-Hasura-User-Id" not in body


def test_chon_tenant_lay_dung_person(client, conn, account):
    i = ids(conn, "TDX", "BVX", "e")
    body = hook(client, token(account), tenant=i["TDX"]).json()
    assert body == {**body, "X-Hasura-Role": "user", "X-Hasura-User-Id": i["e"], "X-Hasura-Tenant-Id": i["TDX"]}
    bvx = hook(client, token(account), tenant=i["BVX"]).json()
    assert bvx["X-Hasura-User-Id"] not in (i["e"], None), "mỗi tenant một person.id"


def test_khong_thuoc_tenant(client, conn, account):
    i = ids(conn, "CTY")
    assert hook(client, token(account), tenant=i["CTY"]).status_code == 401
    assert hook(client, token(account), tenant="khong-phai-uuid").status_code == 401


@pytest.mark.parametrize(
    "bad",
    [
        {"key": OTHER_KEY},
        {"iss": "http://evil/realms/bms"},
        {"azp": "client-la"},
        {"typ": "Refresh"},
        {"exp": int(time.time()) - 10},
    ],
)
def test_token_khong_hop_le(client, account, bad):
    key = bad.pop("key", KEY)
    assert hook(client, token(account, key=key, **bad)).status_code == 401


def test_thieu_token(client):
    assert hook(client).status_code == 401


def test_platform_admin(client, conn, account):
    i = ids(conn, "TDX")
    assert hook(client, token(account), tenant=i["TDX"], role="platform_admin").status_code == 401
    admin = token(account, realm_access={"roles": ["platform_admin"]})
    assert hook(client, admin, tenant=i["TDX"], role="platform_admin").json()["X-Hasura-Role"] == "platform_admin"
    assert hook(client, admin, tenant=i["TDX"]).json()["X-Hasura-Role"] == "user", "không xin thì là user"


def test_my_tenants(client, conn, account):
    payload = {
        "action": {"name": "my_tenants"},
        "input": {},
        "session_variables": {"x-hasura-role": "account", "x-hasura-account-id": account},
    }
    resp = client.post("/actions/my_tenants", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})
    assert [t["tenant_code"] for t in resp.json()] == ["BVX", "TDX"]


def test_cong_api_kiem_token(client):
    resp = client.get("/auth/gateway")
    assert resp.status_code == 401 and resp.headers["www-authenticate"] == "Bearer"
    resp = client.get("/auth/gateway", headers={"Authorization": "Bearer khong-phai-jwt"})
    assert resp.status_code == 401 and "invalid_token" in resp.headers["www-authenticate"]
    resp = client.get("/auth/gateway", headers={"Authorization": f"Bearer {token('u1', key=OTHER_KEY)}"})
    assert resp.status_code == 401, "chữ ký sai"
    resp = client.get("/auth/gateway", headers={"Authorization": f"Bearer {token('u1', exp=int(time.time()) - 10)}"})
    assert resp.status_code == 401, "token hết hạn"
    resp = client.get("/auth/gateway", headers={"Authorization": f"Bearer {token('u1')}"})
    assert resp.status_code == 200 and resp.headers["x-user-sub"] == "u1"
