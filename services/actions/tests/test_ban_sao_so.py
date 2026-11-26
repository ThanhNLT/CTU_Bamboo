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

import uuid

import pytest

from conftest import ids

ENTITIES = (
    """query { iot_entity { code state type_model { kind attributes } incidents { id code acknowledged_at } } }"""
)
ACK = """mutation($id: uuid!, $n: String!) { iot_acknowledge(id: $id, note: $n) { id acknowledged_at } }"""
PINS = """query { kpi_pin { kpi_key position } }"""
SAVE = """mutation($p: [kpi_pin_insert_input!]!) {
  delete_kpi_pin(where: {}) { affected_rows } insert_kpi_pin(objects: $p) { affected_rows } }"""


@pytest.fixture
def twin(conn):
    sfx = uuid.uuid4().hex[:6]
    i = ids(conn, "TDX", "CHIP", "a", "c")
    conn.execute(
        """INSERT INTO iot.model (type, kind, category, grade, attributes)
           VALUES ('CleanRoom', 'Phòng sạch', 'cleanroom', 'ISO 5', '[{"key": "particles05", "max": 3520}]')
           ON CONFLICT DO NOTHING"""
    )
    conn.execute(
        "INSERT INTO iot.site (tenant_id, code, org_unit_id, name) VALUES (%s, %s, %s, 'Nhà máy')",
        (i["TDX"], f"s-{sfx}", i["CHIP"]),
    )
    entity = conn.execute(
        """INSERT INTO iot.entity (tenant_id, code, urn, type, name, site_code, org_unit_id)
           VALUES (%s, %s, %s, 'CleanRoom', 'Phòng sạch', %s, %s) RETURNING id""",
        (i["TDX"], f"CR-{sfx}", f"urn:ngsi-ld:CleanRoom:t:{sfx}", f"s-{sfx}", i["CHIP"]),
    ).fetchone()["id"]
    conn.execute(
        """INSERT INTO iot.measurement (tenant_id, entity_id, attribute, observed_at, value)
           VALUES (%s, %s, 'particles05', now(), 3600)""",
        (i["TDX"], entity),
    )
    incident = conn.execute(
        """INSERT INTO iot.incident (tenant_id, code, entity_id, attribute, side, threshold, started_at, minutes, peak,
                                     severity, status)
           VALUES (%s, %s, %s, 'particles05', 'above', 3520, now(), 5, 3600, 'critical', 'open') RETURNING id""",
        (i["TDX"], f"SC-{sfx}", entity),
    ).fetchone()["id"]
    for k in ("on-time", "oee"):
        conn.execute(
            """INSERT INTO kpi.definition (tenant_id, key, label, unit, good_direction, grain, definition)
               VALUES (%s, %s, %s, '%%', 'up', 'month', 'x') ON CONFLICT DO NOTHING""",
            (i["TDX"], k, k),
        )
    conn.execute(
        """INSERT INTO meta.lineage_node (id, layer, tech, name, fqn, title, owner)
           VALUES ('pg-x', 'source', 'PostgreSQL', 'x', 'postgres.bms.x', 'X', 'Nhóm') ON CONFLICT DO NOTHING"""
    )
    return {**i, "code": f"CR-{sfx}", "incident": str(incident)}


def test_doc_va_ghi_nhan_su_co(hasura, twin):
    i = twin
    data = hasura(ENTITIES, person=i["a"], tenant=i["TDX"])["data"]["iot_entity"]
    mine = next(e for e in data if e["code"] == i["code"])
    assert mine["state"]["particles05"]["value"] == 3600 and mine["type_model"]["kind"] == "Phòng sạch"

    empty = hasura(ACK, {"id": i["incident"], "n": " "}, person=i["a"], tenant=i["TDX"])
    assert "hướng xử lý" in empty["errors"][0]["message"]
    ok = hasura(ACK, {"id": i["incident"], "n": "Đã thay bộ lọc"}, person=i["a"], tenant=i["TDX"])
    assert ok["data"]["iot_acknowledge"]["acknowledged_at"], ok
    again = hasura(ACK, {"id": i["incident"], "n": "lần nữa"}, person=i["c"], tenant=i["TDX"])
    assert "đã được ghi nhận" in again["errors"][0]["message"]


def test_tenant_khac_khong_thay(hasura, conn, twin):
    i = twin
    bvx = ids(conn, "BVX")["BVX"]
    other = hasura(ENTITIES, person=i["a"], tenant=bvx)
    rows = other.get("data", {}).get("iot_entity", [])
    assert all(e["code"] != i["code"] for e in rows)
    ack = hasura(ACK, {"id": i["incident"], "n": "x"}, person=i["a"], tenant=bvx)
    assert "errors" in ack


def test_ghim_kpi_cua_minh(hasura, twin):
    i = twin
    r = hasura(SAVE, {"p": [{"kpi_key": "oee", "position": 1}, {"kpi_key": "on-time", "position": 2}]},
               person=i["a"], tenant=i["TDX"])  # fmt: skip
    assert "errors" not in r, r
    hasura(SAVE, {"p": [{"kpi_key": "on-time", "position": 1}]}, person=i["c"], tenant=i["TDX"])
    assert hasura(PINS, person=i["a"], tenant=i["TDX"])["data"]["kpi_pin"] == [
        {"kpi_key": "oee", "position": 1},
        {"kpi_key": "on-time", "position": 2},
    ]
    assert hasura(PINS, person=i["c"], tenant=i["TDX"])["data"]["kpi_pin"] == [{"kpi_key": "on-time", "position": 1}]
    bad = hasura(SAVE, {"p": [{"kpi_key": "khong-co", "position": 1}]}, person=i["a"], tenant=i["TDX"])
    assert "errors" in bad
    assert len(hasura(PINS, person=i["a"], tenant=i["TDX"])["data"]["kpi_pin"]) == 2, "lỗi thì không mất ghim cũ"


def test_bao_su_co_du_lieu(hasura, conn, twin):
    i = twin
    nodes = hasura("query { meta_lineage_node { id } }", person=i["a"], tenant=i["TDX"])["data"]["meta_lineage_node"]
    assert {"id": "pg-x"} in nodes
    q = """mutation($o: meta_data_issue_insert_input!) { insert_meta_data_issue_one(object: $o) { id } }"""
    r = hasura(q, {"o": {"node_id": "pg-x", "severity": "high", "description": "Thiếu dữ liệu hôm nay"}},
               person=i["a"], tenant=i["TDX"])  # fmt: skip
    issue = r["data"]["insert_meta_data_issue_one"]["id"]
    row = conn.execute("SELECT reported_by, tenant_id FROM meta.data_issue WHERE id = %s", (issue,)).fetchone()
    assert str(row["reported_by"]) == i["a"] and str(row["tenant_id"]) == i["TDX"]
    short = hasura(q, {"o": {"node_id": "pg-x", "severity": "low", "description": "x"}}, person=i["a"], tenant=i["TDX"])
    assert "errors" in short
