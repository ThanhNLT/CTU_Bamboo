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

"""Nhận hàng, hóa đơn, thanh toán, đối trừ công nợ và quy tắc hạn mức duyệt qua Action (ADR #96, migration 067)."""

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import config, main
from conftest import SETTINGS, ids, open_task

SETUP = """
INSERT INTO core.role (tenant_id, code, name)
SELECT test.id('TDX'), v.code, v.name FROM (VALUES ('KE_TOAN_CN', 'Kế toán công nợ'), ('KHO_CN', 'Kho')) v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM core.role WHERE tenant_id = test.id('TDX') AND code = v.code);
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, p FROM core.role,
       unnest(ARRAY['fin.payable.read', 'fin.payable.manage', 'wf.approval_rule.manage']) p
WHERE tenant_id = test.id('TDX') AND code = 'KE_TOAN_CN'
ON CONFLICT DO NOTHING;
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, 'proc.goods_receipt.create' FROM core.role WHERE tenant_id = test.id('TDX') AND code = 'KHO_CN'
ON CONFLICT DO NOTHING;
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), r.id, test.id(v.pos), 'TENANT'
FROM (VALUES ('KE_TOAN_CN', 'P_TGD'), ('KHO_CN', 'P_TP_MH_DT')) v(code, pos)
JOIN core.role r ON r.tenant_id = test.id('TDX') AND r.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM core.role_grant g WHERE g.role_id = r.id);
INSERT INTO mdm.partner (tenant_id, code, name)
VALUES (test.id('TDX'), 'NCC-CN', 'Nhà cung cấp công nợ') ON CONFLICT DO NOTHING;
"""


@pytest.fixture(scope="module")
def setup(database):
    with psycopg.connect(database, autocommit=True) as c:
        c.execute(SETUP)
        partner = c.execute("SELECT id FROM mdm.partner WHERE code = 'NCC-CN'").fetchone()[0]
    return {"partner": str(partner)}


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


def approved(conn, setup, title: str) -> tuple[str, str]:
    i = ids(conn, "TDX", "c", "tp_mh_dt")
    pr_id = conn.execute(
        """INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id, partner_id)
           VALUES (%s, %s, %s, test.id('P_NV_MH_DT'), %s) RETURNING id""",
        (i["TDX"], title, i["c"], setup["partner"]),
    ).fetchone()["id"]
    line = conn.execute(
        """INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
           VALUES (%s, 'Bàn làm việc', 'cái', 4, 2500000) RETURNING id""",
        (pr_id,),
    ).fetchone()["id"]
    conn.execute("SELECT proc.submit_purchase_request(%s, %s)", (pr_id, i["c"]))
    conn.execute("SELECT wf.act(%s, %s, 'APPROVE')", (open_task(conn, pr_id)["id"], i["tp_mh_dt"]))
    return str(pr_id), str(line)


def test_nhan_hang_hoa_don_thanh_toan(client, conn, setup):
    i = ids(conn, "TDX", "BVX", "c", "tp_mh_dt", "tgd")
    request_id, line = approved(conn, setup, "công nợ qua action")

    lines = [{"request_item_id": line, "quantity": 4}]
    resp = call(client, "post_goods_receipt", {"request_id": request_id, "lines": lines}, i["c"], i["TDX"])
    assert resp.status_code == 400 and "proc.goods_receipt.create" in resp.json()["message"]
    resp = call(client, "post_goods_receipt", {"request_id": request_id, "lines": lines}, i["tp_mh_dt"], i["BVX"])
    assert resp.status_code == 404, "chứng từ của tenant khác"
    resp = call(client, "post_goods_receipt", {"request_id": request_id, "lines": []}, i["tp_mh_dt"], i["TDX"])
    assert resp.status_code == 400 and "ít nhất một dòng" in resp.json()["message"]
    resp = call(
        client, "post_goods_receipt", {"request_id": request_id, "lines": lines, "note": "Đủ"}, i["tp_mh_dt"], i["TDX"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["doc_no"].startswith("GR-")

    invoice_args = {
        "request_id": request_id,
        "supplier_invoice_no": "HD-CN-1",
        "invoice_date": "2026-11-20",
        "due_date": "2026-12-20",
        "amount": 10000000,
    }
    resp = call(client, "record_invoice", invoice_args, i["tgd"], i["TDX"])
    assert resp.status_code == 200, resp.text
    invoice = resp.json()["id"]
    row = conn.execute("SELECT match_status, status FROM fin.invoice WHERE id = %s", (invoice,)).fetchone()
    assert (row["match_status"], row["status"]) == ("MATCHED", "OPEN")

    resp = call(
        client, "record_payment", {"invoice_id": invoice, "amount": -1, "method": "TRANSFER"}, i["tgd"], i["TDX"]
    )
    assert resp.status_code == 400
    resp = call(client, "record_payment", {"invoice_id": invoice, "amount": 1, "method": "NETTING"}, i["tgd"], i["TDX"])
    assert resp.status_code == 400, "đối trừ chỉ qua run_netting"
    resp = call(
        client,
        "record_payment",
        {"invoice_id": invoice, "amount": 10000000, "method": "TRANSFER", "reference": "UNC-9"},
        i["tgd"],
        i["TDX"],
    )
    assert resp.status_code == 200, resp.text
    assert conn.execute("SELECT status FROM fin.invoice WHERE id = %s", (invoice,)).fetchone()["status"] == "PAID"
    actor = conn.execute(
        """SELECT actor_id FROM audit.log WHERE table_name = 'fin.payment' ORDER BY id DESC LIMIT 1"""
    ).fetchone()["actor_id"]
    assert str(actor) == i["tgd"], "nhật ký kiểm toán ghi người thanh toán"

    resp = call(client, "netting_overview", {}, i["tgd"], i["TDX"])
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["companies"] and isinstance(data["positions"], list)


@pytest.fixture
def onboarding_rules(conn):
    """Giữ nguyên quy tắc duyệt ONBOARDING của CSDL kiểm thử sau khi test ghi đè (kiểm thử khác dùng chung CSDL)."""
    tdx = ids(conn, "TDX")["TDX"]
    before = conn.execute(
        """SELECT id, valid_period FROM wf.approval_rule WHERE tenant_id = %s AND process_code = 'ONBOARDING'""",
        (tdx,),
    ).fetchall()
    yield
    keep = [r["id"] for r in before]
    conn.execute(
        """DELETE FROM wf.approval_rule WHERE tenant_id = %s AND process_code = 'ONBOARDING' AND NOT (id = ANY(%s))""",
        (tdx, keep),
    )
    for r in before:
        conn.execute("UPDATE wf.approval_rule SET valid_period = %s WHERE id = %s", (r["valid_period"], r["id"]))


def test_quy_tac_han_muc_duyet(client, conn, setup, onboarding_rules):
    i = ids(conn, "TDX", "c", "tgd")
    resp = call(client, "approval_rules", {"process_code": "ONBOARDING"}, i["c"], i["TDX"])
    assert resp.status_code == 200 and resp.json()["data"]["can_manage"] is False
    resp = call(client, "approval_rules", {"process_code": "ONBOARDING"}, i["tgd"], i["TDX"])
    data = resp.json()["data"]
    assert data["can_manage"] is True and any(t["code"] == "CONG_TY" for t in data["unit_types"])
    current = data["rules"] or [{"min_amount": "0", "max_amount": None, "step_order": 1, "approver_unit_type": None}]

    resp = call(client, "approval_rules", {"process_code": "KHAC"}, i["tgd"], i["TDX"])
    assert resp.status_code == 400
    bad = [{"min_amount": 100, "max_amount": 50, "step_order": 1}]
    resp = call(client, "save_approval_rules", {"process_code": "ONBOARDING", "rules": bad}, i["tgd"], i["TDX"])
    assert resp.status_code == 400 and "lớn hơn mức tối thiểu" in resp.json()["message"]
    rules = [{k: r[k] for k in ("min_amount", "max_amount", "step_order", "approver_unit_type")} for r in current]
    resp = call(client, "save_approval_rules", {"process_code": "ONBOARDING", "rules": rules}, i["c"], i["TDX"])
    assert resp.status_code == 400 and "wf.approval_rule.manage" in resp.json()["message"]
    resp = call(client, "save_approval_rules", {"process_code": "ONBOARDING", "rules": rules}, i["tgd"], i["TDX"])
    assert resp.status_code == 200, resp.text
    saved = resp.json()["data"]["rules"]
    expected = sorted(rules, key=lambda r: (float(r["min_amount"]), r["step_order"]))
    assert [(float(r["min_amount"]), r["step_order"]) for r in saved] == [
        (float(r["min_amount"]), r["step_order"]) for r in expected
    ]
