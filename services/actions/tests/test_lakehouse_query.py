# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

import os
import uuid
from urllib.parse import urlparse, urlunparse

import httpx
import psycopg
import pytest

from app import lakehouse_query as lq
from app import lakehouse_silver as silver
from app.common import ActionError, Context
from app.trino import Trino, TrinoError
from conftest import TEST_DB_URL, _missing, root_settings, trino_admin_password, trino_reachable

SOURCE_URL = os.environ.get("CDC_SOURCE_DATABASE_URL") or urlunparse(urlparse(TEST_DB_URL)._replace(path="/bms"))
SETTINGS = root_settings()


class AllowConn:
    def __init__(self, allowed: bool):
        self.allowed = allowed

    def execute(self, _sql, _params=None):
        return self

    def fetchone(self):
        return (self.allowed,)


def _session(tenant) -> dict:
    return {"x-hasura-user-id": str(uuid.uuid4()), "x-hasura-tenant-id": str(tenant)}


def test_nguoi_dung_trino_cua_tenant():
    tenant = uuid.uuid4()
    assert lq.tenant_user(str(tenant)) == f"t_{tenant}"
    with pytest.raises(ValueError):
        lq.tenant_user("x' OR '1'='1")


def test_khong_co_quyen_thi_chan():
    with pytest.raises(ActionError) as err:
        lq.lakehouse_datasets(AllowConn(False), _session(uuid.uuid4()), {}, Context(lakehouse=object()))
    assert err.value.status == 403


def test_chua_cau_hinh_trino():
    with pytest.raises(ActionError) as err:
        lq.lakehouse_datasets(AllowConn(True), _session(uuid.uuid4()), {}, Context())
    assert err.value.status == 503


def test_thieu_ca_trino_khong_lam_sap_actions(tmp_path):
    from app import config, main

    settings = config.Settings(
        **{**SETTINGS.__dict__, "trino_password": "x", "trino_ca_file": str(tmp_path / "khong-co.pem")}
    )
    assert main._lakehouse(settings) is None


@pytest.mark.parametrize("name", ['proc_purchase_request" --', "../bronze", "Proc", "", "a" * 64])
def test_ten_tap_du_lieu_khong_hop_le(name):
    with pytest.raises(ActionError) as err:
        lq.lakehouse_preview(AllowConn(True), _session(uuid.uuid4()), {"dataset": name}, Context(lakehouse=object()))
    assert err.value.status == 400


@pytest.fixture(scope="module")
def tenants() -> dict[str, str]:
    if not SETTINGS.trino_password or not trino_reachable(SETTINGS):
        _missing("Trino (tài khoản bms-actions)")
    try:
        with psycopg.connect(SOURCE_URL) as conn:
            rows = conn.execute("SELECT code, id::text FROM core.tenant ORDER BY code").fetchall()
    except psycopg.OperationalError:
        _missing(f"CSDL nguồn CDC ({urlparse(SOURCE_URL).path})")
    if not rows:
        pytest.skip("CSDL nguồn chưa có tenant")
    return dict(rows)


@pytest.fixture(scope="module")
def actions() -> Trino:
    return Trino(SETTINGS.trino_url, SETTINGS.trino_user, SETTINGS.trino_password, SETTINGS.trino_ca_file)


@pytest.fixture(scope="module")
def admin() -> Trino:
    return Trino(SETTINGS.trino_url, silver.ADMIN_USER, trino_admin_password(), SETTINGS.trino_ca_file)


def _count(client: Trino, sql: str, as_user: str | None = None) -> int:
    return client.query(sql, as_user=as_user, schema="silver")[1][0][0]


def test_moi_tenant_chi_thay_du_lieu_cua_minh(tenants, actions, admin):
    by_tenant = dict(
        admin.query(
            "SELECT CAST(tenant_id AS varchar), count(*) FROM proc_purchase_request GROUP BY 1", schema="silver"
        )[1]
    )
    assert by_tenant, "silver chưa có đề nghị mua sắm"
    for code, tenant in tenants.items():
        user = lq.tenant_user(tenant)
        assert _count(actions, "SELECT count(*) FROM proc_purchase_request", user) == by_tenant.get(tenant, 0), code
        others = [t for t in tenants.values() if t != tenant]
        if others:
            sql = f"SELECT count(*) FROM proc_purchase_request WHERE tenant_id = uuid '{others[0]}' OR true"
            assert _count(actions, sql, user) == by_tenant.get(tenant, 0), code
        _, rows = actions.query("SELECT DISTINCT CAST(id AS varchar) FROM core_tenant", as_user=user, schema="silver")
        assert rows == [[tenant]], code


def test_tenant_la_khong_thay_gi(tenants, actions):
    assert _count(actions, "SELECT count(*) FROM proc_purchase_request", lq.tenant_user(str(uuid.uuid4()))) == 0


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT count(*) FROM lakehouse.bronze.proc_purchase_request",
        "SELECT count(*) FROM core_permission",
        "SELECT count(*) FROM core_tenant_relation",
        "SELECT count(*) FROM system.runtime.nodes",
    ],
)
def test_nguoi_dung_tenant_khong_doc_duoc_ngoai_silver_theo_tenant(tenants, actions, sql):
    with pytest.raises(TrinoError) as err:
        actions.query(sql, as_user=lq.tenant_user(next(iter(tenants.values()))), schema="silver")
    assert err.value.name == "PERMISSION_DENIED"


def test_nguoi_dung_tenant_khong_ghi_duoc(tenants, actions):
    with pytest.raises(TrinoError) as err:
        actions.query(
            "DELETE FROM lakehouse.bronze.proc_purchase_request", as_user=lq.tenant_user(next(iter(tenants.values())))
        )
    assert err.value.name == "PERMISSION_DENIED"


@pytest.mark.parametrize("as_user", [None, silver.ADMIN_USER, "t_khong-phai-uuid"])
def test_tai_khoan_actions_khong_tu_doc_va_khong_mao_danh(tenants, actions, as_user):
    with pytest.raises(TrinoError) as err:
        actions.query("SELECT count(*) FROM silver.proc_purchase_request", as_user=as_user)
    assert err.value.name == "PERMISSION_DENIED"


def test_dang_nhap_sai_bi_tu_choi(tenants):
    wrong = Trino(SETTINGS.trino_url, SETTINGS.trino_user, SETTINGS.trino_password + "-sai", SETTINGS.trino_ca_file)
    with pytest.raises(TrinoError) as err:
        wrong.query("SELECT 1")
    assert err.value.name == "UNAUTHENTICATED"
    http_url = os.environ.get("TRINO_HTTP_URL") or f"http://{urlparse(SETTINGS.trino_url).hostname}:8080"
    resp = httpx.post(
        http_url + "/v1/statement",
        content="SELECT 1",
        auth=(SETTINGS.trino_user, SETTINGS.trino_password),
        headers={"X-Trino-User": SETTINGS.trino_user},
    )
    assert resp.status_code in (401, 403)


def test_action_xem_truoc_tap_du_lieu(tenants, actions, admin):
    tenant = tenants.get("TDX") or next(iter(tenants.values()))
    ctx = Context(lakehouse=actions)
    datasets = {d["name"]: d for d in lq.lakehouse_datasets(AllowConn(True), _session(tenant), {}, ctx)}
    assert "proc_purchase_request" in datasets and "core_permission" not in datasets
    assert datasets["proc_purchase_request"]["label"] == "Đề nghị mua sắm"
    assert {"tenant_id", "total_amount", "_changed_at"} <= {
        c["name"] for c in datasets["proc_purchase_request"]["columns"]
    }

    preview = lq.lakehouse_preview(AllowConn(True), _session(tenant), {"dataset": "proc_purchase_request"}, ctx)
    expected = _count(admin, f"SELECT count(*) FROM proc_purchase_request WHERE tenant_id = uuid '{tenant}'")
    assert preview["total_rows"] == expected
    assert 0 < len(preview["rows"]) <= lq.PREVIEW_ROWS
    assert {row["tenant_id"] for row in preview["rows"]} == {tenant}

    people = lq.lakehouse_preview(AllowConn(True), _session(tenant), {"dataset": "core_person"}, ctx)
    emails = [r["email"] for r in people["rows"] if r.get("email")]
    assert all("@" not in e or "•" in e for e in emails), "email trong bản xem trước phải được che"

    with pytest.raises(ActionError) as err:
        lq.lakehouse_preview(AllowConn(True), _session(tenant), {"dataset": "core_permission"}, ctx)
    assert err.value.status == 404
