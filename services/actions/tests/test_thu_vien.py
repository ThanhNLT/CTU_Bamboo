import uuid

import httpx
import pytest
from test_tep_dinh_kem import PDF

from conftest import ids, open_task

INSERT = (
    """mutation($o: collab_kb_document_insert_input!) { insert_collab_kb_document_one(object: $o) { id doc_no } }"""
)
UPLOAD = """mutation($id: uuid!, $size: Int!) {
  get_upload_url(entity_type: "collab.kb_document", entity_id: $id, file_name: "quy-che.pdf",
                 content_type: "application/pdf", size_bytes: $size) { attachment_id upload_url content_type } }"""
CONFIRM = """mutation($a: uuid!) { confirm_upload(attachment_id: $a) { status } }"""
SUBMIT = """mutation($id: uuid!) { submit_kb_document(id: $id) { status } }"""
ACT = """mutation($t: uuid!) { act_on_task(task_id: $t, decision: APPROVE) { status } }"""
LIBRARY = """query { kb_library { can_propose documents { id doc_no title scope version index_status can_manage
  files previous } } }"""
RETIRE = """mutation($id: uuid!, $r: String!) { retire_kb_document(id: $id, reason: $r) { status } }"""


@pytest.fixture
def library(conn):
    role = f"TL_{uuid.uuid4().hex[:8]}"
    conn.execute(
        "INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %s, 'Đề xuất tài liệu')", (role,)
    )
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, 'kb.document.create' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %s""",
        (role,),
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), id, test.id('P_NV_MH_DT'), 'UNIT' FROM core.role
           WHERE tenant_id = test.id('TDX') AND code = %s""",
        (role,),
    )
    if not conn.execute(
        "SELECT 1 FROM wf.approval_rule WHERE tenant_id = test.id('TDX') AND process_code = 'KB_DOCUMENT'"
    ).fetchone():
        conn.execute(
            """INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, valid_period)
               VALUES (test.id('TDX'), 'KB_DOCUMENT', 0, 1, tstzrange(now() - interval '1 day', NULL))"""
        )
    return ids(conn, "TDX", "c", "a", "tp_mh_dt", "P_NV_MH_DT")


def test_de_xuat_duyet_xuat_ban(hasura, conn, s3, library):
    i = library
    title = f"Quy chế thử {uuid.uuid4().hex[:6]}"
    data = hasura(
        INSERT,
        {
            "o": {
                "title": title,
                "category": "regulation",
                "scope": "group",
                "requester_position_id": i["P_NV_MH_DT"],
                "summary": "Tóm tắt",
                "toc": ["Chương 1", "Chương 2"],
            }
        },
        person=i["c"],
        tenant=i["TDX"],
    )
    assert "errors" not in data, data
    doc_id = data["data"]["insert_collab_kb_document_one"]["id"]
    assert data["data"]["insert_collab_kb_document_one"]["doc_no"].startswith("TL-")

    denied = hasura(
        INSERT,
        {"o": {"title": "X", "category": "faq", "requester_position_id": i["P_NV_MH_DT"]}},
        person=i["a"],
        tenant=i["TDX"],
    )
    assert "errors" in denied

    assert "Đính kèm tệp" in hasura(SUBMIT, {"id": doc_id}, person=i["c"], tenant=i["TDX"])["errors"][0]["message"]
    ticket = hasura(UPLOAD, {"id": doc_id, "size": len(PDF)}, person=i["c"], tenant=i["TDX"])["data"]["get_upload_url"]
    assert (
        httpx.put(ticket["upload_url"], content=PDF, headers={"Content-Type": ticket["content_type"]}).status_code
        == 200
    )
    att = ticket["attachment_id"]
    assert hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]["status"] == "CLEAN"

    assert hasura(SUBMIT, {"id": doc_id}, person=i["c"], tenant=i["TDX"])["data"]["submit_kb_document"] == {
        "status": "PENDING"
    }
    task = open_task(conn, doc_id)
    assert str(task["assignee_id"]) == i["tp_mh_dt"]
    approved = hasura(ACT, {"t": str(task["id"])}, person=i["tp_mh_dt"], tenant=i["TDX"])
    assert approved["data"]["act_on_task"]["status"] == "APPROVED", approved

    lib = hasura(LIBRARY, person=i["a"], tenant=i["TDX"])["data"]["kb_library"]
    doc = next(d for d in lib["documents"] if d["id"] == doc_id)
    assert doc["title"] == title and doc["version"] == 1 and doc["files"][0]["id"] == att
    assert doc["index_status"] in ("indexing", "indexed")
    assert doc["can_manage"] is False

    retired = hasura(RETIRE, {"id": doc_id, "r": "Hết hiệu lực"}, person=i["c"], tenant=i["TDX"])
    assert "kb.document.manage" in retired["errors"][0]["message"]
    delete = """mutation($a: uuid!) { delete_attachment(attachment_id: $a) { status } }"""
    kept = hasura(delete, {"a": att}, person=i["c"], tenant=i["TDX"])
    assert "giữ làm bằng chứng" in kept["errors"][0]["message"], "tệp của tài liệu đã xuất bản được giữ nguyên"

    late = hasura(UPLOAD, {"id": doc_id, "size": len(PDF)}, person=i["a"], tenant=i["TDX"])
    assert "Chỉ người lập thêm tệp" in late["errors"][0]["message"]
