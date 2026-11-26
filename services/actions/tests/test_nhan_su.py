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

import json
import os

import httpx
import psycopg
import pytest

from app import hr_account
from bamboo_common.pii import PiiCipher, mask_address, mask_tail
from conftest import ids, open_task

TENANT_SQL = "SELECT test.id('TDX') AS id"


def test_ban_che():
    assert mask_tail("079 123 456 789", 3) == "•••••••••789"
    assert mask_tail("12", 4) == "••"
    assert mask_address("12 Lý Thái Tổ, Hoàn Kiếm, Hà Nội") == "•••, Hà Nội"
    assert mask_address("Hà Nội") == "•••"


def test_mat_khau_tam():
    for _ in range(50):
        p = hr_account.temporary_password()
        assert (
            len(p) == 14 and any(c.isupper() for c in p) and any(c.islower() for c in p) and any(c.isdigit() for c in p)
        )
        assert not set(p) & set("0O1lI")
    assert hr_account.split_name("Nguyễn Văn An") == ("An", "Nguyễn Văn")


@pytest.fixture
def hr(conn, org):
    k = org
    conn.execute(f"""
        SELECT test.unit('TDX', '{k("NS")}', '{k("CTY")}', 'PHONG', 'Phòng Nhân sự');
        SELECT test.position('TDX', '{k("P_NS")}', '{k("NS")}', 'Chuyên viên nhân sự');
        SELECT test.position('TDX', '{k("P_NV2")}', '{k("PHONG")}', 'Chuyên viên mới');
        SELECT test.person('TDX', '{k("ns")}', 'Nhân sự');
        SELECT test.assign('TDX', '{k("ns")}', '{k("P_NS")}');
        INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), '{k("NHAN_SU")}', 'Nhân sự');
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT tenant_id, id, p FROM core.role,
               unnest(ARRAY['hr.onboarding.create', 'hr.onboarding.read', 'hr.onboarding.private.read']) p
        WHERE code = '{k("NHAN_SU")}';
        INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope, scope_unit_id)
        SELECT tenant_id, id, test.id('{k("NS")}'), 'SUBTREE', test.id('{k("CTY")}') FROM core.role
        WHERE code = '{k("NHAN_SU")}';
        INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, approver_unit_type_id)
        SELECT test.id('TDX'), 'ONBOARDING', 0, s, CASE WHEN s = 2 THEN test.id('TDX:CONG_TY') END
        FROM generate_series(1, 2) s
        WHERE NOT EXISTS (SELECT 1 FROM wf.approval_rule WHERE process_code = 'ONBOARDING');
    """)
    return k


@pytest.fixture(scope="session")
def pii():
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    if not addr or not approle:
        pytest.skip("cần BAO_ADDR, BAO_APPROLE_FILE (AppRole actions) để mã hóa bằng khóa pii")
    return PiiCipher(addr, approle)


def test_ho_so_qua_hasura(hasura, conn, hr, pii):
    k = hr
    p = ids(conn, k("ns"), k("tp"), k("gd"), k("nv"), k("P_NS"), k("P_NV2"))
    tenant = str(conn.execute(TENANT_SQL).fetchone()["id"])

    def gql(query, variables=None, *, who):
        return hasura(query, variables, person=p[k(who)], tenant=tenant)

    created = gql(
        """mutation($o: hr_onboarding_request_insert_input!) {
                       insert_hr_onboarding_request_one(object: $o) { id doc_no target_unit_id } }""",
        {
            "o": {
                "requester_position_id": p[k("P_NS")],
                "full_name": "Ứng viên A",
                "target_position_id": p[k("P_NV2")],
                "start_date": "2099-01-05",
                "salary": 20000000,
                "username": f"ung.vien.{k('a').lower()}",
            }
        },
        who="ns",
    )
    rid = created["data"]["insert_hr_onboarding_request_one"]["id"]
    assert created["data"]["insert_hr_onboarding_request_one"]["doc_no"].startswith("TN-")

    denied = gql(
        """mutation($o: hr_onboarding_request_insert_input!) { insert_hr_onboarding_request_one(object: $o) { id } }""",
        {
            "o": {
                "requester_position_id": p[k("P_NS")],
                "full_name": "X",
                "target_position_id": p[k("P_NV2")],
                "start_date": "2099-01-05",
            }
        },
        who="nv",
    )
    assert "errors" in denied

    saved = gql(
        """mutation($id: uuid!) { save_onboarding_private(request_id: $id, national_id: "079 123 456 789",
                     bank_account: "0123456789", address: "12 Lý Thái Tổ, Hoàn Kiếm, Hà Nội") { status } }""",
        {"id": rid},
        who="ns",
    )
    assert saved["data"]["save_onboarding_private"]["status"] == "DRAFT", saved
    bad = gql(
        """mutation($id: uuid!) { save_onboarding_private(request_id: $id, national_id: "123") { status } }""",
        {"id": rid},
        who="ns",
    )
    assert "12 chữ số" in bad["errors"][0]["message"]
    row = conn.execute("SELECT * FROM hr.onboarding_request WHERE id = %s", (rid,)).fetchone()
    assert row["national_id_enc"].startswith("vault:v1:") and row["national_id_masked"] == "•••••••••789"
    assert pii.decrypt(row["bank_account_enc"]) == "0123456789"

    hidden = gql(
        "query($id: uuid!) { hr_onboarding_request_by_pk(id: $id) { national_id_enc } }", {"id": rid}, who="ns"
    )
    assert "errors" in hidden

    sent = gql("mutation($id: uuid!) { submit_onboarding_request(request_id: $id) { status } }", {"id": rid}, who="ns")
    assert sent["data"]["submit_onboarding_request"]["status"] == "PENDING", sent

    seen = gql(
        """query($id: uuid!) { hr_onboarding_request_by_pk(id: $id) { national_id_masked can_read_private }
                  wf_v_inbox { onboarding_request { id } } }""",
        {"id": rid},
        who="tp",
    )
    assert seen["data"]["hr_onboarding_request_by_pk"] == {
        "national_id_masked": "•••••••••789",
        "can_read_private": False,
    }
    assert {"onboarding_request": {"id": rid}} in seen["data"]["wf_v_inbox"]
    forbidden = gql(
        "mutation($id: uuid!) { reveal_onboarding_private(request_id: $id) { national_id } }", {"id": rid}, who="tp"
    )
    assert forbidden["errors"][0]["extensions"]["code"] == "forbidden"
    assert (
        gql("query($id: uuid!) { hr_onboarding_request_by_pk(id: $id) { id } }", {"id": rid}, who="nv")["data"][
            "hr_onboarding_request_by_pk"
        ]
        is None
    ), "nhân viên khác không xem được"

    revealed = gql(
        "mutation($id: uuid!) { reveal_onboarding_private(request_id: $id) { national_id address } }",
        {"id": rid},
        who="ns",
    )
    assert revealed["data"]["reveal_onboarding_private"] == {
        "national_id": "079123456789",
        "address": "12 Lý Thái Tổ, Hoàn Kiếm, Hà Nội",
    }
    assert (
        conn.execute(
            """SELECT count(*) AS n FROM audit.log WHERE table_name = 'hr.private_access'
                           AND new_data ->> 'request_id' = %s""",
            (rid,),
        ).fetchone()["n"]
        == 1
    )
    assert (
        conn.execute("SELECT count(*) AS n FROM audit.log WHERE new_data::text LIKE '%%079123456789%%'").fetchone()["n"]
        == 0
    ), "nhật ký kiểm toán không chứa bản rõ"

    for who in ("tp", "gd"):
        task = open_task(conn, rid)
        assert str(task["assignee_id"]) == p[k(who)]
        acted = gql(
            """mutation($t: uuid!) { act_on_task(task_id: $t, decision: APPROVE) { status } }""",
            {"t": str(task["id"])},
            who=who,
        )
        assert "errors" not in acted, acted
    assert acted["data"]["act_on_task"]["status"] == "APPROVED"
    done = conn.execute(
        """SELECT r.account_status, p.employee_code FROM hr.onboarding_request r
                           JOIN core.person p ON p.id = r.person_id WHERE r.id = %s""",
        (rid,),
    ).fetchone()
    assert done["account_status"] == "PENDING" and done["employee_code"].startswith("NV-")


class FakeKeycloak:
    def __init__(self):
        self.users: dict[str, dict] = {}
        self.fail_next = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 300})
        if self.fail_next:
            self.fail_next = False
            return httpx.Response(503)
        if request.method == "POST" and request.url.path.endswith("/users"):
            body = json.loads(request.content)
            if any(u["username"] == body["username"] for u in self.users.values()):
                return httpx.Response(409)
            uid = f"kc-{len(self.users) + 1}"
            self.users[uid] = {**body, "id": uid}
            return httpx.Response(201, headers={"Location": f"http://kc/admin/realms/bms/users/{uid}"})
        if request.method == "GET" and request.url.path.endswith("/users"):
            name = request.url.params["username"]
            return httpx.Response(200, json=[u for u in self.users.values() if u["username"] == name])
        if request.method == "PUT" and request.url.path.endswith("/reset-password"):
            uid = request.url.path.split("/")[-2]
            self.users[uid]["credentials"] = [json.loads(request.content)]
            return httpx.Response(204)
        return httpx.Response(404)


class FakeCipher:
    def encrypt(self, value: str) -> str:
        return "vault:v1:" + value[::-1]


@pytest.fixture
def keycloak(monkeypatch):
    fake = FakeKeycloak()
    transport = httpx.MockTransport(fake.handler)
    real_client = httpx.Client
    monkeypatch.setattr(hr_account.httpx, "Client", lambda **kw: real_client(transport=transport, **kw))
    monkeypatch.setattr(hr_account.httpx, "post", lambda url, **kw: real_client(transport=transport).post(url, **kw))
    return fake, hr_account.KeycloakUsers("http://kc", "bms-provisioner", "s")


def _approved(conn, k, username: str, position: str = "P_NV2") -> str:
    rid = conn.execute(
        f"""
        INSERT INTO hr.onboarding_request (tenant_id, requester_id, requester_position_id, full_name,
                                           target_position_id, start_date, username, national_id_enc)
        VALUES (test.id('TDX'), test.id('{k("ns")}'), test.id('{k("P_NS")}'), 'Nguyễn Văn An',
                test.id('{k(position)}'), current_date + 3, %s, 'vault:v1:x')
        RETURNING id""",
        (username,),
    ).fetchone()["id"]
    conn.execute("SELECT hr.submit_onboarding_request(%s, test.id(%s))", (rid, k("ns")))
    for who in ("tp", "gd"):
        conn.execute("SELECT wf.act(%s, test.id(%s), 'APPROVE')", (open_task(conn, rid)["id"], k(who)))
    return str(rid)


def test_tao_tai_khoan(database, conn, hr, keycloak):
    fake, users = keycloak
    k = hr
    rid = _approved(conn, k, f"an.{k('x').lower()}")
    with psycopg.connect(database) as work:
        assert hr_account.run_once(work, users, FakeCipher()) >= 1
    row = conn.execute(
        """SELECT r.account_status, r.initial_password_enc, p.idp_subject FROM hr.onboarding_request r
                          JOIN core.person p ON p.id = r.person_id WHERE r.id = %s""",
        (rid,),
    ).fetchone()
    assert row["account_status"] == "CREATED"
    user = fake.users[row["idp_subject"]]
    assert user["requiredActions"] == ["UPDATE_PASSWORD"] and user["credentials"][0]["temporary"] is True
    assert row["initial_password_enc"] == "vault:v1:" + user["credentials"][0]["value"][::-1]
    assert user["attributes"] == {hr_account.ATTRIBUTE: [rid]}


def test_tao_tai_khoan_chay_lai_va_trung_ten(database, conn, hr, keycloak):
    fake, users = keycloak
    k = hr
    conn.execute(f"SELECT test.position('TDX', '{k('P_NV3')}', '{k('PHONG')}', 'Chuyên viên mới 2')")

    name = f"binh.{k('x').lower()}"
    rid = _approved(conn, k, name)
    fake.users["kc-9"] = {"id": "kc-9", "username": name, "attributes": {hr_account.ATTRIBUTE: [rid]}}
    with psycopg.connect(database) as work:
        hr_account.run_once(work, users, FakeCipher())
    assert (
        conn.execute(
            "SELECT p.idp_subject FROM hr.onboarding_request r JOIN core.person p ON p.id = r.person_id "
            "WHERE r.id = %s",
            (rid,),
        ).fetchone()["idp_subject"]
        == "kc-9"
    )
    assert fake.users["kc-9"]["credentials"][0]["temporary"] is True, "đặt lại mật khẩu tạm"

    other = f"chi.{k('x').lower()}"
    fake.users["kc-8"] = {"id": "kc-8", "username": other, "attributes": {}}
    rid2 = _approved(conn, k, other, position="P_NV3")
    with psycopg.connect(database) as work:
        hr_account.run_once(work, users, FakeCipher())
    failed = conn.execute(
        "SELECT account_status, account_error FROM hr.onboarding_request WHERE id = %s", (rid2,)
    ).fetchone()
    assert failed["account_status"] == "FAILED" and "đã thuộc một tài khoản khác" in failed["account_error"]

    conn.execute("SELECT hr.retry_onboarding_account(%s, test.id(%s), %s)", (rid2, k("ns"), f"chi2.{k('x').lower()}"))
    fake.fail_next = True
    with psycopg.connect(database) as work:
        hr_account.run_once(work, users, FakeCipher())
    pending = conn.execute(
        "SELECT account_status, account_attempts FROM hr.onboarding_request WHERE id = %s", (rid2,)
    ).fetchone()
    assert pending == {"account_status": "PENDING", "account_attempts": 1}
