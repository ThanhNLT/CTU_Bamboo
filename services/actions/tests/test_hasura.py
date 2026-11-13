# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

from conftest import ids, open_task, pr, status

PR_QUERY = "query($id: uuid!) { proc_purchase_request_by_pk(id: $id) { id status requester_id } }"
INSERT_PR = """
mutation($pos: uuid!, $amount: numeric!) {
  insert_proc_purchase_request_one(object: {requester_position_id: $pos, title: "Mua linh kiện", total_amount: $amount}) {
    id requester_id status org_unit_id
  }
}"""


def test_quyen_xem_de_nghi(hasura, conn, org):
    k = org
    i = ids(conn, "TDX", "BVX", "c", "d", "tp_mh_dt", "gd_dt", k("nv"))
    pr_id = pr(conn, k("pr_c"), "c", "P_NV_MH_DT", 20_000_000)

    def sees(person, tenant="TDX"):
        data = hasura(PR_QUERY, {"id": pr_id}, person=i[person], tenant=i[tenant])
        assert "errors" not in data, data
        return data["data"]["proc_purchase_request_by_pk"] is not None

    assert sees("c"), "người lập xem được"
    assert sees("tp_mh_dt"), "người nhận việc duyệt xem được"
    assert not sees("gd_dt"), "giám đốc chưa nhận việc và không có quyền xem thì không thấy"
    assert not sees(k("nv")), "người ở công ty khác không thấy"
    assert not sees("c", "BVX"), "phiên tenant khác không thấy"


def test_ghi_nhap_qua_hasura(hasura, conn):
    i = ids(conn, "TDX", "c", "d", "P_NV_MH_DT", "P_NV2_MH_DT", "DT_MH")

    data = hasura(INSERT_PR, {"pos": i["P_NV_MH_DT"], "amount": 15_000_000}, person=i["c"], tenant=i["TDX"])
    assert "errors" not in data, data
    row = data["data"]["insert_proc_purchase_request_one"]
    assert row["requester_id"] == i["c"] and row["status"] == "DRAFT" and row["org_unit_id"] == i["DT_MH"]

    data = hasura(INSERT_PR, {"pos": i["P_NV2_MH_DT"], "amount": 1}, person=i["d"], tenant=i["TDX"])
    assert "Không có quyền lập" in data["errors"][0]["message"], data

    data = hasura(INSERT_PR, {"pos": i["P_NV2_MH_DT"], "amount": 1}, person=i["c"], tenant=i["TDX"])
    assert "không giữ vị trí" in data["errors"][0]["message"], data

    update = """mutation($id: uuid!, $amount: numeric!) {
      update_proc_purchase_request_by_pk(pk_columns: {id: $id}, _set: {total_amount: $amount}) { total_amount } }"""
    data = hasura(update, {"id": row["id"], "amount": 16_000_000}, person=i["c"], tenant=i["TDX"])
    assert data["data"]["update_proc_purchase_request_by_pk"]["total_amount"] == 16000000

    data = hasura(
        """mutation($id: uuid!) { submit_purchase_request(request_id: $id) { status } }""",
        {"id": row["id"]},
        person=i["c"],
        tenant=i["TDX"],
    )
    assert data["data"]["submit_purchase_request"]["status"] == "PENDING", data
    data = hasura(update, {"id": row["id"], "amount": 1}, person=i["c"], tenant=i["TDX"])
    assert data["data"]["update_proc_purchase_request_by_pk"] is None, "đang chờ duyệt thì không sửa được"


def test_hop_viec_va_duyet_qua_action(hasura, conn, org):
    k = org
    i = ids(conn, "TDX", k("nv"), k("tp"), k("gd"))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 100_000_000)

    inbox = """query { wf_v_inbox { task_id via_delegation purchase_request { id status } } }"""
    data = hasura(inbox, person=i[k("gd")], tenant=i["TDX"])
    items = [x for x in data["data"]["wf_v_inbox"] if x["purchase_request"]["id"] == pr_id]
    assert len(items) == 1 and items[0]["via_delegation"] is False, data

    data = hasura(inbox, person=i[k("tp")], tenant=i["TDX"])
    assert not [x for x in data["data"]["wf_v_inbox"] if x["purchase_request"] and x["purchase_request"]["id"] == pr_id]

    act = """mutation($task: uuid!, $d: ApprovalDecision!, $note: String) {
      act_on_task(task_id: $task, decision: $d, note: $note) { status purchase_request { approval_steps { status } } } }"""
    data = hasura(act, {"task": items[0]["task_id"], "d": "APPROVE"}, person=i[k("tp")], tenant=i["TDX"])
    assert "Không có quyền xử lý" in data["errors"][0]["message"], data

    data = hasura(act, {"task": items[0]["task_id"], "d": "APPROVE"}, person=i[k("gd")], tenant=i["TDX"])
    assert "errors" not in data, data
    result = data["data"]["act_on_task"]
    assert result["status"] == "APPROVED"
    assert [s["status"] for s in result["purchase_request"]["approval_steps"]] == ["APPROVED"]
    assert status(conn, pr_id) == "APPROVED"
    assert open_task(conn, pr_id) is None


def test_lich_su_theo_quyen_xem(hasura, conn, org):
    k = org
    i = ids(conn, "TDX", k("nv"), k("gd"))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 20_000_000)
    q = """query($id: uuid!) { wf_approval_history(where: {entity_id: {_eq: $id}}) { event } }"""
    assert hasura(q, {"id": pr_id}, person=i[k("nv")], tenant=i["TDX"])["data"]["wf_approval_history"]
    assert hasura(q, {"id": pr_id}, person=i[k("gd")], tenant=i["TDX"])["data"]["wf_approval_history"] == []


def test_mo_dun_tat_thi_bang_cua_no_bi_chan(hasura, conn):
    """Mô-đun chưa bật cho tenant (ADR #56): không đọc, không ghi bảng riêng của nó; bật lại thì như cũ."""
    i = ids(conn, "TDX", "c", "P_NV_MH_DT")
    pr_id = pr(conn, "md_hasura", "c", "P_NV_MH_DT", 5_000_000, submit=False)
    conn.execute("DELETE FROM core.tenant_module WHERE tenant_id = %s AND module IN ('ic', 'procurement')", (i["TDX"],))
    try:
        data = hasura(PR_QUERY, {"id": pr_id}, person=i["c"], tenant=i["TDX"])
        assert data["data"]["proc_purchase_request_by_pk"] is None, data
        data = hasura(INSERT_PR, {"pos": i["P_NV_MH_DT"], "amount": 1}, person=i["c"], tenant=i["TDX"])
        assert "errors" in data, data
        data = hasura(
            """mutation($id: uuid!) { submit_purchase_request(request_id: $id) { status } }""",
            {"id": pr_id},
            person=i["c"],
            tenant=i["TDX"],
        )
        assert data["errors"][0]["extensions"]["code"] == "module-disabled", data
    finally:
        conn.execute(
            "INSERT INTO core.tenant_module (tenant_id, module) VALUES (%s, 'procurement'), (%s, 'ic')",
            (i["TDX"], i["TDX"]),
        )
    data = hasura(PR_QUERY, {"id": pr_id}, person=i["c"], tenant=i["TDX"])
    assert data["data"]["proc_purchase_request_by_pk"]["id"] == pr_id
