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

import pathlib
import uuid

import pytest
from fastapi.testclient import TestClient

from app import config, main, process_design
from conftest import SETTINGS, ids

SAMPLE = (
    pathlib.Path(__file__).resolve().parents[3] / "infra/platform/flowable/purchase_request.bpmn20.xml"
).read_text(encoding="utf-8")
NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn"'


def bpmn(body: str) -> str:
    return f'<definitions {NS}><process id="p" isExecutable="true">{body}</process></definitions>'


def test_kiem_tra_luat():
    assert process_design.lint("<khong-phai-xml")[0]["message"].startswith("XML không hợp lệ")
    issues = process_design.lint(
        bpmn(
            '<startEvent id="s"/><exclusiveGateway id="g"/><userTask id="t" name="Duyệt" flowable:dueDate="2 ngày"/>'
            '<endEvent id="e"/><serviceTask id="x" name="Gửi"/>'
            '<sequenceFlow id="f1" sourceRef="s" targetRef="g"/><sequenceFlow id="f2" sourceRef="g" targetRef="t"/>'
            '<sequenceFlow id="f3" sourceRef="g" targetRef="e"/><sequenceFlow id="f4" sourceRef="t" targetRef="e"/>'
            '<sequenceFlow id="f5" sourceRef="x" targetRef="e"/>'
        )
    )
    messages = {(i["level"], i["element_id"]) for i in issues}
    assert ("error", "f2") in messages and ("error", "f3") in messages, "nhánh rẽ thiếu điều kiện"
    assert ("error", "t") in messages, "hạn xử lý không phải ISO-8601"
    assert ("warning", "t") in messages, "tác vụ chưa có người nhận"
    assert ("error", "x") in messages, "tác vụ dịch vụ chưa có cách thực thi"
    assert ("warning", "x") in messages or ("error", "x") in messages, "không tới được từ điểm bắt đầu"
    assert process_design.lint(SAMPLE) == [i for i in process_design.lint(SAMPLE) if i["level"] == "warning"], (
        "quy trình mẫu không có lỗi"
    )


def test_ban_sandbox_khong_goi_ma_that():
    xml = process_design.sandbox_xml(
        bpmn(
            '<startEvent id="s"/><serviceTask id="x" name="Gửi" flowable:class="vn.bamboo.Mail"/>'
            '<scriptTask id="y" scriptFormat="groovy"><script>System.exit(1)</script></scriptTask><endEvent id="e"/>'
            '<sequenceFlow id="a" sourceRef="s" targetRef="x"/><sequenceFlow id="b" sourceRef="x" targetRef="y"/>'
            '<sequenceFlow id="c" sourceRef="y" targetRef="e"/>'
        ),
        "sandbox_p_1",
    )
    assert 'id="sandbox_p_1"' in xml and "vn.bamboo.Mail" not in xml and "System.exit" not in xml
    assert "scriptTask" not in xml


@pytest.fixture
def designer(conn, org):
    role = f"TKQT_{uuid.uuid4().hex[:8]}"
    params = {"r": role, "p": org("P_GD")}
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %(r)s, 'Thiết kế')", params)
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, 'wf.process.design' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), id, test.id(%(p)s), 'TENANT' FROM core.role
           WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    return ids(conn, org("gd"), org("nv"), "TDX") | {"k": org}


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


def test_luu_phat_hanh_chay_thu(client, designer, flowable):
    k = designer["k"]
    gd, nv, tenant = designer[k("gd")], designer[k("nv")], designer["TDX"]
    key = f"thu_{uuid.uuid4().hex[:8]}"
    args = {
        "process_key": key,
        "name": "Quy trình thử",
        "bpmn_xml": SAMPLE,
        "forms": [{"key": "duyet", "name": "Duyệt", "fields": [{"label": "Ý kiến", "type": "text"}]}],
    }

    r = call(client, "process_model_save", args, nv, tenant)
    assert r.status_code == 403, "chuyên viên không có quyền thiết kế"
    r = call(client, "process_model_save", args, gd, tenant)
    assert r.status_code == 200, r.text
    model_id = r.json()["id"]
    assert all(i["level"] == "warning" for i in r.json()["issues"])

    hidden = call(client, "process_model_get", {"id": model_id}, nv, tenant)
    assert hidden.status_code == 404, "bản nháp chưa phát hành: nhân viên không thấy"

    run = call(client, "process_sandbox_run", {"id": model_id, "variables": {"decision": "APPROVE"}}, gd, tenant)
    assert run.status_code == 200, run.text
    result = run.json()
    assert result["status"] == "COMPLETED", result
    visited = [s["activity_id"] for s in result["steps"]]
    assert visited[0] == "submitted" and "approveStep" in visited and visited[-1] == "approved", visited
    assert not flowable.deployments_named(f"sandbox-{tenant}-{result['id'].replace('-', '')[:8]}"), "đã dọn deployment"

    rejected = call(client, "process_sandbox_run", {"id": model_id, "variables": {"decision": "REJECT"}}, gd, tenant)
    assert rejected.json()["steps"][-1]["activity_id"] == "rejected"

    pub = call(client, "process_model_publish", {"id": model_id, "note": "Bản đầu"}, gd, tenant)
    assert pub.status_code == 200 and pub.json()["version"] == 1, pub.text
    detail = call(client, "process_model_get", {"id": model_id}, nv, tenant).json()
    assert detail["access"] == "view" and f'id="{key}"' in detail["bpmn_xml"], "nhân viên xem được sơ đồ đã phát hành"
    assert detail["forms"] == [] and detail["issues"] == [] and detail["runs"] == [], "nhưng không thấy phần thiết kế"
    again = call(client, "process_model_publish", {"id": model_id}, gd, tenant)
    assert again.status_code == 400 and "giống hệt" in again.json()["message"]

    listing = call(client, "process_models", {}, nv, tenant).json()
    mine = next(m for m in listing["models"] if m["id"] == model_id)
    assert (mine["published_version"], mine["runs"], mine["last_run_status"]) == (1, 2, "COMPLETED")
    assert listing["can_design"] is False


def test_chay_thu_loi_deploy_duoc_ghi_lai(client, designer, flowable):
    k = designer["k"]
    gd, tenant = designer[k("gd")], designer["TDX"]
    broken = bpmn(
        '<startEvent id="s"/><exclusiveGateway id="g" default="d"/><endEvent id="e1"/><endEvent id="e2"/>'
        '<sequenceFlow id="a" sourceRef="s" targetRef="g"/>'
        '<sequenceFlow id="c" sourceRef="g" targetRef="e1"><conditionExpression>${bien_khong_ton_tai &gt; 1}'
        "</conditionExpression></sequenceFlow>"
        '<sequenceFlow id="d" sourceRef="g" targetRef="e2"/>'
    )
    model = call(
        client,
        "process_model_save",
        {"process_key": f"loi_{uuid.uuid4().hex[:6]}", "name": "Lỗi", "bpmn_xml": broken},
        gd,
        tenant,
    ).json()
    run = call(client, "process_sandbox_run", {"id": model["id"]}, gd, tenant).json()
    assert run["status"] == "FAILED" and run["error"], run


def test_kiem_tra_cong_va_su_kien():
    issues = process_design.lint(
        bpmn(
            '<startEvent id="s"/><exclusiveGateway id="g" default="zz"/><parallelGateway id="p"/>'
            '<userTask id="a" name="A" flowable:assignee="x"/><userTask id="b" name="B" flowable:assignee="x"/>'
            '<endEvent id="e"/>'
            '<sequenceFlow id="f0" sourceRef="e" targetRef="s"/>'
            '<sequenceFlow id="f1" sourceRef="s" targetRef="g"/><sequenceFlow id="f2" sourceRef="g" targetRef="p"/>'
            '<sequenceFlow id="f3" sourceRef="p" targetRef="a"/><sequenceFlow id="f4" sourceRef="p" targetRef="b"/>'
            '<sequenceFlow id="f5" sourceRef="a" targetRef="e"/><sequenceFlow id="f6" sourceRef="b" targetRef="e"/>'
        )
    )
    got = {(i["level"], i["element_id"]) for i in issues}
    assert ("error", "s") in got, "bắt đầu có luồng vào"
    assert ("error", "e") in got, "kết thúc có luồng ra"
    assert ("warning", "g") in got, "cổng một vào một ra"
    assert any("song song" in i["message"] for i in issues), "tách song song không có gộp"


def test_bien_chay_thu():
    variables, per_task = process_design._sandbox_inputs(
        {"decision": "REJECT", "amount": 5, "task_decisions": {"approveStep": "RETURN"}}
    )
    assert variables["decision"] == "REJECT" and variables["amount"] == 5 and variables["stepCount"] == 1
    assert per_task == {"approveStep": "RETURN"}
    for bad in (
        {"decision": "MAYBE"},
        {"initiator": "x"},
        {"co dau cach": 1},
        {"x": {"long": 1}},
        {"task_decisions": {"t": "XYZ"}},
        {f"v{i}": i for i in range(25)},
    ):
        with pytest.raises(process_design.ActionError):
            process_design._sandbox_inputs(bad)


def test_chay_thu_theo_tac_vu_xoa_va_xem_phien_ban(client, designer, flowable):
    k = designer["k"]
    gd, tenant = designer[k("gd")], designer["TDX"]
    key = f"tv_{uuid.uuid4().hex[:8]}"
    model = call(client, "process_model_save", {"process_key": key, "name": "Thử bước", "bpmn_xml": SAMPLE}, gd, tenant)
    model_id = model.json()["id"]

    run = call(
        client,
        "process_sandbox_run",
        {"id": model_id, "variables": {"decision": "APPROVE", "task_decisions": {"approveStep": "REJECT"}}},
        gd,
        tenant,
    ).json()
    assert run["status"] == "COMPLETED" and run["steps"][-1]["activity_id"] == "rejected", run
    bad = call(client, "process_sandbox_run", {"id": model_id, "variables": {"decision": "??"}}, gd, tenant)
    assert bad.status_code == 400

    assert call(client, "process_version_get", {"id": model_id, "version": 1}, gd, tenant).status_code == 404
    call(client, "process_model_publish", {"id": model_id}, gd, tenant)
    v1 = call(client, "process_version_get", {"id": model_id, "version": 1}, gd, tenant).json()
    assert v1["version"] == 1 and f'id="{key}"' in v1["bpmn_xml"]
    blocked = call(client, "process_model_delete", {"id": model_id}, gd, tenant)
    assert blocked.status_code == 400 and "đã phát hành" in blocked.json()["message"]

    args = {"process_key": f"{key}x", "name": "Nháp", "bpmn_xml": SAMPLE}
    draft = call(client, "process_model_save", args, gd, tenant)
    gone = call(client, "process_model_delete", {"id": draft.json()["id"]}, gd, tenant)
    assert gone.status_code == 200 and gone.json()["id"] == draft.json()["id"]
    assert call(client, "process_model_get", {"id": draft.json()["id"]}, gd, tenant).status_code == 404


def test_chan_bieu_thuc_nguy_hiem_va_bo_lang_nghe():
    issues = process_design.lint(
        bpmn(
            '<startEvent id="s"/><exclusiveGateway id="g" default="f3"/><endEvent id="e"/>'
            '<userTask id="t" name="Duyệt" flowable:assignee="${execution.getProcessEngineConfiguration()}">'
            '<extensionElements><flowable:executionListener event="start" expression="${execution.setVariable(\'a\', 1)}"/>'
            "</extensionElements></userTask>"
            '<sequenceFlow id="f1" sourceRef="s" targetRef="g"/>'
            '<sequenceFlow id="f2" sourceRef="g" targetRef="t"><conditionExpression>${\'\'.getClass().forName(\'x\')}'
            "</conditionExpression></sequenceFlow>"
            '<sequenceFlow id="f3" sourceRef="g" targetRef="e"/><sequenceFlow id="f4" sourceRef="t" targetRef="e"/>'
        )
    )
    errors = [i["message"] for i in issues if i["level"] == "error"]
    assert any("Bộ lắng nghe" in m for m in errors), "listener có thể gọi phương thức nên bị chặn"
    assert any("Điều kiện của luồng" in m for m in errors), "điều kiện gọi phương thức bị chặn"
    assert any("assignee" in m for m in errors), "biểu thức người nhận gọi phương thức bị chặn"
    for ok in ("${decision == 'APPROVE'}", "${stepIndex + 1 < stepCount}", "${amount > 5 && !empty owner}", "PT48H"):
        assert process_design.unsafe_expression(ok) is None, ok
    stripped = process_design.sandbox_xml(
        bpmn(
            '<startEvent id="s"><extensionElements><flowable:executionListener event="start" expression="${x}"/>'
            '</extensionElements></startEvent><endEvent id="e"/><sequenceFlow id="a" sourceRef="s" targetRef="e"/>'
        ),
        "sandbox_p_2",
    )
    assert "executionListener" not in stripped, "bản sandbox gỡ mọi listener"
