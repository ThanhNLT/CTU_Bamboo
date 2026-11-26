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

"""Công ty tạo qua trang đăng ký dùng được ngay mọi công cụ đã chọn: tài khoản vào được công ty, Action của mô-đun đã
bật không bị chặn, vai trò dựng sẵn có đủ quyền, quy trình cần duyệt có người duyệt (migration 060)."""

from urllib.parse import urlparse, urlunparse

import psycopg
import pytest
from fastapi.testclient import TestClient
from test_khoi_tao import OWNER, empty_db, env, finish_unsigned, issue_code, pki, register  # noqa: F401

from app import config, main, modules
from app.common import ActionError
from conftest import ROOT, SETTINGS

ALL_TOOLS = [m.code for m in modules.CATALOG if not m.external]
MEMBERS = [
    {"full_name": "Lê Văn Lộc", "username": "loc.le", "role": "MANAGER", "unit": "kd"},
    {"full_name": "Trần Gia Huy", "username": "huy.tran", "role": "STAFF", "unit": "kd"},
    {"full_name": "Phạm Thu Hà", "username": "ha.pham", "role": "ACCOUNTANT"},
    {"full_name": "Vũ Minh Quân", "username": "quan.vu", "role": "ADMIN"},
]


def _demo_tenants(db: str) -> None:
    """Máy đã có công ty demo (không mã số thuế), như stack chạy SEED_DEMO."""
    with psycopg.connect(db) as conn, conn.transaction():
        for code, name in (("TDX", "Tập đoàn X"), ("BVX", "Bệnh viện X")):
            conn.execute("SELECT * FROM core.create_tenant(%s, %s)", (code, name))


def _post_action(client, name: str, session: dict, args: dict | None = None):
    payload = {"action": {"name": name}, "input": args or {}, "session_variables": session}
    return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})


@pytest.fixture
def company(env):  # noqa: F811
    db = env["db"]
    issue_code(db)
    _demo_tenants(db)
    settings = config.Settings(
        **{**SETTINGS.__dict__, "database_url": db, "sleeper_url": "", "setup_open_signup": True}
    )
    with TestClient(main.create_app(settings, ctx=env["ctx"])) as opened:
        r = register(
            opened,
            owner=OWNER | {"full_name": "Nguyễn Văn Thành", "username": "thanh.nguyen", "email": "thanh@minhanh.vn"},
            size_band="11-50",
            flow="detailed",
            units=[{"key": "kd", "name": "Phòng Kinh doanh", "type": "PHONG"}],
            members=MEMBERS,
            modules=ALL_TOOLS,
        )
        r = finish_unsigned(opened, r)
        assert r.status_code == 200, r.text
        yield {"client": opened, "db": db, "users": env["users"], "result": r.json()}


def _people(db: str, code: str) -> dict[str, dict]:
    with psycopg.connect(db) as conn:
        rows = conn.execute(
            """SELECT p.idp_subject, p.id, p.tenant_id, a.position_id
               FROM core.person p JOIN core.tenant t ON t.id = p.tenant_id
               JOIN core.assignment a ON a.person_id = p.id
               WHERE t.code = %s""",
            (code,),
        ).fetchall()
    return {
        sub.removeprefix("sub-"): {"person": str(pid), "tenant": str(tid), "position": pos}
        for sub, pid, tid, pos in rows
    }


def test_moi_tai_khoan_vao_duoc_cong_ty_moi(company):
    client, result = company["client"], company["result"]
    assert set(result["modules"]) == set(ALL_TOOLS)
    for account in result["accounts"]:
        sub = f"sub-{account['username']}"
        r = _post_action(client, "my_tenants", {"x-hasura-role": "account", "x-hasura-account-id": sub})
        assert r.status_code == 200, r.text
        assert [t["tenant_code"] for t in r.json()] == [result["tenant_code"]], account["username"]


def test_action_cua_moi_cong_cu_da_bat_khong_bi_chan(company):
    db, code = company["db"], company["result"]["tenant_code"]
    people = _people(db, code)
    with psycopg.connect(db) as conn:
        for username in ("thanh.nguyen", "huy.tran"):
            session = {"x-hasura-tenant-id": people[username]["tenant"], "x-hasura-user-id": people[username]["person"]}
            for action, module in modules.ACTION_MODULE.items():
                try:
                    modules.require_action(conn, session, action)
                except ActionError as exc:
                    pytest.fail(f"{username}: Action {action} của mô-đun {module} bị chặn: {exc.message}")


def _permissions(db: str, person: str) -> set[str]:
    with psycopg.connect(db) as conn:
        return {
            r[0]
            for r in conn.execute(
                "SELECT permission_code FROM core.v_permission_grant WHERE person_id = %s AND valid_period @> now()",
                (person,),
            )
        }


def test_vai_tro_dung_san_du_quyen(company):
    db, code = company["db"], company["result"]["tenant_code"]
    people = _people(db, code)
    with psycopg.connect(db) as conn:
        every = {r[0] for r in conn.execute("SELECT code FROM core.permission")}
    assert _permissions(db, people["thanh.nguyen"]["person"]) == every
    assert _permissions(db, people["quan.vu"]["person"]) == every
    assert {"proc.purchase_request.create", "kb.document.create"} <= _permissions(db, people["huy.tran"]["person"])
    assert {"wf.approval.act", "hr.onboarding.create", "pm.project.manage", "ic.order.confirm", "cal.unit.manage"} <= (
        _permissions(db, people["loc.le"]["person"])
    )
    assert {"audit.read", "data.lakehouse.read", "ops.group.read"} <= _permissions(db, people["ha.pham"]["person"])


def test_quy_trinh_can_duyet_co_nguoi_duyet(company):
    db, code = company["db"], company["result"]["tenant_code"]
    people = _people(db, code)
    with psycopg.connect(db) as conn:
        for process in ("PURCHASE_REQUEST", "ONBOARDING", "KB_DOCUMENT"):
            chain = conn.execute(
                "SELECT position_id FROM wf.resolve_approval_chain(%s, %s, %s, 0, NULL)",
                (people["huy.tran"]["tenant"], process, people["huy.tran"]["position"]),
            ).fetchall()
            assert chain and chain[0][0] == people["loc.le"]["position"], process


def test_provision_chay_lai_khong_doi_gi(company):
    db, code = company["db"], company["result"]["tenant_code"]
    tenant = _people(db, code)["thanh.nguyen"]["tenant"]
    count = "SELECT (SELECT count(*) FROM core.role_permission), (SELECT count(*) FROM wf.approval_rule)"
    with psycopg.connect(db) as conn, conn.transaction():
        before = conn.execute(count).fetchone()
        conn.execute("SELECT core.provision_tenant(%s)", (tenant,))
        assert conn.execute(count).fetchone() == before
    with psycopg.connect(db) as conn:
        demo = conn.execute(
            """SELECT count(*) FROM core.role_permission rp JOIN core.tenant t ON t.id = rp.tenant_id
               WHERE t.code = 'TDX' AND rp.permission_code = 'kb.document.create'"""
        ).fetchone()[0]
    assert demo == 0


def _as_app_role(db: str) -> str:
    """CSDL như máy chủ thật: vai trò ứng dụng theo db/roles/grants.sql, PUBLIC không có quyền TEMPORARY."""
    with psycopg.connect(db, autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname = 'bamboo_actions'").fetchone():
            pytest.skip("chưa có vai trò bamboo_actions (db/roles/roles.sql)")
        conn.execute((ROOT / "db/roles/grants.sql").read_text(encoding="utf-8"))
        conn.execute(f'REVOKE TEMPORARY ON DATABASE "{urlparse(db).path.lstrip("/")}" FROM PUBLIC')
    url = urlparse(db)
    return urlunparse(url._replace(netloc=f"bamboo_actions:actions-db-dev@{url.hostname}:{url.port or 5432}"))


def test_dang_ky_bang_vai_tro_ung_dung(env):  # noqa: F811
    """Lỗi thật trên máy chủ: trigger kênh chat tạo bảng tạm, vai trò ứng dụng không có quyền TEMPORARY (migration 061)."""
    db = env["db"]
    issue_code(db)
    _demo_tenants(db)
    settings = config.Settings(
        **{**SETTINGS.__dict__, "database_url": _as_app_role(db), "sleeper_url": "", "setup_open_signup": True}
    )
    with TestClient(main.create_app(settings, ctx=env["ctx"])) as opened:
        r = register(
            opened,
            company={"legal_name": "Seongwan Company", "industry": "Thương mại"},
            size_band="11-50",
            flow="detailed",
            units=[{"key": "kd", "name": "Phòng Kinh doanh", "type": "PHONG"}],
            members=MEMBERS,
            modules=ALL_TOOLS,
        )
        r = finish_unsigned(opened, r)
        assert r.status_code == 200, r.text
        assert r.json()["tenant_code"] == "SEONGWANCOMPANY"
