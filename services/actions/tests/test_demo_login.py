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

import json
import os
import pathlib
import time

import httpx
import pytest

from bamboo_common import tls

pytestmark = pytest.mark.skipif(os.environ.get("DEMO_STACK") != "1", reason="cần DEMO_STACK=1 (make test-auth)")

ROOT = pathlib.Path(__file__).resolve().parents[3]
TOKEN_URL = os.environ.get("KEYCLOAK_TOKEN_URL") or (
    os.environ.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080") + "/realms/bms/protocol/openid-connect/token"
)
GRAPHQL = os.environ.get("HASURA_URL", "http://hasura:8080") + "/v1/graphql"
PASSWORD = os.environ.get("DEMO_PASSWORD", "demo-password")
USERS = json.loads((ROOT / "infra/platform/keycloak/realm/bms-realm.json").read_text(encoding="utf-8"))["users"]


@pytest.fixture(scope="module", autouse=True)
def keycloak_ready():
    deadline = time.monotonic() + float(os.environ.get("WAIT_FOR_SERVICES", "180"))
    while True:
        try:
            if "access_token" in login(USERS[0]["username"]):
                return
        except httpx.HTTPError:
            pass
        if time.monotonic() > deadline:
            pytest.fail("Keycloak chưa sẵn sàng")
        time.sleep(3)


def login(username: str) -> dict:
    return httpx.post(
        TOKEN_URL,
        verify=tls.verify(TOKEN_URL),
        data={"grant_type": "password", "client_id": "bms-e2e", "username": username, "password": PASSWORD},
    ).json()


def gql(token: str, query: str, tenant: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if tenant:
        headers["x-bamboo-tenant"] = tenant
    return httpx.post(GRAPHQL, json={"query": query}, headers=headers, verify=tls.verify(GRAPHQL)).json()


@pytest.mark.parametrize("user", [u for u in USERS if not u["requiredActions"]], ids=lambda u: u["username"])
def test_dang_nhap_va_chon_tenant(user):
    token = login(user["username"])["access_token"]
    tenants = gql(token, "{ my_tenants { tenant_id tenant_code full_name } }")["data"]["my_tenants"]
    assert tenants, user["username"]
    for t in tenants:
        assert t["full_name"].endswith(user["firstName"])
        me = gql(token, "{ wf_v_inbox { task_id } core_tenant { code } }", t["tenant_id"])
        assert "errors" not in me, me
        assert [x["code"] for x in me["data"]["core_tenant"]] == [t["tenant_code"]]


def test_admin_bat_buoc_otp():
    assert login("admin").get("error_description") == "Account is not fully set up"


def test_kiem_nhiem_hai_tenant_va_cach_ly():
    token = login("kiemnhiem")["access_token"]
    codes = {
        t["tenant_code"]: t["tenant_id"]
        for t in gql(token, "{ my_tenants { tenant_id tenant_code } }")["data"]["my_tenants"]
    }
    assert set(codes) == {"TDX", "BVX"}
    tgd = login("tgd")["access_token"]
    assert (
        gql(tgd, "{ my_tenants { tenant_code } }", codes["BVX"])["errors"][0]["extensions"]["code"] == "access-denied"
    )


def test_hop_viec_tgd_co_de_nghi_cho_duyet():
    token = login("tgd")["access_token"]
    tdx = gql(token, "{ my_tenants { tenant_id } }")["data"]["my_tenants"][0]["tenant_id"]
    titles = [
        x["purchase_request"]["title"]
        for x in gql(token, "{ wf_v_inbox { purchase_request { title } } }", tdx)["data"]["wf_v_inbox"]
    ]
    assert "Máy chủ cho nền tảng DX-OS" in titles
