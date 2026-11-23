# Bamboo - DX-OS Open-Core
# @version 0.5.2
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

"""Tác tử mức đề xuất chờ duyệt (ADR #85): hành động thành đề xuất, người nhận chấp nhận thì thực hiện dưới quyền họ."""

import json
import uuid

import psycopg
import pytest
import test_buoc_ai_quy_trinh as ba
from psycopg.rows import dict_row
from test_buoc_ai_quy_trinh import world  # noqa: F401
from test_tro_ly_ai import FakeOllama

from app import ai_agent, ai_agent_runner, ai_suggestion, main, process_automation
from app.common import ActionError, Context
from bamboo_common.ollama import Ollama
from conftest import SETTINGS, TEST_APP_DB_URL, drop_role, ids, open_task, pr, status


@pytest.fixture(scope="module")
def fake():
    server = FakeOllama()
    yield server
    server.server.shutdown()


@pytest.fixture
def clean(conn):
    conn.execute("UPDATE core.ai_agent SET status = 'inactive' WHERE cardinality(triggers) > 0")
    conn.execute("UPDATE core.ai_agent_run SET status = 'skipped' WHERE status IN ('queued', 'running')")


def session(person: str, tenant: str) -> dict:
    return {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant}


def agent(conn, owner: str, allowed, autonomy: str = "suggest", project: str | None = None, triggers=True) -> str:
    return str(
        conn.execute(
            """INSERT INTO core.ai_agent (tenant_id, name, model, created_by, tool_list, triggers, instructions,
                                          allowed_actions, autonomy, project_id)
               VALUES (test.id('TDX'), %s, 'qwen3:4b', test.id(%s), '[]', %s,
                       'Kiểm tra báo giá; thiếu thì đề nghị trả lại', %s, %s, %s)
               RETURNING id""",
            (
                f"Kiểm tra báo giá {uuid.uuid4().hex[:6]}",
                owner,
                ["purchase_request.pending"] if triggers else [],
                list(allowed),
                autonomy,
                project,
            ),
        ).fetchone()["id"]
    )


def project(conn, manager: str) -> str:
    return str(
        conn.execute(
            """INSERT INTO pm.project (tenant_id, code, name, org_unit_id, manager_id, start_date, end_date, created_by)
               VALUES (test.id('TDX'), %s, 'Chuẩn hoá báo giá', test.id('DT_MH'), test.id(%s), current_date,
                       current_date + 60, test.id(%s)) RETURNING id""",
            (f"BG-{uuid.uuid4().hex[:6].upper()}", manager, manager),
        ).fetchone()["id"]
    )


def drain(fake) -> list[str]:
    out = []
    with psycopg.connect(TEST_APP_DB_URL, row_factory=dict_row) as w:
        while (r := ai_agent_runner.run_once(w, Ollama(fake.url), SETTINGS)) is not None:
            out.append(r)
    return out


def suggestions(conn, agent_id: str) -> list[dict]:
    return conn.execute(
        "SELECT * FROM core.ai_suggestion WHERE agent_id = %s ORDER BY seq, recipient_id", (agent_id,)
    ).fetchall()


def call(fn, who: dict, args: dict):
    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        return fn(c, who, args, Context())


def decide(who: dict, sid: str, decision: str = "ACCEPT", **extra):
    return call(ai_suggestion.ai_suggestion_decide, who, {"id": sid, "decision": decision, **extra})


def test_ke_hoach_kiem_hanh_dong_chi_de_xuat():
    run = {"allowed_actions": ["return_for_info", "project_task"]}
    text = json.dumps(
        {
            "actions": [
                {"type": "return_for_info", "note": "  Thiếu báo giá thứ ba  "},
                {"type": "return_for_info", "note": "lặp"},
                {"type": "project_task", "name": "Bổ sung báo giá", "days": "3", "project_id": str(uuid.uuid4())},
                {"type": "project_task", "name": "Quá dài", "days": 91},
                {"type": "project_task", "name": "", "days": 2},
                {"type": "comment", "text": "không được phép"},
            ]
        },
        ensure_ascii=False,
    )
    plan = ai_agent_runner.parse_plan(text, run)
    assert plan["actions"] == [
        {"type": "return_for_info", "note": "Thiếu báo giá thứ ba"},
        {"type": "project_task", "name": "Bổ sung báo giá", "description": "", "days": 3},
    ], "mô hình không chọn được dự án đích; chỉ một lần trả lại mỗi kế hoạch"
    reasons = [r["reason"] for r in plan["rejected"]]
    assert "số ngày phải là số nguyên 1–90" in reasons and "tên công việc trống" in reasons
    with pytest.raises(ActionError, match="Không sửa được trường type"):
        ai_suggestion.apply_edits({"type": "comment", "text": "x"}, {"type": "webhook"})
    with pytest.raises(ActionError, match="dài tối đa 1000"):
        ai_suggestion.apply_edits({"type": "return_for_info", "note": "x"}, {"note": "y" * 1001})


def test_tra_lai_chung_tu_chi_khi_nguoi_duyet_chap_nhan(conn, hasura, fake, clean, ai_admin):
    i = ids(conn, "TDX", "c", "gd_dt")
    ag = agent(conn, "gd_dt", ["return_for_info"])
    fake.reply = json.dumps(
        {
            "assessment": "Đề nghị 80 triệu mới có 1 báo giá.",
            "risk": "high",
            "actions": [{"type": "return_for_info", "note": "Bổ sung đủ 3 báo giá theo quy chế"}],
        },
        ensure_ascii=False,
    )
    pr_id = pr(conn, f"dx_{uuid.uuid4().hex[:6]}", "c", "P_NV_MH_DT", 80_000_000)
    assert drain(fake) == ["done"]
    approver = str(open_task(conn, pr_id)["assignee_id"])
    [s] = suggestions(conn, ag)
    assert (s["status"], str(s["recipient_id"]), str(s["entity_id"])) == ("PENDING", approver, pr_id)
    assert s["action"] == {"type": "return_for_info", "note": "Bổ sung đủ 3 báo giá theo quy chế"}
    assert status(conn, pr_id) == "PENDING", "đề xuất chưa thực hiện gì"
    [run] = conn.execute("SELECT actions FROM core.ai_agent_run WHERE agent_id = %s", (ag,)).fetchall()
    assert run["actions"][0]["suggested"] is True and run["actions"][0]["suggestions"][0]["recipient_id"] == approver
    note = conn.execute(
        "SELECT recipient_id, entity_id FROM collab.notification WHERE kind = 'AI_AGENT' AND entity_id = %s", (pr_id,)
    ).fetchone()
    assert (str(note["recipient_id"]), str(note["entity_id"])) == (approver, pr_id), "người duyệt được báo kèm liên kết"

    listed = call(ai_suggestion.ai_suggestion_list, session(approver, i["TDX"]), {"entity_id": pr_id})
    assert [x["id"] for x in listed] == [str(s["id"])] and listed[0]["entity_label"]
    assert call(ai_suggestion.ai_suggestion_list, session(i["c"], i["TDX"]), {"entity_id": pr_id}) == []
    table = "query($e: uuid!) { core_ai_suggestion(where: {entity_id: {_eq: $e}}) { id } }"
    seen = hasura(table, {"e": pr_id}, person=approver, tenant=i["TDX"])["data"]["core_ai_suggestion"]
    assert [x["id"] for x in seen] == [str(s["id"])], "người nhận đọc được đề xuất qua Hasura"
    other = hasura(table, {"e": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["core_ai_suggestion"]
    assert other == [], "người khác (không quản trị AI) không đọc được đề xuất"
    via = hasura(
        "query($e: uuid) { ai_suggestion_list(entity_id: $e) { id action } }",
        {"e": pr_id},
        person=approver,
        tenant=i["TDX"],
    )
    assert [x["id"] for x in via["data"]["ai_suggestion_list"]] == [str(s["id"])], via
    with pytest.raises(ActionError) as err:
        decide(session(i["c"], i["TDX"]), str(s["id"]))
    assert err.value.status == 403, "chỉ người nhận chấp nhận được"

    out = decide(session(approver, i["TDX"]), str(s["id"]), edits={"note": "Bổ sung báo giá thứ hai và thứ ba"})
    assert out["status"] == "ACCEPTED" and out["result"]["status"] == "RETURNED"
    assert status(conn, pr_id) == "RETURNED"
    history = conn.execute(
        "SELECT person_id, detail FROM wf.approval_history WHERE entity_id = %s AND detail ? 'note' ORDER BY id DESC",
        (pr_id,),
    ).fetchone()
    assert history["detail"]["note"] == "[Đề xuất AI] Bổ sung báo giá thứ hai và thứ ba"
    assert str(history["person_id"]) == approver, "thực hiện dưới quyền người chấp nhận"
    with pytest.raises(ActionError) as err:
        decide(session(approver, i["TDX"]), str(s["id"]))
    assert err.value.code == "conflict", "chấp nhận hai lần không thực hiện hai lần"

    stats = {r["agent_id"]: r for r in call(ai_agent.ai_agent_stats, session(i["gd_dt"], i["TDX"]), {})}
    assert stats[ag]["suggestions_accepted"] == 1 and stats[ag]["acceptance_rate"] == 1.0


@pytest.fixture
def ai_admin(conn):
    """gd_dt có core.ai.manage trong lúc chạy test; gỡ sau đó để không ảnh hưởng test khác."""
    conn.execute("""
        INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'QT_AI_GD', 'Quản trị AI')
        ON CONFLICT (tenant_id, code) DO NOTHING;
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT tenant_id, id, 'core.ai.manage' FROM core.role WHERE code = 'QT_AI_GD' ON CONFLICT DO NOTHING;
        INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
        SELECT r.tenant_id, r.id, test.id('P_GD_DT'), 'TENANT' FROM core.role r WHERE r.code = 'QT_AI_GD'
          AND NOT EXISTS (SELECT 1 FROM core.role_grant g WHERE g.role_id = r.id);""")
    yield
    drop_role(conn.cursor(), "QT_AI_GD")


def test_chung_tu_da_duyet_thi_de_xuat_het_han(conn, fake, clean):
    i = ids(conn, "TDX", "c", "tp_mh_dt")
    ag = agent(conn, "tp_mh_dt", ["return_for_info", "comment"])
    fake.reply = json.dumps(
        {
            "assessment": "Thiếu báo giá",
            "actions": [
                {"type": "return_for_info", "note": "Bổ sung báo giá"},
                {"type": "comment", "text": "Đề nghị cần thêm báo giá."},
            ],
        },
        ensure_ascii=False,
    )
    pr_id = pr(conn, f"hh_{uuid.uuid4().hex[:6]}", "c", "P_NV_MH_DT", 2_000_000)
    assert drain(fake) == ["done"]
    task = open_task(conn, pr_id)
    approver = str(task["assignee_id"])
    by_type = {s["action"]["type"]: s for s in suggestions(conn, ag)}
    assert str(by_type["comment"]["recipient_id"]) == i["tp_mh_dt"], "bình luận đề xuất cho người phụ trách tác tử"
    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        main.act_on_task(c, session(approver, i["TDX"]), str(task["id"]), "APPROVE", None)
    listed = call(ai_suggestion.ai_suggestion_list, session(approver, i["TDX"]), {"entity_id": pr_id})
    assert "return_for_info" not in [x["action"]["type"] for x in listed], "đề xuất trả lại hết hạn khi đọc"
    with pytest.raises(ActionError, match="hết hạn") as err:
        decide(session(approver, i["TDX"]), str(by_type["return_for_info"]["id"]))
    assert err.value.code == "conflict"
    assert status(conn, pr_id) == "APPROVED"

    out = decide(session(i["tp_mh_dt"], i["TDX"]), str(by_type["comment"]["id"]), edits={"text": "Lưu ý báo giá."})
    assert out["status"] == "ACCEPTED"
    comment = conn.execute(
        "SELECT author_id, body FROM collab.comment WHERE entity_id = %s ORDER BY created_at DESC LIMIT 1", (pr_id,)
    ).fetchone()
    assert str(comment["author_id"]) == i["tp_mh_dt"] and comment["body"].endswith("Lưu ý báo giá.")


def test_tao_viec_du_an_va_quan_ly_mat_quyen_thi_that_bai(conn, fake, clean):
    i = ids(conn, "TDX", "c", "gd_dt", "tp_mh_dt")
    proj = project(conn, "tp_mh_dt")
    ag = agent(conn, "tp_mh_dt", ["project_task"], project=proj)
    fake.reply = json.dumps(
        {
            "assessment": "Cần chuẩn hoá mẫu báo giá",
            "actions": [
                {"type": "project_task", "name": "Lập mẫu báo giá chuẩn", "description": "3 nhà cung cấp", "days": 5}
            ],
        },
        ensure_ascii=False,
    )
    pr(conn, f"da_{uuid.uuid4().hex[:6]}", "c", "P_NV_MH_DT", 2_000_000)
    pr(conn, f"da2_{uuid.uuid4().hex[:6]}", "c", "P_NV_MH_DT", 3_000_000)
    assert drain(fake) == ["done", "done"]
    first, second = suggestions(conn, ag)
    assert {str(first["recipient_id"]), str(second["recipient_id"])} == {i["tp_mh_dt"]}, "người nhận là quản lý dự án"
    assert first["action"]["project_id"] == proj

    manager = session(i["tp_mh_dt"], i["TDX"])
    out = decide(manager, str(first["id"]), edits={"days": 10})
    assert out["status"] == "ACCEPTED"
    task = conn.execute("SELECT * FROM pm.task WHERE id = %s", (out["result"]["id"],)).fetchone()
    assert str(task["project_id"]) == proj and task["name"] == "Lập mẫu báo giá chuẩn"
    assert (task["end_date"] - task["start_date"]).days == 9 and task["assignee_id"] is None
    assert task["description"].startswith("3 nhà cung cấp") and "Nguồn: " in task["description"]

    conn.execute("UPDATE pm.project SET manager_id = test.id('c') WHERE id = %s", (proj,))
    conn.execute("DELETE FROM pm.member WHERE project_id = %s AND person_id = test.id('tp_mh_dt')", (proj,))
    count = conn.execute("SELECT count(*) AS n FROM pm.task WHERE project_id = %s", (proj,)).fetchone()["n"]
    out = decide(manager, str(second["id"]))
    assert out["status"] == "FAILED" and out["reason"], "mất quyền quản lý: ghi lý do"
    assert conn.execute("SELECT count(*) AS n FROM pm.task WHERE project_id = %s", (proj,)).fetchone()["n"] == count


def test_hanh_dong_chi_de_xuat_bi_chan_o_muc_khac(conn, ai_admin):
    i = ids(conn, "TDX", "gd_dt")
    ag = agent(conn, "gd_dt", ["comment"], autonomy="act", triggers=False)
    proj = project(conn, "gd_dt")
    who = session(i["gd_dt"], i["TDX"])
    base = {"id": ag, "triggers": [], "instructions": "Kiểm tra", "allowed_actions": ["return_for_info"]}
    for autonomy in ("act", "dry_run"):
        with pytest.raises(ActionError, match="chỉ bật được ở mức Đề xuất"):
            call(ai_agent.ai_agent_automation, who, {**base, "autonomy": autonomy})
    with pytest.raises(ActionError, match="Thiếu dự án đích"):
        call(ai_agent.ai_agent_automation, who, {**base, "autonomy": "suggest", "allowed_actions": ["project_task"]})
    with pytest.raises(ActionError, match="Không tìm thấy dự án"):
        call(
            ai_agent.ai_agent_automation,
            who,
            {**base, "autonomy": "suggest", "allowed_actions": ["project_task"], "project_id": str(uuid.uuid4())},
        )
    out = call(
        ai_agent.ai_agent_automation,
        who,
        {**base, "autonomy": "suggest", "allowed_actions": ["return_for_info", "project_task"], "project_id": proj},
    )
    assert out["autonomy"] == "suggest" and out["project_id"] == proj
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE core.ai_agent SET autonomy = 'act' WHERE id = %s", (ag,))
    opts = call(ai_agent.ai_agent_trigger_options, who, {})
    assert {"code": "suggest", "label": "Đề xuất, chờ người chấp nhận"} in opts["autonomy"]
    assert [a["code"] for a in opts["actions"] if a["suggest_only"]] == ["return_for_info", "project_task"]


def _step(conn, run: str, ag: str, pr_id: str):
    instance = conn.execute("SELECT flowable_instance_id FROM wf.automation_run WHERE id = %s", (run,)).fetchone()
    job = {"elementId": "danh_gia", "processInstanceId": instance["flowable_instance_id"]}
    params = {"action": "ai", "agent": ag, "task": "Kiểm tra báo giá của đề nghị"}
    variables = {"event": "purchase_request.pending", "entity_id": pr_id}
    return process_automation.exec_ai(conn, SETTINGS, run, job, params, variables)


@pytest.mark.parametrize("autonomy", ["act", "suggest"])
def test_buoc_ai_trong_quy_trinh_theo_muc_tu_chu(conn, world, fake, clean, autonomy):  # noqa: F811
    i = ids(conn, "c", "tp_mh_dt")
    pr_id = pr(conn, f"bpmn_{uuid.uuid4().hex[:6]}", "c", "P_NV_MH_DT", 2_000_000)
    drain(fake)
    allowed = ["comment"] if autonomy == "act" else ["return_for_info"]
    ag = agent(conn, "tp_mh_dt", allowed, autonomy=autonomy, triggers=False)
    run = ba._automation_run(conn, world)
    with pytest.raises(process_automation.Pending):
        _step(conn, run, ag, pr_id)
    fake.reply = json.dumps(
        {
            "assessment": "Thiếu báo giá",
            "risk": "medium",
            "actions": [{"type": "comment", "text": "Cần đủ báo giá."}, {"type": "return_for_info", "note": "Bổ sung"}],
        },
        ensure_ascii=False,
    )
    assert drain(fake) == ["done"]
    assert _step(conn, run, ag, pr_id)["danh_gia_risk"] == "medium"
    comment = conn.execute(
        "SELECT author_id FROM collab.comment WHERE entity_id = %s AND body LIKE '%%Cần đủ báo giá.'", (pr_id,)
    ).fetchone()
    if autonomy == "act":
        assert comment and str(comment["author_id"]) == i["tp_mh_dt"], "bước AI mức act thực hiện ngay"
        assert suggestions(conn, ag) == []
    else:
        assert comment is None, "bước AI mức suggest không tự thực hiện"
        [s] = suggestions(conn, ag)
        assert s["action"]["type"] == "return_for_info"
        assert str(s["recipient_id"]) == str(open_task(conn, pr_id)["assignee_id"])
        assert status(conn, pr_id) == "PENDING"
