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

import psycopg
from psycopg.rows import dict_row

from app import flow_sync
from conftest import ids, open_task, pr, status

INSERT_PR_WITH_ITEMS = """
mutation($pos: uuid!) {
  insert_proc_purchase_request_one(object: {
    requester_position_id: $pos, title: "Linh kiện thay thế", description: "Cho lô điện thoại lỗi",
    purchase_request_items: {data: [
      {description: "Chip nguồn", uom: "cái", quantity: 1000, unit_price: 12000},
      {description: "Vận chuyển", uom: "chuyến", quantity: 2, unit_price: 1500000}
    ]}
  }) { id doc_no total_amount purchase_request_items(order_by: {line_no: asc}) { line_no amount } }
}"""
ADD_ITEM = """mutation($id: uuid!) {
  insert_proc_purchase_request_item_one(object: {request_id: $id, description: "Thêm", uom: "cái",
                                                 quantity: 1, unit_price: 1}) { id } }"""


def test_de_nghi_co_dong_hang(hasura, conn):
    i = ids(conn, "TDX", "c", "d", "P_NV_MH_DT")
    data = hasura(INSERT_PR_WITH_ITEMS, {"pos": i["P_NV_MH_DT"]}, person=i["c"], tenant=i["TDX"])
    assert "errors" not in data, data
    row = data["data"]["insert_proc_purchase_request_one"]
    assert row["doc_no"].startswith("PR-")
    assert [x["line_no"] for x in row["purchase_request_items"]] == [1, 2]
    total = "query($id: uuid!) { proc_purchase_request_by_pk(id: $id) { total_amount } }"
    data = hasura(total, {"id": row["id"]}, person=i["c"], tenant=i["TDX"])
    assert data["data"]["proc_purchase_request_by_pk"]["total_amount"] == 15_000_000

    data = hasura(ADD_ITEM, {"id": row["id"]}, person=i["d"], tenant=i["TDX"])
    assert "errors" in data, "người khác không thêm được dòng hàng vào nháp của mình"

    items = "query($id: uuid!) { proc_purchase_request_item(where: {request_id: {_eq: $id}}) { id } }"
    assert hasura(items, {"id": row["id"]}, person=i["d"], tenant=i["TDX"])["data"]["proc_purchase_request_item"] == []

    data = hasura(
        """mutation($id: uuid!) { submit_purchase_request(request_id: $id) { status } }""",
        {"id": row["id"]},
        person=i["c"],
        tenant=i["TDX"],
    )
    assert data["data"]["submit_purchase_request"]["status"] == "PENDING", data
    data = hasura(ADD_ITEM, {"id": row["id"]}, person=i["c"], tenant=i["TDX"])
    assert "errors" in data, "đã gửi duyệt thì không thêm dòng hàng"


def test_huy_de_nghi(hasura, conn):
    i = ids(conn, "TDX", "c", "d")
    pr_id = pr(conn, "huy_hasura", "c", "P_NV_MH_DT", 10_000_000)
    cancel = """mutation($id: uuid!, $r: String!) { cancel_purchase_request(request_id: $id, reason: $r) { status } }"""
    data = hasura(cancel, {"id": pr_id, "r": "Không cần"}, person=i["d"], tenant=i["TDX"])
    assert "Chỉ người lập" in data["errors"][0]["message"], data
    data = hasura(cancel, {"id": pr_id, "r": "Không cần"}, person=i["c"], tenant=i["TDX"])
    assert data["data"]["cancel_purchase_request"]["status"] == "CANCELLED", data
    assert status(conn, pr_id) == "CANCELLED" and open_task(conn, pr_id) is None


def test_binh_luan_va_thong_bao(hasura, conn):
    i = ids(conn, "TDX", "c", "d", "tp_mh_dt", "a")
    pr_id = pr(conn, "binh_luan_hasura", "c", "P_NV_MH_DT", 10_000_000)

    notes = """query($id: uuid!) { collab_notification(where: {entity_id: {_eq: $id}}) { id kind read_at } }"""
    mine = hasura(notes, {"id": pr_id}, person=i["tp_mh_dt"], tenant=i["TDX"])["data"]["collab_notification"]
    assert [n["kind"] for n in mine] == ["TASK_ASSIGNED"]
    assert hasura(notes, {"id": pr_id}, person=i["d"], tenant=i["TDX"])["data"]["collab_notification"] == []

    comment = """mutation($id: uuid!, $body: String!) {
      insert_collab_comment_one(object: {entity_type: "proc.purchase_request", entity_id: $id, body: $body}) {
        id author_id } }"""
    data = hasura(comment, {"id": pr_id, "body": "Bổ sung báo giá giúp anh"}, person=i["tp_mh_dt"], tenant=i["TDX"])
    assert data["data"]["insert_collab_comment_one"]["author_id"] == i["tp_mh_dt"], data
    data = hasura(comment, {"id": pr_id, "body": "Xin xem"}, person=i["a"], tenant=i["TDX"])
    assert "Không có quyền xem" in data["errors"][0]["message"], data

    q = """query($id: uuid!) { proc_purchase_request_by_pk(id: $id) { comments { body author { full_name } } } }"""
    data = hasura(q, {"id": pr_id}, person=i["c"], tenant=i["TDX"])
    assert [c["body"] for c in data["data"]["proc_purchase_request_by_pk"]["comments"]] == ["Bổ sung báo giá giúp anh"]
    comments = """query($id: uuid!) { collab_comment(where: {entity_id: {_eq: $id}}) { id } }"""
    assert hasura(comments, {"id": pr_id}, person=i["a"], tenant=i["TDX"])["data"]["collab_comment"] == []

    mine = hasura(notes, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["collab_notification"]
    assert [n["kind"] for n in mine] == ["COMMENT"]
    mark = """mutation($ids: _uuid) { collab_mark_notifications_read(args: {ids: $ids}) { id read_at } }"""
    data = hasura(mark, {"ids": "{" + mine[0]["id"] + "}"}, person=i["d"], tenant=i["TDX"])
    assert data["data"]["collab_mark_notifications_read"] == [], "không đánh dấu thông báo của người khác"
    data = hasura(mark, {"ids": "{" + mine[0]["id"] + "}"}, person=i["c"], tenant=i["TDX"])
    assert [n["id"] for n in data["data"]["collab_mark_notifications_read"]] == [mine[0]["id"]], data


def _grant_auditor(conn, position_key: str) -> None:
    conn.execute("""
        INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'KIEM_TOAN_TEST', 'Kiểm toán')
        ON CONFLICT (tenant_id, code) DO NOTHING;
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT tenant_id, id, 'audit.read' FROM core.role WHERE code = 'KIEM_TOAN_TEST'
        ON CONFLICT DO NOTHING;""")
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
                    SELECT tenant_id, id, test.id(%s), 'TENANT' FROM core.role WHERE code = 'KIEM_TOAN_TEST'""",
        (position_key,),
    )


def test_nhat_ky_kiem_toan(hasura, conn):
    i = ids(conn, "TDX", "c", "ptgd")
    _grant_auditor(conn, "P_PTGD")
    verify = "query { verify_audit_chain { ok checked head_seq problems { seq problem } } }"
    data = hasura(verify, person=i["c"], tenant=i["TDX"])
    assert "audit.read" in data["errors"][0]["message"], data
    data = hasura(verify, person=i["ptgd"], tenant=i["TDX"])
    result = data["data"]["verify_audit_chain"]
    assert result["ok"] and result["problems"] == [] and result["checked"] == result["head_seq"] > 0, data

    logs = """query { audit_log(limit: 5, order_by: {seq: desc}) { seq table_name op actor { full_name } } }"""
    assert hasura(logs, person=i["c"], tenant=i["TDX"])["data"]["audit_log"] == []
    assert len(hasura(logs, person=i["ptgd"], tenant=i["TDX"])["data"]["audit_log"]) == 5

    grants = "query { core_v_permission_grant(distinct_on: person_id) { person_id } }"
    rows = hasura(grants, person=i["c"], tenant=i["TDX"])["data"]["core_v_permission_grant"]
    assert [r["person_id"] for r in rows] == [i["c"]], "chỉ thấy quyền của chính mình"


def test_so_do_quy_trinh(hasura, conn, flowable, database):
    i = ids(conn, "TDX", "c", "d")
    pr_id = pr(conn, "so_do_hasura", "c", "P_NV_MH_DT", 10_000_000)
    q = """query($id: uuid!) { process_state(request_id: $id) {
             status source active_activity_ids completed_activity_ids bpmn_xml } }"""

    data = hasura(q, {"id": pr_id}, person=i["d"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-found", "không xem được chứng từ thì không xem được sơ đồ"

    with psycopg.connect(database, row_factory=dict_row) as work:
        while flow_sync.run_once(work, flowable):
            pass
    state = hasura(q, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["process_state"]
    assert state["source"] == "flowable", state
    assert state["active_activity_ids"] == ["approveStep"]
    assert "submitted" in state["completed_activity_ids"]
    assert 'id="approveStep"' in state["bpmn_xml"]

    draft = pr(conn, "so_do_nhap", "c", "P_NV_MH_DT", 1, submit=False)
    state = hasura(q, {"id": draft}, person=i["c"], tenant=i["TDX"])["data"]["process_state"]
    assert state["source"] == "database" and state["active_activity_ids"] == [] and state["status"] == "DRAFT"
