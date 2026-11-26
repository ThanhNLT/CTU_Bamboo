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

import pytest
from fastapi.testclient import TestClient

from app import audit, config, main
from conftest import SETTINGS, ids, pr


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


def grant_auditor(conn, position_key: str) -> None:
    conn.execute("""
        INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'KIEM_TOAN_PII', 'Kiểm toán')
        ON CONFLICT (tenant_id, code) DO NOTHING;
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT tenant_id, id, 'audit.read' FROM core.role WHERE code = 'KIEM_TOAN_PII' ON CONFLICT DO NOTHING;""")
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
                    SELECT r.tenant_id, r.id, test.id(%s), 'TENANT' FROM core.role r WHERE r.code = 'KIEM_TOAN_PII'
                      AND NOT EXISTS (SELECT 1 FROM core.role_grant g WHERE g.role_id = r.id)""",
        (position_key,),
    )


def commented_log(conn, body: str) -> int:
    pr_id = pr(conn, f"pii_{abs(hash(body))}", "c", "P_NV_MH_DT", 1_000_000)
    row = conn.execute(
        """INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
                          VALUES (test.id('TDX'), 'proc.purchase_request', %s, test.id('c'), %s) RETURNING id""",
        (pr_id, body),
    ).fetchone()
    return conn.execute(
        """SELECT id FROM audit.log WHERE table_name = 'collab.comment' AND row_id = %s""", (str(row["id"]),)
    ).fetchone()["id"]


def test_nhat_ky_tra_ban_che(client, conn):
    i = ids(conn, "TDX", "BVX", "c", "ptgd")
    grant_auditor(conn, "P_PTGD")
    log_id = commented_log(conn, "Liên hệ chị Hương 0912 345 678, CCCD 079203456789")

    resp = call(client, "audit_log_detail", {"log_ids": [log_id]}, i["c"], i["TDX"])
    assert resp.status_code == 403 and "audit.read" in resp.json()["message"]

    resp = call(client, "audit_log_detail", {"log_ids": [log_id]}, i["ptgd"], i["TDX"])
    assert resp.status_code == 200, resp.text
    [row] = resp.json()
    assert row["new_data"]["body"] == "Liên hệ chị Hương 0912 *** 678, CCCD •••••••••789"
    assert row["old_data"] is None and row["table_name"] == "collab.comment"
    assert row["masked"] == ["Số CCCD", "Số điện thoại"]
    assert call(client, "audit_log_detail", {"log_ids": [log_id]}, i["ptgd"], i["BVX"]).status_code == 403


def test_che_theo_ten_cot():
    masked, found = audit.mask_row(
        {
            "full_name": "Trần Thị Thử",
            "date_of_birth": "1998-04-12",
            "national_id_enc": "vault:v1:abc",
            "national_id_masked": "•••••••••789",
            "phone": "+1 555 0100",
            "work_email": "thu.tt@dienthoai.vn",
            "salary": 18000000,
        }
    )
    assert masked == {
        "full_name": "Trần Thị Thử",
        "date_of_birth": "••/••/1998",
        "national_id_enc": "[bản mã]",
        "national_id_masked": "•••••••••789",
        "phone": "••••••100",
        "work_email": "t***@dienthoai.vn",
        "salary": 18000000,
    }
    assert found == {"Ngày sinh", "Bản mã", "Số điện thoại", "Email"}


def test_kiem_tra_truoc_khi_gui(client, conn):
    i = ids(conn, "TDX", "c")
    resp = call(client, "check_pii", {"text": "STK 0071000123456, gọi 0987654321"}, i["c"], i["TDX"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["masked_text"] == "STK ••••••••••456, gọi 0987 *** 321"
    assert [(e["entity"], e["label"]) for e in body["entities"]] == [
        ("VN_BANK_ACCOUNT", "Số tài khoản"),
        ("VN_PHONE", "Số điện thoại"),
    ]
    resp = call(client, "check_pii", {"text": "x" * 10_001}, i["c"], i["TDX"])
    assert resp.status_code == 400


def test_qua_hasura(hasura, conn):
    i = ids(conn, "TDX", "ptgd", "c")
    grant_auditor(conn, "P_PTGD")
    log_id = commented_log(conn, "Gửi về thu.tt@dienthoai.vn")
    raw = hasura("query { audit_log(limit: 1) { new_data } }", person=i["ptgd"], tenant=i["TDX"])
    assert "new_data" in raw["errors"][0]["message"], "Hasura không trả dữ liệu trước/sau chưa che"
    q = """query($ids: [Int!]!) { audit_log_detail(log_ids: $ids) { log_id new_data masked } }"""
    data = hasura(q, {"ids": [log_id]}, person=i["ptgd"], tenant=i["TDX"])
    assert data["data"]["audit_log_detail"][0]["new_data"]["body"] == "Gửi về t***@dienthoai.vn", data
    check = """query($t: String!) { check_pii(text: $t) { masked_text entities { label } } }"""
    data = hasura(check, {"t": "SĐT 0912345678"}, person=i["c"], tenant=i["TDX"])
    assert data["data"]["check_pii"] == {"masked_text": "SĐT 0912 *** 678", "entities": [{"label": "Số điện thoại"}]}
