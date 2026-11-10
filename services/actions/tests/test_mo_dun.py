# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app import config, hasura_metadata, main, modules
from conftest import ROOT, SETTINGS, ids, pr


@pytest.fixture
def client(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database, "sleeper_url": ""})
    with TestClient(main.create_app(settings)) as c:
        yield c


@pytest.fixture
def restore(conn):
    """Trả trạng thái mô-đun về như trước khi chạy thử (các bài khác cần mọi mô-đun đang bật)."""
    installed = [r["module"] for r in conn.execute("SELECT module FROM core.module_install")]
    enabled = conn.execute("SELECT tenant_id, module FROM core.tenant_module").fetchall()
    yield
    conn.execute("DELETE FROM core.tenant_module")
    conn.execute("DELETE FROM core.module_install")
    conn.execute("INSERT INTO core.module_install (module) SELECT unnest(%s::text[])", (installed,))
    for row in enabled:
        conn.execute(
            "INSERT INTO core.tenant_module (tenant_id, module) VALUES (%s, %s)", (row["tenant_id"], row["module"])
        )


@pytest.fixture
def admin(conn, org, restore):
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
           SELECT test.id('TDX'), id, test.id(%(p)s), 'TENANT' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    return ids(conn, org("gd"), org("nv"), "TDX") | {"k": org}


def call(client, name, args, person, tenant, role="user"):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": role, "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})


def state(body: dict) -> dict:
    return {m["code"]: (m["installed"], m["enabled"]) for m in body["modules"]}


def test_moi_action_thuoc_loi_hoac_mot_mo_dun():
    metadata = json.loads((ROOT / "infra/platform/hasura/metadata.json").read_text(encoding="utf-8"))
    names = {a["name"] for a in metadata["actions"]}
    owned = [a for m in modules.CATALOG for a in m.actions]
    assert len(owned) == len(set(owned)), "một Action chỉ thuộc một mô-đun"
    assert not set(owned) & modules.CORE_ACTIONS
    assert names == set(owned) | modules.CORE_ACTIONS, "Action mới phải khai vào lõi hoặc một mô-đun"
    assert set(main.HANDLERS) == names


def test_phu_thuoc_hop_le_khong_vong():
    for m in modules.CATALOG:
        assert set(m.depends) <= set(modules.BY_CODE), m.code
        assert m.code not in modules.dependents(m.code)
        chain = modules.requires(m.code)
        assert chain[-1] == m.code and len(chain) == len(set(chain))
    assert set(hasura_metadata.MODULE_TABLES.values()) <= set(modules.BY_CODE)
    assert modules.requires("knowledge")[:-1] == ["approval", "files", "search"]
    assert modules.dependents("approval") == {"procurement", "ic", "hr", "knowledge"}


def test_action_cua_mo_dun_tat_bi_chan(client, conn, admin):
    gd, tdx = admin[admin["k"]("gd")], admin["TDX"]
    conn.execute("DELETE FROM core.tenant_module WHERE tenant_id = %s AND module = 'ledger'", (tdx,))
    r = call(client, "ledger_overview", {}, gd, tdx)
    assert r.status_code == 403 and r.json()["extensions"]["code"] == "module-disabled"
    assert "Sổ cái" in r.json()["message"]
    assert call(client, "modules", {}, gd, tdx).status_code == 200


def test_bat_can_quyen_va_keo_theo_phu_thuoc(client, conn, admin):
    gd, nv, tdx = admin[admin["k"]("gd")], admin[admin["k"]("nv")], admin["TDX"]
    for code in ("knowledge", "ai", "search", "files"):
        assert call(client, "module_disable", {"code": code}, gd, tdx).status_code == 200, code
    r = call(client, "module_enable", {"code": "knowledge"}, nv, tdx)
    assert r.status_code == 403 and r.json()["extensions"]["code"] == "forbidden"

    r = call(client, "module_enable", {"code": "knowledge"}, gd, tdx)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["changed"] == ["files", "search", "knowledge"]
    assert state(body)["knowledge"] == (True, True) and state(body)["search"] == (True, True)
    assert body["can_manage"] and not body["can_install"]
    assert call(client, "module_enable", {"code": "knowledge"}, gd, tdx).json()["changed"] == []


def test_chua_cai_tren_may_thi_quan_tri_cong_ty_khong_bat_duoc(client, conn, admin):
    gd, tdx = admin[admin["k"]("gd")], admin["TDX"]
    conn.execute("DELETE FROM core.tenant_module WHERE module = 'ledger'")
    conn.execute("DELETE FROM core.module_install WHERE module = 'ledger'")
    r = call(client, "module_enable", {"code": "ledger"}, gd, tdx)
    assert r.status_code == 409 and r.json()["extensions"]["code"] == "module-not-installed"
    r = call(client, "module_enable", {"code": "ledger"}, gd, tdx, role="platform_admin")
    assert r.status_code == 200, r.text
    assert state(r.json())["ledger"] == (True, True)


def test_khong_tat_khi_mo_dun_khac_dua_vao(client, conn, admin):
    gd, tdx = admin[admin["k"]("gd")], admin["TDX"]
    r = call(client, "module_disable", {"code": "procurement"}, gd, tdx)
    assert r.status_code == 409 and r.json()["extensions"]["code"] == "module-in-use"
    assert "Đơn hàng nội bộ" in r.json()["message"]


def test_khong_tat_khi_con_chung_tu_do(client, conn, admin):
    gd, tdx = admin[admin["k"]("gd")], admin["TDX"]
    pr(conn, f"MD_{uuid.uuid4().hex[:6]}", "c", "P_NV_MH_DT", 1_000_000)
    conn.execute("DELETE FROM core.tenant_module WHERE tenant_id = %s AND module = 'ic'", (tdx,))
    r = call(client, "module_disable", {"code": "procurement"}, gd, tdx)
    assert r.status_code == 409 and r.json()["extensions"]["code"] == "module-busy"
    assert "đề nghị mua sắm chờ duyệt" in r.json()["message"]
    assert conn.execute("SELECT core.module_enabled(%s, 'procurement') AS on", (tdx,)).fetchone()["on"]


def test_go_khoi_may_chi_khi_khong_cong_ty_nao_bat(client, conn, admin):
    gd, tdx = admin[admin["k"]("gd")], admin["TDX"]
    r = call(client, "module_uninstall", {"code": "ledger"}, gd, tdx)
    assert r.status_code == 403
    r = call(client, "module_uninstall", {"code": "ledger"}, gd, tdx, role="platform_admin")
    assert r.status_code == 409 and r.json()["extensions"]["code"] == "module-in-use"
    conn.execute("DELETE FROM core.tenant_module WHERE module = 'ledger'")
    r = call(client, "module_uninstall", {"code": "ledger"}, gd, tdx, role="platform_admin")
    assert r.status_code == 200 and state(r.json())["ledger"] == (False, False)


def test_container_can_chay_theo_mo_dun_da_cai(client, conn, admin):
    conn.execute("DELETE FROM core.tenant_module WHERE module IN ('ai', 'data')")
    conn.execute("DELETE FROM core.module_install WHERE module IN ('ai', 'data')")
    desired = client.get("/modules/services").json()
    assert "ollama-core" in desired["stop"] and "kafka" in desired["stop"]
    assert "flowable" in desired["run"] and "meilisearch" in desired["run"]
    assert set(desired["run"]) | set(desired["stop"]) == set(modules.MANAGED_SERVICES)
    conn.execute("DELETE FROM core.tenant_module WHERE module IN ('ic', 'procurement')")
    conn.execute("DELETE FROM core.module_install WHERE module IN ('ic', 'procurement')")
    assert "flowable" in client.get("/modules/services").json()["run"]


def test_sleeper_quan_ly_dung_container_cua_mo_dun():
    import yaml

    root = yaml.safe_load((ROOT / "compose.yaml").read_text(encoding="utf-8"))
    services = {}
    for path in root["include"]:
        services |= yaml.safe_load((ROOT / path).read_text(encoding="utf-8"))["services"]
    env = services["sleeper"]["environment"]
    assert sorted(env["SLEEPER_MANAGED"].split(",")) == sorted(modules.MANAGED_SERVICES)
    assert set(modules.MANAGED_SERVICES) <= set(services)


def test_du_lieu_demo_bat_du_moi_mo_dun():
    import re

    text = (ROOT / "services/seed/app/seed.py").read_text(encoding="utf-8")
    demo = re.search(r"DEMO_MODULES = \(([^)]*)\)", text).group(1)
    assert sorted(re.findall(r'"([a-z_]+)"', demo)) == sorted(modules.BY_CODE)
    migration = (ROOT / "db/migrations/bms/042_mo_dun.sql").read_text(encoding="utf-8")
    upgrade = re.findall(r"'([a-z_]+)'", re.search(r"unnest\(ARRAY\[([^\]]*)\]\)", migration).group(1))
    for later in sorted((ROOT / "db/migrations/bms").glob("*.sql")):
        upgrade += re.findall(r"SELECT '([a-z_]+)', 'migration \d+'", later.read_text(encoding="utf-8"))
    assert sorted(upgrade) == sorted(modules.BY_CODE)
