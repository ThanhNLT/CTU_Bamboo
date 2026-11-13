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

import uuid

import pytest

from app import admin
from app.common import ActionError
from conftest import ids, pr

OPS = """query($t: String!, $d: Int) { ops_dashboard(tab: $t, days: $d) { tab days sla_hours data } }"""


def ops(hasura, tab: str, person: str, tenant: str, days: int = 30) -> dict:
    r = hasura(OPS, {"t": tab, "d": days}, person=person, tenant=tenant)
    assert "errors" not in r, r
    return r["data"]["ops_dashboard"]["data"]


def test_quy_trinh_ban_do_theo_quyen_xem(hasura, conn, org):
    k = org
    i = ids(conn, "TDX", "a", k("nv"), k("CTY"), k("PHONG"))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 5_000_000)
    conn.execute(
        """UPDATE wf.task SET created_at = now() - interval '3 days'
           WHERE status = 'OPEN' AND step_id IN (SELECT id FROM wf.approval_step WHERE entity_id = %s)""",
        (pr_id,),
    )
    conn.execute(
        "UPDATE core.org_unit SET province = 'Bắc Ninh', lat = 21.18, lng = 106.07 WHERE id = %s", (i[k("CTY")],)
    )
    item = conn.execute(
        """INSERT INTO mdm.item (tenant_id, code, name, uom) VALUES (%s, %s, 'Linh kiện thử', 'cái') RETURNING id""",
        (i["TDX"], f"LK-{uuid.uuid4().hex[:6]}"),
    ).fetchone()["id"]
    conn.execute(
        """INSERT INTO mfg.lot (tenant_id, lot_no, item_id, org_unit_id, quantity, uom, produced_on, status, note)
           VALUES (%s, %s, %s, %s, 10, 'cái', current_date - 2, 'ON_HOLD', 'Chờ kiểm tra')""",
        (i["TDX"], f"LOT-{k('x')}", item, i[k("PHONG")]),
    )

    data = ops(hasura, "process", i[k("nv")], i["TDX"])
    row = next(r for r in data["by_type"] if r["entity_type"] == "proc.purchase_request")
    assert row["submitted"] >= 1 and row["open"] >= 1 and row["overdue"] >= 1
    assert data["totals"]["overdue"] >= 1 and len(data["trend"]) == 30
    site = next(s for s in ops(hasura, "sites", i[k("nv")], i["TDX"])["sites"] if s["id"] == i[k("CTY")])
    assert site["status"] == "critical" and site["overdue_tasks"] == 1 and site["held_lots"] == 1
    assert any("LOT-" in a for a in site["alerts"])

    other = next(s for s in ops(hasura, "sites", i["a"], i["TDX"])["sites"] if s["id"] == i[k("CTY")])
    assert other["open_tasks"] == 0 and other["status"] == "warning"

    prod = ops(hasura, "production", i["a"], i["TDX"], days=90)
    assert any(h["lot_no"] == f"LOT-{k('x')}" for h in prod["held"])
    assert prod["totals"]["lots_on_hold"] >= 1 and len(prod["trend"]) <= 14


def test_benh_vien_chi_so_tong_hop_can_quyen(hasura, conn, org):
    k = org
    i = ids(conn, "TDX", k("gd"), k("P_GD"))
    assert ops(hasura, "hospital", i[k("gd")], i["TDX"]) == {"allowed": False, "tenants": []}

    role = conn.execute(
        "INSERT INTO core.role (tenant_id, code, name) VALUES (%s, %s, 'Điều hành') RETURNING id",
        (i["TDX"], f"DH_{uuid.uuid4().hex[:6]}"),
    ).fetchone()["id"]
    conn.execute(
        "INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (%s, %s, 'ops.group.read')",
        (i["TDX"], role),
    )
    conn.execute(
        "INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope) VALUES (%s, %s, %s, 'TENANT')",
        (i["TDX"], role, i[k("P_GD")]),
    )
    data = ops(hasura, "hospital", i[k("gd")], i["TDX"])
    assert data["allowed"] and data["scope"] == "children"
    bv = data["tenants"][0]
    assert bv["tenant"] == "Bệnh viện X" and len(bv["monthly"]) == 6
    assert {"headcount", "positions", "vacant", "pr_submitted", "open_tasks", "units"} <= bv.keys()
    assert "doc_no" not in str(bv) and "full_name" not in str(bv)


def test_chat_luong_du_lieu_va_tham_so(hasura, conn, org):
    k = org
    i = ids(conn, "TDX", k("nv"))
    data = ops(hasura, "quality", i[k("nv")], i["TDX"])
    assert {c["key"] for c in data["checks"]} >= {"person_unassigned", "position_vacant", "attachment_stuck"}
    assert data["admin"] is False and all(c["samples"] == [] for c in data["checks"])
    assert 0 <= data["score"] <= 100

    bad = hasura(OPS, {"t": "x", "d": 30}, person=i[k("nv")], tenant=i["TDX"])
    assert "không hợp lệ" in bad["errors"][0]["message"]


def test_vi_tri_co_so_khi_nhap_don_vi():
    assert admin._location({"code": "X"}) is None, "tệp nhập không có cột vị trí thì giữ vị trí cũ"
    assert admin._location({"province": " Bắc Ninh ", "lat": "21,18612", "lng": 106.07631}) == {
        "province": "Bắc Ninh",
        "lat": 21.18612,
        "lng": 106.07631,
    }
    with pytest.raises(ActionError, match="cả vĩ độ và kinh độ"):
        admin._location({"lat": 21})
    with pytest.raises(ActionError, match="±90"):
        admin._location({"lat": 121, "lng": 10})
