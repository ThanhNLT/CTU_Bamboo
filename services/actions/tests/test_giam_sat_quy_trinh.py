# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import json
import pathlib
import time
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from app import process_automation, process_design
from app.common import ActionError, Context
from conftest import ids

SAMPLE = (
    pathlib.Path(__file__).resolve().parents[3] / "infra/platform/flowable/purchase_request.bpmn20.xml"
).read_text(encoding="utf-8")


@pytest.fixture
def app_conn(database):
    with psycopg.connect(database, autocommit=True) as c:
        yield c


@pytest.fixture
def world(conn, org):
    """tp: trưởng phòng được thiết kế trong phòng mình; gd: giám đốc công ty chỉ giám sát; nv: nhân viên."""
    sfx = uuid.uuid4().hex[:8]
    for code, perm, grant in (
        (f"TK_{sfx}", "wf.process.design", ("P_TP", "SUBTREE")),
        (f"GS_{sfx}", "wf.process.review", ("P_GD", "TENANT")),
    ):
        conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %s, %s)", (code, code))
        conn.execute(
            """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
               SELECT tenant_id, id, %s FROM core.role WHERE tenant_id = test.id('TDX') AND code = %s""",
            (perm, code),
        )
        position, scope = grant
        conn.execute(
            """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope, scope_unit_id)
               SELECT test.id('TDX'), r.id, test.id(%s), %s, CASE WHEN %s = 'SUBTREE' THEN test.id(%s) END
               FROM core.role r WHERE r.tenant_id = test.id('TDX') AND r.code = %s""",
            (org(position), scope, scope, org("PHONG"), code),
        )
    found = ids(conn, org("tp"), org("gd"), org("nv"), org("PHONG"), org("CTY"), "TDX")
    return {
        "tp": found[org("tp")],
        "gd": found[org("gd")],
        "nv": found[org("nv")],
        "unit": found[org("PHONG")],
        "company": found[org("CTY")],
        "tenant": found["TDX"],
    }


def session(person: str, tenant: str) -> dict:
    return {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant}


def test_trinh_tu_thiet_ke_phat_hanh_giam_sat(app_conn, world):
    t = world["tenant"]
    tp, gd, nv = (session(world[k], t) for k in ("tp", "gd", "nv"))
    save = {
        "process_key": f"gs_{uuid.uuid4().hex[:8]}",
        "name": "Quy trình phòng",
        "bpmn_xml": SAMPLE,
        "owner_unit_id": world["unit"],
    }
    for outsider in (nv, gd):
        with pytest.raises(ActionError) as err:
            process_design.process_model_save(app_conn, outsider, save, None)
        assert err.value.status == 403, "chỉ người có quyền thiết kế tại đơn vị mới tạo được"
    model = process_design.process_model_save(app_conn, tp, save, None)["id"]

    assert process_design.process_models(app_conn, nv, {}, None)["models"] == [] or model not in {
        m["id"] for m in process_design.process_models(app_conn, nv, {}, None)["models"]
    }, "nhân viên chưa thấy bản nháp"
    with pytest.raises(ActionError) as err:
        process_design.process_model_get(app_conn, nv, {"id": model}, None)
    assert err.value.status == 404
    listing = process_design.process_models(app_conn, tp, {}, None)
    assert listing["can_design"] and any(u["id"] == world["unit"] for u in listing["design_units"])

    with pytest.raises(ActionError):
        process_design.process_model_publish(app_conn, tp, {"id": model, "audience": "KHAC"}, None)
    published = process_design.process_model_publish(
        app_conn, tp, {"id": model, "audience": "UNIT", "note": "Bản đầu"}, None
    )
    assert published["version"] == 1 and published["audience"] == "UNIT"
    assert published["notified"] == 1, "chỉ chuyên viên trong phòng được báo (trưởng phòng là người phát hành)"
    kinds = app_conn.execute(
        "SELECT kind, title FROM collab.notification WHERE recipient_id = %s ORDER BY created_at DESC", (world["nv"],)
    ).fetchone()
    assert kinds[0] == "PROCESS_PUBLISHED" and "Quy trình phòng" in kinds[1]

    view = process_design.process_model_get(app_conn, nv, {"id": model}, None)
    assert view["access"] == "view" and view["viewing_version"] == 1 and view["forms"] == [] and view["versions"] == []
    with pytest.raises(ActionError) as err:
        process_design.process_model_save(app_conn, nv, {**save, "id": model}, None)
    assert err.value.status == 403
    with pytest.raises(ActionError):
        process_design.process_change_request_create(app_conn, nv, {"id": model, "message": "Sửa giúp"}, None)

    with pytest.raises(ActionError) as err:
        process_design.process_model_get(app_conn, gd, {"id": model}, None)
    assert err.value.status == 404
    wider = process_design.process_model_publish(app_conn, tp, {"id": model, "audience": "COMPANY"}, None)
    assert wider["version"] == 2 and wider["notified"] == 2
    review = process_design.process_model_get(app_conn, gd, {"id": model}, None)
    assert review["access"] == "review" and review["viewing_version"] == 2 and len(review["versions"]) == 2

    request_id = process_design.process_change_request_create(
        app_conn, gd, {"id": model, "message": "Thêm bước pháp chế trước khi duyệt"}, None
    )["id"]
    assert (
        app_conn.execute(
            "SELECT count(*) FROM collab.notification WHERE recipient_id = %s AND kind = 'PROCESS_CHANGE_REQUESTED'",
            (world["tp"],),
        ).fetchone()[0]
        == 1
    )
    assert [
        r["id"] for r in process_design.process_model_get(app_conn, gd, {"id": model}, None)["change_requests"]
    ] == [request_id]
    assert len(process_design.process_model_get(app_conn, tp, {"id": model}, None)["change_requests"]) == 1
    with pytest.raises(ActionError) as err:
        process_design.process_change_request_resolve(app_conn, gd, {"id": request_id}, None)
    assert err.value.status == 403, "người giám sát không tự xử lý yêu cầu của mình"
    process_design.process_change_request_resolve(app_conn, tp, {"id": request_id, "note": "Đã thêm bước"}, None)
    assert (
        app_conn.execute(
            "SELECT count(*) FROM collab.notification WHERE recipient_id = %s AND kind = 'PROCESS_CHANGE_RESOLVED'",
            (world["gd"],),
        ).fetchone()[0]
        == 1
    )
    with pytest.raises(ActionError):
        process_design.process_change_request_resolve(app_conn, tp, {"id": request_id}, None)


NS = (
    'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" '
    'xmlns:bamboo="http://bamboo.local/bpmn" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
)


def auto_bpmn(start: str = '<startEvent id="s"/>', audience: str = "UNIT") -> str:
    return f"""<definitions {NS}><process id="p" name="Nhắc việc" isExecutable="true">
  {start}
  <serviceTask id="n1" name="Nhắc cả phòng" bamboo:action="notify" bamboo:audience="{audience}"
               bamboo:message="Nhớ cập nhật tiến độ tuần này"/>
  <exclusiveGateway id="g" default="d"/>
  <endEvent id="big" name="Lớn"/><endEvent id="small" name="Nhỏ"/>
  <sequenceFlow id="a" sourceRef="s" targetRef="n1"/><sequenceFlow id="b" sourceRef="n1" targetRef="g"/>
  <sequenceFlow id="c" sourceRef="g" targetRef="big">
    <conditionExpression xsi:type="tFormalExpression">${{amount &gt; 5}}</conditionExpression></sequenceFlow>
  <sequenceFlow id="d" sourceRef="g" targetRef="small"/>
</process></definitions>"""


def test_chuyen_doi_sang_dinh_nghia_tu_dong():
    xml, actions, problems = process_automation.automation_xml(auto_bpmn(), "auto_x_p")
    assert problems == [] and actions["n1"] == {
        "action": "notify",
        "audience": "UNIT",
        "message": "Nhớ cập nhật tiến độ tuần này",
    }
    assert 'flowable:type="external-worker"' in xml and 'flowable:topic="bamboo.notify"' in xml

    user_task = auto_bpmn().replace("<exclusiveGateway", '<userTask id="u" name="Duyệt"/><exclusiveGateway')
    assert any("cần người thao tác" in p for p in process_automation.automation_xml(user_task, "auto_x_p")[2])
    no_action = auto_bpmn().replace('bamboo:action="notify"', "")
    assert any("chưa chọn hành động" in p for p in process_automation.automation_xml(no_action, "auto_x_p")[2])
    evil = auto_bpmn().replace("${amount &gt; 5}", "${execution.setVariable('a', 1)}")
    assert any("Điều kiện" in p for p in process_automation.automation_xml(evil, "auto_x_p")[2])
    fast = auto_bpmn(
        '<startEvent id="s"><timerEventDefinition><timeCycle>R/PT10S</timeCycle></timerEventDefinition></startEvent>'
    )
    assert any("tối thiểu" in p for p in process_automation.automation_xml(fast, "auto_x_p")[2])
    hourly = auto_bpmn(
        '<startEvent id="s"><timerEventDefinition><timeCycle>R/PT1H</timeCycle></timerEventDefinition></startEvent>'
    )
    assert process_automation.automation_xml(hourly, "auto_x_p")[2] == []
    assert (
        process_automation.cycle_seconds("R3/P1DT2H") == 93600 and process_automation.cycle_seconds("every day") is None
    )


def _publish(app_conn, tp, world, xml):
    model = process_design.process_model_save(
        app_conn,
        tp,
        {
            "process_key": f"tu_dong_{uuid.uuid4().hex[:8]}",
            "name": "Nhắc việc",
            "bpmn_xml": xml,
            "owner_unit_id": world["unit"],
        },
        None,
    )["id"]
    process_design.process_model_publish(app_conn, tp, {"id": model, "audience": "UNIT"}, None)
    return model


def _tick_until(database, flowable, predicate, seconds=20):
    deadline = time.monotonic() + seconds
    with psycopg.connect(database, row_factory=dict_row) as worker:
        while time.monotonic() < deadline:
            process_automation.tick(worker, flowable)
            worker.commit()
            if predicate():
                return True
            time.sleep(1)
    return False


def test_bat_chay_tu_dong_khoi_chay_va_he_thong_tu_xu_ly(app_conn, database, world, flowable):
    t = world["tenant"]
    tp, nv = session(world["tp"], t), session(world["nv"], t)
    ctx = Context(flowable=flowable)
    model = _publish(app_conn, tp, world, auto_bpmn())

    with pytest.raises(ActionError) as err:
        process_automation.process_automation_start(app_conn, tp, {"id": model}, ctx)
    assert "chưa bật chạy tự động" in err.value.message
    with pytest.raises(ActionError) as err:
        process_automation.process_automation_enable(app_conn, nv, {"id": model}, ctx)
    assert err.value.status == 403

    enabled = process_automation.process_automation_enable(app_conn, tp, {"id": model}, ctx)
    assert enabled["status"] == "ACTIVE" and enabled["version"] == 1
    with pytest.raises(ActionError) as err:
        process_automation.process_automation_start(app_conn, nv, {"id": model, "variables": {"amount": 9}}, ctx)
    assert err.value.status == 403, "nhân viên chỉ xem, không khởi chạy được"
    assert "người thiết kế" in err.value.message
    with pytest.raises(ActionError):
        process_automation.process_automation_start(
            app_conn, tp, {"id": model, "variables": {"execution": {"a": 1}}}, ctx
        )

    run = process_automation.process_automation_start(app_conn, tp, {"id": model, "variables": {"amount": 9}}, ctx)[
        "id"
    ]
    done = _tick_until(
        database,
        flowable,
        lambda: (
            app_conn.execute("SELECT status FROM wf.automation_run WHERE id = %s", (run,)).fetchone()[0] == "COMPLETED"
        ),
    )
    assert done, "hệ thống phải tự xử lý tác vụ thông báo và đưa lần chạy tới kết thúc"
    row = app_conn.execute("SELECT notified, steps FROM wf.automation_run WHERE id = %s", (run,)).fetchone()
    assert row[0] == 2, "báo cho cả phòng (trưởng phòng và chuyên viên)"
    assert "big" in [s["activity_id"] for s in row[1]], "cổng chọn nhánh amount > 5"
    assert (
        app_conn.execute(
            "SELECT count(*) FROM collab.notification WHERE recipient_id = %s AND kind = 'PROCESS_AUTOMATION'",
            (world["nv"],),
        ).fetchone()[0]
        == 1
    )

    overview = process_design.process_model_get(app_conn, tp, {"id": model}, None)["automation"]
    assert overview["status"] == "ACTIVE" and overview["runs"][0]["status"] == "COMPLETED"
    assert process_design.process_model_get(app_conn, nv, {"id": model}, None)["automation"] is None

    stopped = process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)
    assert stopped["status"] == "STOPPED"
    assert not flowable.deployments_named(f"auto-{str(t)[:8]}-"), "không tìm theo tiền tố nhưng không được lỗi"
    with pytest.raises(ActionError):
        process_automation.process_automation_start(app_conn, tp, {"id": model}, ctx)


def test_hen_gio_tu_khoi_chay(app_conn, database, world, flowable, monkeypatch):
    monkeypatch.setattr(process_automation, "MIN_TIMER_SECONDS", 1)
    t = world["tenant"]
    tp = session(world["tp"], t)
    ctx = Context(flowable=flowable)
    start = (
        '<startEvent id="s"><timerEventDefinition><timeCycle>R2/PT2S</timeCycle></timerEventDefinition></startEvent>'
    )
    model = _publish(app_conn, tp, world, auto_bpmn(start, "INITIATOR"))
    process_automation.process_automation_enable(app_conn, tp, {"id": model}, ctx)
    try:
        seen = _tick_until(
            database,
            flowable,
            lambda: (
                app_conn.execute(
                    """SELECT count(*) FROM wf.automation_run r JOIN wf.process_automation a ON a.id = r.automation_id
                   WHERE a.model_id = %s AND r.trigger = 'TIMER'""",
                    (model,),
                ).fetchone()[0]
                >= 1
            ),
            seconds=30,
        )
        assert seen, "Flowable tự bắt đầu theo hẹn giờ và hệ thống tự nhận tác vụ"
        assert (
            app_conn.execute(
                "SELECT count(*) FROM collab.notification WHERE recipient_id = %s AND kind = 'PROCESS_AUTOMATION'",
                (world["tp"],),
            ).fetchone()[0]
            >= 1
        ), "lần chạy hẹn giờ báo cho người bật chạy tự động"
    finally:
        process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)


def flow_bpmn(tasks: str, links: str) -> str:
    return f"""<definitions {NS}><process id="p" name="Luồng" isExecutable="true">
  <startEvent id="s"/>{tasks}<endEvent id="e"/>{links}</process></definitions>"""


def test_render_va_chuyen_kieu():
    assert process_automation.render("Đơn {code} giá {amount}", {"code": "A/1", "amount": 7}) == "Đơn A/1 giá 7"
    assert process_automation.render("/x/{code}", {"code": "a b/c"}, quote=True) == "/x/a%20b%2Fc"
    assert process_automation.render("{missing}", {}) == "{missing}"
    assert process_automation._coerce("12") == 12 and process_automation._coerce("true") is True
    assert process_automation._scalar_variables(
        {"a": 1, "b": {"x": 1}, "bad key": 1, "initiator": "x", "event": "y"}
    ) == {"a": 1}


def test_http_va_setvar_chay_that(app_conn, database, world, flowable, monkeypatch):
    calls = []

    class Reply:
        status_code, text = 201, '{"ok": true}'

    def fake(method, url, payload, allow_private=False, timeout=10):
        calls.append((method, url, payload))
        return Reply()

    monkeypatch.setattr(process_automation.delivery, "pinned_request", fake)
    t = world["tenant"]
    tp = session(world["tp"], t)
    ctx = Context(flowable=flowable)
    xml = (
        flow_bpmn(
            '<serviceTask id="v" bamboo:action="setvar" bamboo:name="gia" bamboo:value="{amount}"/>'
            '<serviceTask id="h" bamboo:action="http" bamboo:url="https://api.example.org/don/{code}" '
            'bamboo:method="POST" bamboo:body=\'{{"gia": {gia}}}\'/>',
            '<sequenceFlow id="a" sourceRef="s" targetRef="v"/><sequenceFlow id="b" sourceRef="v" targetRef="h"/>'
            '<sequenceFlow id="c" sourceRef="h" targetRef="e"/>',
        )
        .replace("{{", "{")
        .replace("}}", "}")
    )
    model = _publish(app_conn, tp, world, xml)
    process_automation.process_automation_enable(app_conn, tp, {"id": model}, ctx)
    try:
        run = process_automation.process_automation_start(
            app_conn, tp, {"id": model, "variables": {"amount": 40, "code": "DH 1"}}, ctx
        )["id"]
        assert _tick_until(
            database,
            flowable,
            lambda: (
                app_conn.execute("SELECT status FROM wf.automation_run WHERE id = %s", (run,)).fetchone()[0]
                == "COMPLETED"
            ),
        )
        assert calls == [("POST", "https://api.example.org/don/DH%201", {"gia": 40})]
    finally:
        process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)


def test_http_loi_vinh_vien_danh_dau_that_bai(app_conn, database, world, flowable):
    t = world["tenant"]
    tp = session(world["tp"], t)
    ctx = Context(flowable=flowable)
    xml = flow_bpmn(
        '<serviceTask id="h" bamboo:action="http" bamboo:url="https://localhost/x" bamboo:method="GET"/>',
        '<sequenceFlow id="a" sourceRef="s" targetRef="h"/><sequenceFlow id="b" sourceRef="h" targetRef="e"/>',
    )
    model = _publish(app_conn, tp, world, xml)
    process_automation.process_automation_enable(app_conn, tp, {"id": model}, ctx)
    try:
        run = process_automation.process_automation_start(app_conn, tp, {"id": model}, ctx)["id"]
        assert _tick_until(
            database,
            flowable,
            lambda: (
                app_conn.execute("SELECT status FROM wf.automation_run WHERE id = %s", (run,)).fetchone()[0] == "FAILED"
            ),
        ), "địa chỉ nội bộ bị chặn (SSRF) nên lần chạy phải thất bại, không được gọi"
    finally:
        process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)


def test_webhook_va_su_kien_khoi_chay(app_conn, database, world, flowable):
    t = world["tenant"]
    tp, nv = session(world["tp"], t), session(world["nv"], t)
    ctx = Context(flowable=flowable)
    xml = flow_bpmn(
        '<serviceTask id="v" bamboo:action="setvar" bamboo:name="ghi" bamboo:value="da-nhan"/>',
        '<sequenceFlow id="a" sourceRef="s" targetRef="v"/><sequenceFlow id="b" sourceRef="v" targetRef="e"/>',
    )
    model = _publish(app_conn, tp, world, xml)
    with pytest.raises(ActionError):
        process_automation.process_automation_webhook(app_conn, tp, {"id": model}, ctx)
    with pytest.raises(ActionError):
        process_automation.process_automation_enable(app_conn, tp, {"id": model, "events": ["khong.co"]}, ctx)
    process_automation.process_automation_enable(app_conn, tp, {"id": model, "events": ["ic_order.confirmed"]}, ctx)
    try:
        with pytest.raises(ActionError) as err:
            process_automation.process_automation_webhook(app_conn, nv, {"id": model}, ctx)
        assert err.value.status == 403
        hook = process_automation.process_automation_webhook(app_conn, tp, {"id": model}, ctx)
        assert hook["path"] == f"/hooks/{hook['token']}"
        assert (
            app_conn.execute(
                "SELECT webhook_sha256 FROM wf.process_automation WHERE id = %s", (hook["id"],)
            ).fetchone()[0]
            != hook["token"]
        ), "CSDL chỉ giữ mã băm"

        class Pool:
            def connection(self):
                return psycopg.connect(database, autocommit=True)

        with pytest.raises(ActionError) as err:
            process_automation.start_from_webhook(Pool(), flowable, "sai-ma", {})
        assert err.value.status == 404
        started = process_automation.start_from_webhook(
            Pool(), flowable, hook["token"], {"code": "X1", "bad": {"a": 1}}
        )
        assert app_conn.execute(
            "SELECT trigger, variables FROM wf.automation_run WHERE id = %s", (started["id"],)
        ).fetchone() == ("WEBHOOK", {"code": "X1"})

        app_conn.execute(
            "SELECT wf.emit_event(%s, 'ic_order.confirmed', %s, %s::jsonb)",
            (t, uuid.uuid4().hex, json.dumps({"doc_no": "DH-9", "unit_ids": [str(world["unit"])]})),
        )
        app_conn.execute(
            "SELECT wf.emit_event(%s, 'ic_order.confirmed', %s, '{\"doc_no\": \"DH-X\"}')", (t, uuid.uuid4().hex)
        )
        app_conn.execute("SELECT wf.emit_event(%s, 'ic_order.settled', %s, '{}')", (t, uuid.uuid4().hex))
        assert _tick_until(
            database,
            flowable,
            lambda: (
                app_conn.execute(
                    """SELECT count(*) FROM wf.automation_run r JOIN wf.process_automation a ON a.id = r.automation_id
                   WHERE a.model_id = %s AND r.trigger = 'EVENT' AND r.status = 'COMPLETED'""",
                    (model,),
                ).fetchone()[0]
                == 1
            ),
        )
        row = app_conn.execute(
            "SELECT variables FROM wf.automation_run WHERE trigger = 'EVENT' AND automation_id = %s", (hook["id"],)
        ).fetchone()
        assert row[0] == {"doc_no": "DH-9", "event": "ic_order.confirmed"}
        assert (
            app_conn.execute(
                "SELECT count(*) FROM wf.automation_run WHERE automation_id = %s AND trigger = 'EVENT'", (hook["id"],)
            ).fetchone()[0]
            == 1
        ), "sự kiện ngoài phạm vi không khởi chạy"

        overview = process_design.process_model_get(app_conn, tp, {"id": model}, None)["automation"]
        assert overview["webhook"] is True and overview["events"] == ["ic_order.confirmed"]
        process_automation.process_automation_enable(app_conn, tp, {"id": model}, ctx)
        again = process_design.process_model_get(app_conn, tp, {"id": model}, None)["automation"]
        assert again["webhook"] is True and again["events"] == ["ic_order.confirmed"]
        process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)
        with pytest.raises(ActionError) as err:
            process_automation.start_from_webhook(Pool(), flowable, hook["token"], {})
        assert err.value.status == 404, "tắt chạy tự động thì webhook ngừng hiệu lực"
    finally:
        try:
            process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)
        except ActionError:
            pass


def test_diem_nhan_webhook_http(app_conn, database, world, flowable):
    from fastapi.testclient import TestClient

    from app import config, main
    from conftest import SETTINGS

    t = world["tenant"]
    tp = session(world["tp"], t)
    ctx = Context(flowable=flowable)
    xml = flow_bpmn(
        '<serviceTask id="v" bamboo:action="setvar" bamboo:name="ghi" bamboo:value="ok"/>',
        '<sequenceFlow id="a" sourceRef="s" targetRef="v"/><sequenceFlow id="b" sourceRef="v" targetRef="e"/>',
    )
    model = _publish(app_conn, tp, world, xml)
    process_automation.process_automation_enable(app_conn, tp, {"id": model}, ctx)
    try:
        token = process_automation.process_automation_webhook(app_conn, tp, {"id": model}, ctx)["token"]
        settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database, "obs_enabled": False})
        with TestClient(main.create_app(settings, ctx=ctx)) as client:
            ok = client.post(f"/hooks/{token}", json={"code": "H1"})
            assert ok.status_code == 200 and ok.json()["status"] == "RUNNING", ok.text
            assert client.post("/hooks/sai-ma", json={}).status_code == 404
            assert client.post(f"/hooks/{token}", content=b"not json").status_code == 400
            assert client.post(f"/hooks/{token}", json=[1, 2]).status_code == 400
            assert client.post(f"/hooks/{token}", content=b"x" * 70000).status_code == 413
    finally:
        process_automation.process_automation_disable(app_conn, tp, {"id": model}, ctx)
