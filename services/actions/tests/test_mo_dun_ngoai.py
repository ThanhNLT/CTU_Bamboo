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

import importlib.util
import threading
import uuid
from http.server import ThreadingHTTPServer

import httpx
import pytest

from app import ext
from conftest import ROOT, SETTINGS, ids

CODE = "x_nhac_viec"


def load_sample():
    spec = importlib.util.spec_from_file_location("mo_dun_mau", ROOT / "examples/mo-dun-mau/app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def sample(actions_server):
    """Mô-đun mẫu chạy thật trên một cổng, gọi ngược actions qua /ext-api."""
    app = load_sample()
    app.BAMBOO_API = actions_server
    server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield app, f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture
def admin(conn, org):
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
    yield ids(conn, org("gd"), org("nv"), "TDX", "BVX") | {"k": org}
    conn.execute("DELETE FROM core.tenant_module WHERE module LIKE 'x\\_%'")
    conn.execute("DELETE FROM core.module_install WHERE module LIKE 'x\\_%'")


def call(base, name, args, person, tenant, role="user"):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": role, "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return httpx.post(
        f"{base}/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret}, timeout=30
    )


def manifest(base_url: str, **extra) -> dict:
    return {
        "code": CODE,
        "name": "Nhắc việc",
        "base_url": base_url,
        "health_path": "/healthz",
        "scopes": ["people.read", "notify.send"],
        "menu": [{"label": "Nhắc việc", "path": "/"}],
        **extra,
    }


def test_manifest_sai_bi_tu_choi():
    with pytest.raises(Exception, match="x_"):
        ext.parse_manifest({"code": "kho", "name": "Kho", "base_url": "http://kho"})
    with pytest.raises(Exception, match="scopes"):
        ext.parse_manifest({"code": "x_kho", "name": "Kho", "base_url": "http://kho", "scopes": ["admin"]})
    with pytest.raises(Exception, match="depends"):
        ext.parse_manifest({"code": "x_kho", "name": "Kho", "base_url": "http://kho", "depends": ["x_khac"]})
    with pytest.raises(Exception, match="base_url"):
        ext.parse_manifest({"code": "x_kho", "name": "Kho", "base_url": "ftp://kho"})
    m = ext.parse_manifest({"code": "x_kho", "name": "Kho", "base_url": "http://kho:8080/"})
    assert m["base_url"] == "http://kho:8080" and m["menu"] == [{"label": "Kho", "path": "/"}]


def test_phien_khung_nhung_ky_va_het_han():
    token = ext.issue_session("bi-mat", CODE, "t1", "p1")
    assert ext.read_session("bi-mat", token, CODE)["p"] == "p1"
    assert ext.read_session("bi-mat", token, "x_khac") is None
    assert ext.read_session("bi-khac", token, CODE) is None
    assert ext.read_session("bi-mat", token[:-2] + "AA", CODE) is None
    assert ext.read_session("bi-mat", ext.issue_session("bi-mat", CODE, "t1", "p1", ttl=-1), CODE) is None


def test_dang_ky_bat_mo_giao_dien_va_goi_nguoc(actions_server, sample, admin, conn):
    app, url = sample
    gd, nv, tdx = admin[admin["k"]("gd")], admin[admin["k"]("nv")], admin["TDX"]

    assert (
        call(actions_server, "ext_register", {"manifest": manifest(url)}, gd, tdx).json()["extensions"]["code"]
        == "forbidden"
    )
    r = call(actions_server, "ext_register", {"manifest": manifest(url)}, gd, tdx, role="platform_admin")
    assert r.status_code == 200, r.text
    key = r.json()["api_key"]
    assert key.startswith("bmk_") and r.json()["reachable"] is True
    app.MODULE_KEY = key

    assert call(actions_server, "ext_launch", {"code": CODE}, nv, tdx).json()["extensions"]["code"] == "module-disabled"
    r = call(actions_server, "modules", {}, gd, tdx)
    info = next(m for m in r.json()["modules"] if m["code"] == CODE)
    assert (
        info["external"]
        and info["scopes"] == ["notify.send", "people.read"]
        and info["menu"][0]["label"] == "Nhắc việc"
    )
    assert call(actions_server, "module_enable", {"code": CODE}, gd, tdx).status_code == 200

    launch = call(actions_server, "ext_launch", {"code": CODE}, nv, tdx).json()
    page = httpx.get(f"{actions_server}/ext/{launch['path']}")
    assert page.status_code == 200, page.text
    assert "Xin chào" in page.text and "<option" in page.text
    assert page.headers["content-security-policy"].startswith("sandbox allow-scripts")
    assert page.headers["access-control-allow-origin"] == "*" and page.headers["referrer-policy"] == "no-referrer"

    base = launch["path"].rsplit("/", 1)[0]
    r = httpx.post(f"{actions_server}/ext/{base}/api/nhac", json={"person_id": gd, "title": "Nộp báo cáo"})
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    note = conn.execute(
        "SELECT kind, entity_type, title FROM collab.notification WHERE recipient_id = %s ORDER BY created_at DESC LIMIT 1",
        (gd,),
    ).fetchone()
    assert note == {"kind": "EXTERNAL", "entity_type": CODE, "title": "[Nhắc việc] Nộp báo cáo"}
    assert httpx.options(f"{actions_server}/ext/{base}/api/nhac").status_code == 204

    assert httpx.get(url + "/", headers={"X-Bamboo-Person": nv, "X-Bamboo-Tenant": tdx}).status_code == 403
    assert httpx.get(f"{actions_server}/ext/{CODE}/s/gia.mao/").status_code == 403

    api = f"{actions_server}/ext-api/v1"
    auth = {"Authorization": f"Bearer {key}", "X-Bamboo-Tenant": tdx}
    assert httpx.get(f"{api}/people", headers={**auth, "Authorization": "Bearer sai"}).status_code == 401
    assert httpx.get(f"{api}/org-units", headers=auth).status_code == 403
    assert httpx.get(f"{api}/people", headers={**auth, "X-Bamboo-Tenant": admin["BVX"]}).status_code == 403
    assert any(p["id"] == gd for p in httpx.get(f"{api}/people", headers=auth).json())

    assert call(actions_server, "module_disable", {"code": CODE}, gd, tdx).status_code == 200
    assert httpx.get(f"{actions_server}/ext/{launch['path']}").status_code == 403


def test_phien_ban_moi_xin_them_pham_vi_thi_tat_de_dong_y_lai(actions_server, sample, admin, conn):
    _app, url = sample
    gd, tdx = admin[admin["k"]("gd")], admin["TDX"]
    key = call(actions_server, "ext_register", {"manifest": manifest(url)}, gd, tdx, role="platform_admin").json()[
        "api_key"
    ]
    assert call(actions_server, "module_enable", {"code": CODE}, gd, tdx).status_code == 200
    r = call(actions_server, "ext_register", {"manifest": manifest(url, version="1.1")}, gd, tdx, role="platform_admin")
    assert r.json()["updated"] and r.json()["api_key"] is None
    assert conn.execute("SELECT core.module_enabled(%s, %s) AS on", (tdx, CODE)).fetchone()["on"]
    wider = manifest(url, scopes=["people.read", "notify.send", "org.read"], depends=["files"])
    r = call(actions_server, "ext_register", {"manifest": wider}, gd, tdx, role="platform_admin")
    assert "tắt ở 1 công ty" in r.json()["message"], r.text
    assert not conn.execute("SELECT core.module_enabled(%s, %s) AS on", (tdx, CODE)).fetchone()["on"]
    assert call(actions_server, "module_enable", {"code": CODE}, gd, tdx).status_code == 200
    r = call(actions_server, "module_disable", {"code": "files"}, gd, tdx)
    assert r.json()["extensions"]["code"] == "module-in-use" and "Nhắc việc" in r.json()["message"]

    new = call(actions_server, "ext_rotate_key", {"code": CODE}, gd, tdx, role="platform_admin").json()["api_key"]
    api = f"{actions_server}/ext-api/v1/people"
    assert httpx.get(api, headers={"Authorization": f"Bearer {key}", "X-Bamboo-Tenant": tdx}).status_code == 401
    assert httpx.get(api, headers={"Authorization": f"Bearer {new}", "X-Bamboo-Tenant": tdx}).status_code == 200

    assert call(actions_server, "module_disable", {"code": CODE}, gd, tdx).status_code == 200
    r = call(actions_server, "module_uninstall", {"code": CODE}, gd, tdx, role="platform_admin")
    assert r.status_code == 200, r.text
    assert conn.execute("SELECT count(*) AS n FROM core.external_module").fetchone()["n"] == 0


def test_cors_cua_trang_khoi_tao_khong_chan_mo_dun(monkeypatch, database):
    from fastapi.testclient import TestClient

    from app import config, main

    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database, "sleeper_url": ""})
    with TestClient(main.create_app(settings)) as c:
        pre = {
            "Origin": "null",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        }
        r = c.options(f"/ext/{CODE}/s/x.y/api/nhac", headers=pre)
        assert r.status_code == 204 and r.headers["access-control-allow-origin"] == "*"
        r = c.options("/setup/status", headers={**pre, "Origin": "http://localhost:5173"})
        assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
