# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import config, main
from conftest import SETTINGS, ids, open_task

SETUP = """
INSERT INTO core.role (tenant_id, code, name)
SELECT test.id('TDX'), 'BAN_HANG_NOI_BO', 'Bán hàng nội bộ'
WHERE NOT EXISTS (SELECT 1 FROM core.role WHERE tenant_id = test.id('TDX') AND code = 'BAN_HANG_NOI_BO');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, p FROM core.role, unnest(ARRAY['ic.order.read', 'ic.order.confirm']) p
WHERE tenant_id = test.id('TDX') AND code = 'BAN_HANG_NOI_BO'
ON CONFLICT DO NOTHING;
INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope, scope_unit_id)
SELECT test.id('TDX'), id, test.id('CHIP_KD'), 'SUBTREE', test.id('CHIP') FROM core.role r
WHERE tenant_id = test.id('TDX') AND code = 'BAN_HANG_NOI_BO'
  AND NOT EXISTS (SELECT 1 FROM core.role_grant g WHERE g.role_id = r.id);
INSERT INTO mdm.partner (tenant_id, code, name, internal_unit_id)
VALUES (test.id('TDX'), 'NB_CHIP', 'Công ty Chip X', test.id('CHIP')) ON CONFLICT DO NOTHING;
INSERT INTO mdm.item (tenant_id, code, name, uom, ref_price)
VALUES (test.id('TDX'), 'IC-PMIC', 'Chip quản lý nguồn PMIC', 'cái', 12000) ON CONFLICT DO NOTHING;
INSERT INTO mfg.lot (tenant_id, lot_no, item_id, org_unit_id, quantity, uom, produced_on)
SELECT test.id('TDX'), 'IC-PMIC-A', id, test.id('CHIP'), 1000000, 'cái', current_date FROM mdm.item
WHERE tenant_id = test.id('TDX') AND code = 'IC-PMIC' ON CONFLICT DO NOTHING;
"""


@pytest.fixture(scope="module")
def setup(database):
    with psycopg.connect(database, autocommit=True) as c:
        c.execute(SETUP)
        item, lot = c.execute("""SELECT i.id, l.id FROM mdm.item i JOIN mfg.lot l ON l.item_id = i.id
                                 WHERE l.lot_no = 'IC-PMIC-A'""").fetchone()
        partner = c.execute("SELECT id FROM mdm.partner WHERE code = 'NB_CHIP'").fetchone()[0]
    return {"item": str(item), "lot": str(lot), "partner": str(partner)}


@pytest.fixture
def client(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database})
    with TestClient(main.create_app(settings)) as c:
        yield c


def call(client, name, args, person, tenant):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})


def ordered(conn, setup, title: str, quantity: int = 100) -> tuple[str, str]:
    i = ids(conn, "TDX", "c", "tp_mh_dt")
    pr_id = conn.execute(
        """INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id,
                                                               partner_id)
                            VALUES (%s, %s, %s, test.id('P_NV_MH_DT'), %s) RETURNING id""",
        (i["TDX"], title, i["c"], setup["partner"]),
    ).fetchone()["id"]
    conn.execute(
        """INSERT INTO proc.purchase_request_item (request_id, item_id, quantity, unit_price)
                    VALUES (%s, %s, %s, 12000)""",
        (pr_id, setup["item"], quantity),
    )
    conn.execute("SELECT proc.submit_purchase_request(%s, %s)", (pr_id, i["c"]))
    conn.execute("SELECT wf.act(%s, %s, 'APPROVE')", (open_task(conn, pr_id)["id"], i["tp_mh_dt"]))
    row = conn.execute(
        """SELECT o.id, l.id AS line_id FROM proc.purchase_request r
                          JOIN ic.ic_order o ON o.id = r.ic_order_id JOIN ic.ic_order_item l ON l.order_id = o.id
                          WHERE r.id = %s""",
        (pr_id,),
    ).fetchone()
    return str(row["id"]), str(row["line_id"])


def test_xac_nhan_kem_lo(client, conn, setup):
    i = ids(conn, "TDX", "BVX", "a", "c")
    order, line = ordered(conn, setup, "ic xác nhận")

    resp = call(client, "confirm_ic_order", {"order_id": order, "lots": []}, i["c"], i["TDX"])
    assert resp.status_code == 400 and "Không có quyền xác nhận" in resp.json()["message"]
    resp = call(client, "confirm_ic_order", {"order_id": order}, i["a"], i["TDX"])
    assert resp.status_code == 400 and "chọn lô xuất" in resp.json()["message"]
    lots = [{"line_id": line, "lot_id": setup["lot"]}]
    resp = call(client, "confirm_ic_order", {"order_id": order, "lots": lots * 2}, i["a"], i["TDX"])
    assert resp.status_code == 400 and "một lô" in resp.json()["message"]
    resp = call(client, "confirm_ic_order", {"order_id": order, "lots": lots}, i["a"], i["BVX"])
    assert resp.status_code == 404

    resp = call(client, "confirm_ic_order", {"order_id": order, "lots": lots}, i["a"], i["TDX"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "CONFIRMED" and body["purchase_order_id"]
    po = conn.execute(
        """SELECT o.doc_no, l.lot_id FROM proc.purchase_order o
                         JOIN proc.purchase_order_item l ON l.order_id = o.id WHERE o.id = %s""",
        (body["purchase_order_id"],),
    ).fetchone()
    assert po["doc_no"].startswith("PO-") and str(po["lot_id"]) == setup["lot"]
    actor = conn.execute(
        """SELECT actor_id FROM audit.log WHERE table_name = 'ic.ic_order' AND row_id = %s
                            ORDER BY id DESC LIMIT 1""",
        (order,),
    ).fetchone()["actor_id"]
    assert str(actor) == i["a"]

    resp = call(client, "confirm_ic_order", {"order_id": order, "lots": lots}, i["a"], i["TDX"])
    assert resp.status_code == 400 and "CONFIRMED" in resp.json()["message"]


def test_tu_choi_va_huy(client, conn, setup):
    i = ids(conn, "TDX", "a", "c", "gd_gd")
    order, _ = ordered(conn, setup, "ic từ chối")
    resp = call(client, "reject_ic_order", {"order_id": order, "reason": " "}, i["a"], i["TDX"])
    assert resp.status_code == 400 and "lý do" in resp.json()["message"]
    resp = call(client, "reject_ic_order", {"order_id": order, "reason": "Hết hàng"}, i["a"], i["TDX"])
    assert resp.status_code == 200 and resp.json() == {
        "order_id": order,
        "status": "REJECTED",
        "purchase_order_id": None,
    }

    order, _ = ordered(conn, setup, "ic hủy")
    resp = call(client, "cancel_ic_order", {"order_id": order, "reason": "x"}, i["gd_gd"], i["TDX"])
    assert resp.status_code == 404
    resp = call(client, "cancel_ic_order", {"order_id": order, "reason": "x"}, i["a"], i["TDX"])
    assert resp.status_code == 400 and "Chỉ người đặt" in resp.json()["message"]
    resp = call(client, "cancel_ic_order", {"order_id": order, "reason": "Mua nơi khác"}, i["c"], i["TDX"])
    assert resp.status_code == 200 and resp.json()["status"] == "CANCELLED"


def test_qua_hasura(hasura, conn, setup):
    i = ids(conn, "TDX", "a", "c", "gd_gd")
    order, line = ordered(conn, setup, "ic hasura")
    q = """query($id: uuid!) { ic_ic_order_by_pk(id: $id) {
             doc_no status can_confirm seller_unit { name } buyer_unit { name }
             ic_order_items { line_no description lot_id } purchase_requests { doc_no } } }"""
    seller = hasura(q, {"id": order}, person=i["a"], tenant=i["TDX"])["data"]["ic_ic_order_by_pk"]
    assert seller["can_confirm"] is True and seller["status"] == "PENDING"
    assert seller["seller_unit"]["name"] == "Công ty Chip X" and len(seller["ic_order_items"]) == 1
    buyer = hasura(q, {"id": order}, person=i["c"], tenant=i["TDX"])["data"]["ic_ic_order_by_pk"]
    assert buyer["can_confirm"] is False and buyer["purchase_requests"][0]["doc_no"].startswith("PR-")
    assert hasura(q, {"id": order}, person=i["gd_gd"], tenant=i["TDX"])["data"]["ic_ic_order_by_pk"] is None
    items = """query($id: uuid!) { ic_ic_order_item(where: {order_id: {_eq: $id}}) { id } }"""
    assert hasura(items, {"id": order}, person=i["gd_gd"], tenant=i["TDX"])["data"]["ic_ic_order_item"] == []

    confirm = """mutation($id: uuid!, $lots: [IcOrderLot!]) {
                   confirm_ic_order(order_id: $id, lots: $lots) { status purchase_order { doc_no request { doc_no } } } }"""
    data = hasura(
        confirm, {"id": order, "lots": [{"line_id": line, "lot_id": setup["lot"]}]}, person=i["a"], tenant=i["TDX"]
    )
    assert data["data"]["confirm_ic_order"]["status"] == "CONFIRMED", data
    assert data["data"]["confirm_ic_order"]["purchase_order"] is None
    po = """query($id: uuid!) { proc_purchase_order(where: {ic_order_id: {_eq: $id}}) {
              doc_no purchase_order_items { lot { lot_no } } } }"""
    rows = hasura(po, {"id": order}, person=i["c"], tenant=i["TDX"])["data"]["proc_purchase_order"]
    assert rows[0]["purchase_order_items"][0]["lot"]["lot_no"] == "IC-PMIC-A"
    assert hasura(po, {"id": order}, person=i["a"], tenant=i["TDX"])["data"]["proc_purchase_order"] == []
