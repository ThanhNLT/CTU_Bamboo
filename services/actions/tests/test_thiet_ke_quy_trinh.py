# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Thiết kế quy trình (ADR #47): kiểm tra BPMN, lưu bản nháp, phát hành phiên bản, chạy thử sandbox trên Flowable."""

# ===== Thư viện chuẩn =====
import pathlib
import uuid

# ===== Thư viện bên ngoài =====
import pytest  # pytest
from fastapi.testclient import TestClient  # FastAPI

# ===== Module nội bộ =====
from app import config, main, process_design
from conftest import SETTINGS, ids

# ===== Hằng số & cấu hình =====
SAMPLE = (pathlib.Path(__file__).resolve().parents[3] / "platform/flowable/purchase_request.bpmn20.xml").read_text(
    encoding="utf-8"
)
NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn"'


def bpmn(body: str) -> str:
    return f'<definitions {NS}><process id="p" isExecutable="true">{body}</process></definitions>'


# ===== Không cần dịch vụ ngoài =====


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


# ===== Flowable + CSDL thật =====


@pytest.fixture
def designer(conn, org):
    """Giám đốc công ty con của kiểm thử giữ vai trò thiết kế quy trình cả tenant."""
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

    detail = call(client, "process_model_get", {"id": model_id}, nv, tenant).json()
    assert f'id="{key}"' in detail["bpmn_xml"] and detail["forms"][0]["key"] == "duyet"

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
        '<startEvent id="s"/><userTask id="t" name="Duyệt" flowable:assignee="x"/><endEvent id="e"/>'
        '<sequenceFlow id="a" sourceRef="s" targetRef="t"/><sequenceFlow id="b" sourceRef="t" targetRef="e">'
        "<conditionExpression>${khong hop le</conditionExpression></sequenceFlow>"
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
