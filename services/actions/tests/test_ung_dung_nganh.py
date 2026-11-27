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

"""Ứng dụng ngành mẫu ở Tầng 3 (examples/kho-hang, examples/khach-hang) và các API /ext-api/v1 mới (ADR #97)."""

import importlib.util
import threading
import uuid
from http.server import ThreadingHTTPServer

import httpx
import pytest

from conftest import ROOT, SETTINGS, ids


def load(folder: str):
    spec = importlib.util.spec_from_file_location(folder.replace("-", "_"), ROOT / "examples" / folder / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RECEIPTS = [
    {
        "id": "r1",
        "doc_no": "GR-2026-000001",
        "org_unit_id": "kho-1",
        "org_unit": "Phòng Mua hàng",
        "lines": [{"item_code": "MH-01", "description": "Màn hình", "uom": "cái", "quantity": 12}],
    },
    {
        "id": "r2",
        "doc_no": "GR-2026-000002",
        "org_unit_id": "kho-1",
        "org_unit": "Phòng Mua hàng",
        "lines": [{"item_code": None, "description": "Dây cáp", "uom": "cuộn", "quantity": "3.5"}],
    },
]


def test_kho_hang_nhap_tu_phieu_nhan_hang_va_xuat_kho():
    app = load("kho-hang")
    store = app.Store(":memory:")
    assert store.import_receipts("t1", RECEIPTS, "Thủ kho") == 2
    assert store.import_receipts("t1", RECEIPTS, "Thủ kho") == 0, "mỗi phiếu nhận hàng chỉ nhập một lần"
    assert store.import_receipts("t2", RECEIPTS[:1], "Thủ kho") == 1, "công ty khác có kho riêng"
    stock = {r["item_code"]: r["quantity"] for r in store.on_hand("t1")}
    assert stock == {"MH-01": 12, "Dây cáp": 3.5}, "dòng không có mã vật tư dùng mô tả làm mã"

    assert store.issue("t1", "kho-1", "MH-01", 5, "PX-1", "Thủ kho") == 7
    with pytest.raises(app.StockError, match="không đủ"):
        store.issue("t1", "kho-1", "MH-01", 8, "PX-2", "Thủ kho")
    with pytest.raises(app.StockError, match="lớn hơn 0"):
        store.issue("t1", "kho-1", "MH-01", 0, "PX-3", "Thủ kho")
    with pytest.raises(app.StockError, match="không đủ"):
        store.issue("t1", "kho-khac", "MH-01", 1, "PX-4", "Thủ kho")
    assert [m["source"] for m in store.history("t1")][:1] == ["ISSUE"]


def test_khach_hang_co_hoi_theo_giai_doan():
    app = load("khach-hang")
    store = app.Store(":memory:")
    cid = store.add_customer("t1", "Công ty Viễn thông Y", "0101111111")
    with pytest.raises(app.CrmError, match="Đã có"):
        store.add_customer("t1", "Công ty Viễn thông Y")
    assert store.add_customer("t2", "Công ty Viễn thông Y"), "công ty khác có danh sách riêng"
    owner = {"id": "p1", "full_name": "Phan Văn Nam"}
    oid = store.add_opportunity("t1", cid, "500 điện thoại cho nhân viên", 1_500_000_000, owner)
    with pytest.raises(app.CrmError, match="Không có khách hàng"):
        store.add_opportunity("t2", cid, "x", 1, owner)

    assert store.move("t1", oid, "PROPOSAL")["stage"] == "PROPOSAL"
    assert store.move("t1", oid, "WON")["owner_id"] == "p1"
    with pytest.raises(app.CrmError, match="đã đóng"):
        store.move("t1", oid, "NEW")
    with pytest.raises(app.CrmError, match="không hợp lệ"):
        store.move("t1", oid, "XONG")
    pipe = store.pipeline("t1")
    assert pipe["WON"] == {"count": 1, "value": 1_500_000_000} and pipe["NEW"]["count"] == 0


@pytest.fixture
def module_admin(conn, org):
    role = f"QT_{uuid.uuid4().hex[:8]}"
    params = {"r": role, "p": org("P_GD")}
    conn.execute(
        "INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %(r)s, 'Quản trị mô-đun')", params
    )
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, 'core.module.manage' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), id, test.id(%(p)s), 'TENANT' FROM core.role
           WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    yield ids(conn, org("gd"), org("nv"), "TDX") | {"k": org}
    conn.execute("DELETE FROM core.tenant_module WHERE module = 'x_kho_hang'")
    conn.execute("DELETE FROM core.module_install WHERE module = 'x_kho_hang'")


@pytest.fixture
def kho(actions_server, tmp_path):
    app = load("kho-hang")
    app.BAMBOO_API = actions_server
    app.STORE = app.Store(str(tmp_path / "kho.db"))
    server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield app, f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def call(base, name, args, person, tenant, role="user"):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": role, "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return httpx.post(
        f"{base}/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret}, timeout=30
    )


def test_kho_hang_cam_vao_bamboo(actions_server, kho, module_admin, conn):
    app, url = kho
    gd, nv, tdx = module_admin[module_admin["k"]("gd")], module_admin[module_admin["k"]("nv")], module_admin["TDX"]
    manifest = {
        "code": "x_kho_hang",
        "name": "Kho hàng",
        "base_url": url,
        "health_path": "/healthz",
        "depends": ["procurement"],
        "scopes": ["org.read", "people.read", "notify.send", "items.read", "receipts.read"],
        "menu": [{"label": "Kho hàng", "path": "/"}],
    }
    r = call(actions_server, "ext_register", {"manifest": manifest}, gd, tdx, role="platform_admin")
    assert r.status_code == 200, r.text
    app.MODULE_KEY = key = r.json()["api_key"]
    assert call(actions_server, "module_enable", {"code": "x_kho_hang"}, gd, tdx).status_code == 200

    api = f"{actions_server}/ext-api/v1"
    auth = {"Authorization": f"Bearer {key}", "X-Bamboo-Tenant": tdx}
    assert httpx.get(f"{api}/partners", headers=auth).status_code == 403, "chưa khai partners.read"
    items = httpx.get(f"{api}/items", headers=auth)
    assert items.status_code == 200 and isinstance(items.json(), list)
    receipts = httpx.get(f"{api}/goods-receipts", headers=auth)
    assert receipts.status_code == 200, receipts.text
    assert all({"doc_no", "org_unit_id", "lines"} <= set(g) for g in receipts.json())
    assert httpx.get(f"{api}/goods-receipts", params={"since": "hôm qua"}, headers=auth).status_code == 400

    launch = call(actions_server, "ext_launch", {"code": "x_kho_hang"}, nv, tdx).json()
    page = httpx.get(f"{actions_server}/ext/{launch['path']}")
    assert page.status_code == 200 and "Tồn kho" in page.text, page.text
    base = launch["path"].rsplit("/", 1)[0]
    first = httpx.post(f"{actions_server}/ext/{base}/api/nhap", json={})
    assert first.status_code == 200, first.text
    assert first.json()["imported"] == len(receipts.json())
    assert httpx.post(f"{actions_server}/ext/{base}/api/nhap", json={}).json() == {"imported": 0}
