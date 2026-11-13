# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

"""Hội tụ IT/OT (ADR #74): NGSI-LD qua MQTT và REST vào bản sao số."""

import datetime as dt
import json
import os
import socket
import threading
import time
import uuid

import httpx
import psycopg
import pytest
from test_cong_api import action

from app import iot, iot_bridge, mqtt_admin
from app.common import ActionError, Context
from conftest import TEST_APP_DB_URL, ids

MQTT_HOST = os.environ.get("MQTT_TEST_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("MQTT_TEST_PORT", "0") or 0)
MQTT_ADMIN = os.environ.get("MQTT_TEST_ADMIN_PASSWORD", "")
MQTT_BRIDGE = os.environ.get("MQTT_TEST_BRIDGE_PASSWORD", "")


def grant(conn, position: str, *permissions: str) -> None:
    role = f"IOT_{uuid.uuid4().hex[:6]}"
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %s, 'Thiết bị')", (role,))
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, p FROM core.role, unnest(%s::text[]) p WHERE tenant_id = test.id('TDX') AND code = %s""",
        (list(permissions), role),
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), id, test.id(%s), 'TENANT' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %s""",
        (position, role),
    )


def test_doc_than_ngsi_ld_chuan_va_gon():
    groups = iot.parse_attrs(
        {
            "id": "urn:ngsi-ld:CleanRoom:t:CR-01",
            "type": "CleanRoom",
            "@context": ["x"],
            "temperature": {"type": "Property", "value": 21.4, "observedAt": "2026-11-06T08:00:00Z"},
            "relativeHumidity": {"type": "Property", "value": 45, "observedAt": "2026-11-06T08:00:00Z"},
            "particles05": {"type": "Property", "value": 3000, "observedAt": "2026-11-06T08:05:00+07:00"},
        }
    )
    assert [(g[0].isoformat(), g[1]) for g in groups] == [
        ("2026-11-06T08:05:00+07:00", {"particles05": 3000}),
        ("2026-11-06T08:00:00+00:00", {"temperature": 21.4, "relativeHumidity": 45}),
    ]
    assert iot.parse_attrs({"temperature": 21, "observedAt": "2026-11-06T08:00:00+07:00"})[0][1] == {"temperature": 21}
    assert iot.parse_attrs({"temperature": 21})[0][0] is None, "không có observedAt thì lấy giờ nhận"
    for bad, message in (
        ([1, 2], "đối tượng JSON"),
        ({"temperature": "21"}, "phải là số"),
        ({"temperature": True}, "phải là số"),
        ({"site": {"type": "Relationship", "object": "x"}}, "chỉ nhận Property"),
        ({"temperature": 1, "observedAt": "2026-11-06T08:00:00"}, "múi giờ"),
        ({"id": "x"}, "Không có thuộc tính"),
    ):
        with pytest.raises(ActionError, match=message):
            iot.parse_attrs(bad)


def test_cau_hinh_dynsec_mac_dinh_cam_va_bam_mat_khau():
    cfg = mqtt_admin.dynsec_config("a", "b")
    assert cfg["defaultACLAccess"]["publishClientSend"] is False and cfg["defaultACLAccess"]["subscribe"] is False
    bridge = next(r for r in cfg["roles"] if r["rolename"] == "bamboo-bridge")
    assert [a["acltype"] for a in bridge["acls"]] == ["subscribePattern", "publishClientReceive"], "cầu nối chỉ đọc"
    client = cfg["clients"][0]
    assert len(client["password"]) == 88 and client["salt"] and client["iterations"] == 101, "chỉ lưu bản băm"
    [role] = mqtt_admin.tenant_role_commands("TDX")
    assert role["rolename"] == "tenant-tdx" and role["acls"] == [
        {"acltype": "publishClientSend", "topic": "bamboo/TDX/#", "priority": 0, "allow": True}
    ]


@pytest.fixture
def twin(conn):
    code = f"CR-{uuid.uuid4().hex[:6].upper()}"
    conn.execute(
        """INSERT INTO iot.model (type, kind, category, grade, attributes)
           VALUES ('CleanRoomT', 'Phòng sạch', 'cleanroom', 'ISO 5',
                   '[{"key": "particles05", "max": 3520, "unit": "hạt/m³"},
                     {"key": "temperature", "min": 20, "max": 22, "unit": "°C", "unit_code": "CEL"}]')
           ON CONFLICT (type) DO NOTHING"""
    )
    conn.execute(
        """INSERT INTO iot.site (tenant_id, code, org_unit_id, name) VALUES (test.id('TDX'), 'chip-t', test.id('CHIP'),
           'Nhà máy') ON CONFLICT DO NOTHING"""
    )
    conn.execute(
        """INSERT INTO iot.entity (tenant_id, code, urn, type, name, site_code, org_unit_id)
           VALUES (test.id('TDX'), %s, %s, 'CleanRoomT', 'Phòng sạch thử', 'chip-t', test.id('CHIP'))""",
        (code, f"urn:ngsi-ld:CleanRoomT:t:{code}"),
    )
    return code


def test_cau_noi_mqtt_ghi_so_do_va_mo_su_co(conn, twin):
    with psycopg.connect(TEST_APP_DB_URL) as c:
        bridge = iot_bridge.Bridge(c)
        now = dt.datetime.now(dt.UTC).replace(microsecond=0)
        body = {"particles05": {"type": "Property", "value": 4100, "observedAt": now.isoformat()}, "temperature": 21}
        assert bridge.handle(f"bamboo/TDX/{twin}/attrs", json.dumps(body).encode()) == 2
        for topic, payload, message in (
            (f"bamboo/TDX/{twin}/cmd", b"{}", "không đúng mẫu"),
            (f"bamboo/KHONG/{twin}/attrs", b"{}", "không có công ty"),
            (f"bamboo/BVX/{twin}/attrs", b'{"temperature": 21}', "Không tìm thấy thiết bị"),
            (f"bamboo/TDX/{twin}/attrs", b"not json", "không phải JSON"),
            (f"bamboo/TDX/{twin}/attrs", b'{"pressure": 1}', "không có trong mô hình"),
        ):
            with pytest.raises((ValueError, ActionError), match=message):
                bridge.handle(topic, payload)
        bridge.process(f"bamboo/TDX/{twin}/attrs", b"not json")
        assert bridge.stats == {"ok": 0, "rejected": 1}, "bản tin lỗi chỉ được đếm, không làm dừng cầu nối"
    row = conn.execute(
        "SELECT connection_state, live_source, state FROM iot.entity WHERE code = %s", (twin,)
    ).fetchone()
    assert row["live_source"] == "mqtt" and row["state"]["particles05"]["value"] == 4100
    incident = conn.execute(
        """SELECT i.side, i.severity, i.status FROM iot.incident i JOIN iot.entity e ON e.id = i.entity_id
           WHERE e.code = %s""",
        (twin,),
    ).fetchone()
    assert (incident["side"], incident["severity"], incident["status"]) == ("above", "critical", "open")


def _session(person: str, tenant: str) -> dict:
    return {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant}


def test_ngsi_ld_doc_va_ghi_qua_action(conn, twin):
    i = ids(conn, "TDX", "c")
    s = _session(i["c"], i["TDX"])
    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        iot.ingest(c, i["TDX"], twin, {"temperature": 21.5}, "api")
        [entity] = iot.iot_entities(c, s, {"id": twin}, Context())["entities"]
    assert entity["id"] == f"urn:ngsi-ld:CleanRoomT:t:{twin}" and entity["type"] == "CleanRoomT"
    assert entity["temperature"]["value"] == 21.5 and entity["temperature"]["unitCode"] == "CEL"
    assert entity["dataSource"]["value"] == "api" and entity["site"]["object"].endswith(":chip-t")
    with psycopg.connect(TEST_APP_DB_URL) as c, pytest.raises(ActionError) as err:
        iot.iot_ingest(c, s, {"entity": twin, "attrs": {"temperature": 21}}, Context())
    assert err.value.status == 403, "người tạo khóa cần iot.ingest ở đơn vị của thiết bị"
    with psycopg.connect(TEST_APP_DB_URL) as c, pytest.raises(ActionError) as err:
        iot.iot_entities(c, s, {"id": "khong-co"}, Context())
    assert err.value.status == 404


def test_cong_api_ngsi_ld(actions_server, conn, twin):
    grant(conn, "P_TGD", "core.org.manage", "iot.ingest")
    i = ids(conn, "TDX", "tgd")
    created = action(
        actions_server,
        "api_key_create",
        {"name": "Cổng OT", "scopes": ["iot.read", "iot.write"], "expires_days": 7},
        i["tgd"],
        i["TDX"],
    ).json()
    headers = {"authorization": f"Bearer {created['key']}"}
    base = f"{actions_server}/api/v1/ngsi-ld/v1/entities"
    r = httpx.post(f"{base}/{twin}/attrs", json={"temperature": {"type": "Property", "value": 19.0}}, headers=headers)
    assert r.status_code == 200 and r.json()["written"] == 1, r.text
    one = httpx.get(f"{base}/urn:ngsi-ld:CleanRoomT:t:{twin}", headers=headers)
    assert one.status_code == 200 and one.json()["temperature"]["value"] == 19.0
    listing = httpx.get(base, params={"type": "CleanRoomT"}, headers=headers).json()
    assert twin in {e["code"]["value"] for e in listing}
    assert httpx.post(f"{base}/{twin}/attrs", json=[1], headers=headers).status_code == 400


def _mqtt_up() -> bool:
    if not MQTT_PORT:
        return False
    try:
        socket.create_connection((MQTT_HOST, MQTT_PORT), timeout=1).close()
        return True
    except OSError:
        return False


@pytest.mark.skipif(not _mqtt_up(), reason="cần Mosquitto thử nghiệm (MQTT_TEST_PORT)")
def test_dau_cuoi_qua_mosquitto(conn, twin):
    from paho.mqtt import client as mqtt

    i = ids(conn, "TDX", "tgd")
    grant(conn, "P_TGD", "core.org.manage")
    ctx = Context(mqtt=mqtt_admin.Dynsec(MQTT_HOST, MQTT_PORT, MQTT_ADMIN))
    s = _session(i["tgd"], i["TDX"])
    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        account = iot.iot_mqtt_account_create(c, s, {"label": "Cổng OT nhà máy"}, ctx)
    assert account["username"].startswith("tdx-") and account["topic"].startswith("bamboo/TDX/")

    received: list = []
    bridge_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"bridge-{uuid.uuid4().hex[:6]}")
    bridge_client.username_pw_set(mqtt_admin.BRIDGE_USER, MQTT_BRIDGE)
    subscribed = threading.Event()
    bridge_client.on_connect = lambda c, *_: c.subscribe(iot_bridge.SUBSCRIPTION, qos=1)
    bridge_client.on_subscribe = lambda *_: subscribed.set()
    bridge_client.on_message = lambda _c, _u, m: received.append((m.topic, m.payload))
    bridge_client.connect(MQTT_HOST, MQTT_PORT)
    bridge_client.loop_start()
    assert subscribed.wait(5)

    device = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"dev-{uuid.uuid4().hex[:6]}")
    device.username_pw_set(account["username"], account["password"])
    connected = threading.Event()
    device.on_connect = lambda *_: connected.set()
    device.connect(MQTT_HOST, MQTT_PORT)
    device.loop_start()
    assert connected.wait(5)
    device.publish(f"bamboo/TDX/{twin}/attrs", json.dumps({"temperature": 23.1}), qos=1).wait_for_publish(5)
    device.publish(f"bamboo/BVX/{twin}/attrs", json.dumps({"temperature": 99}), qos=1).wait_for_publish(5)
    deadline = time.monotonic() + 5
    while not received and time.monotonic() < deadline:
        time.sleep(0.1)
    time.sleep(0.5)
    assert [t for t, _ in received] == [f"bamboo/TDX/{twin}/attrs"], "broker chặn publish sang công ty khác"
    with psycopg.connect(TEST_APP_DB_URL) as c:
        bridge = iot_bridge.Bridge(c)
        for topic, payload in received:
            bridge.process(topic, payload)
    state = conn.execute("SELECT state FROM iot.entity WHERE code = %s", (twin,)).fetchone()["state"]
    assert state["temperature"]["value"] == 23.1

    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        iot.iot_mqtt_account_revoke(c, s, {"username": account["username"]}, ctx)
    time.sleep(1)
    assert not device.is_connected(), "thu hồi là ngắt kết nối ngay"
    device.loop_stop()
    bridge_client.loop_stop()


MQTT_TLS_DIR = os.environ.get("MQTT_TEST_TLS_DIR", "")
MQTT_TLS_PORT = int(os.environ.get("MQTT_TEST_TLS_PORT", "0") or 0)


def test_chon_mtls_khi_co_chung_chi(tmp_path):
    assert mqtt_admin.connect_options("bamboo-bridge", "pw", 1883, str(tmp_path), 8884)[:2] == (1883, "pw")
    (tmp_path / "bamboo-bridge.crt").write_text("x")
    (tmp_path / "bamboo-bridge.key").write_text("x")
    port, password, tls = mqtt_admin.connect_options("bamboo-bridge", "pw", 1883, str(tmp_path), 8884)
    assert (port, password) == (8884, None) and tls is not None, "có chứng chỉ thì dùng mTLS, không gửi mật khẩu"


@pytest.mark.skipif(not (MQTT_TLS_DIR and MQTT_TLS_PORT and _mqtt_up()), reason="cần Mosquitto có cổng mTLS")
def test_mtls_noi_bo_quan_tri_va_cau_noi():
    from paho.mqtt import client as mqtt

    admin = mqtt_admin.Dynsec(MQTT_HOST, MQTT_PORT, "", tls_dir=MQTT_TLS_DIR, tls_port=MQTT_TLS_PORT)
    username, password = f"tdx-{uuid.uuid4().hex[:8]}", "mat-khau-thiet-bi"
    admin.create_device("TDX", username, password, "Thử mTLS")

    port, _, tls = mqtt_admin.connect_options(mqtt_admin.BRIDGE_USER, "", MQTT_PORT, MQTT_TLS_DIR, MQTT_TLS_PORT)
    got, ready = [], threading.Event()
    bridge = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"b-{uuid.uuid4().hex[:6]}")
    tls(bridge)
    bridge.on_connect = lambda c, *_: c.subscribe(iot_bridge.SUBSCRIPTION, qos=1)
    bridge.on_subscribe = lambda *_: ready.set()
    bridge.on_message = lambda _c, _u, m: got.append(m.topic)
    bridge.connect(MQTT_HOST, port)
    bridge.loop_start()
    assert ready.wait(5), "cầu nối đăng nhập bằng chứng chỉ CN=bamboo-bridge"

    plain = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"p-{uuid.uuid4().hex[:6]}")
    plain.username_pw_set(mqtt_admin.BRIDGE_USER, "doan-mo")
    refused = threading.Event()
    plain.on_connect = lambda _c, _u, _f, reason, _p: reason.is_failure and refused.set()
    plain.tls_set(ca_certs=f"{MQTT_TLS_DIR}/ca.crt")
    try:
        plain.connect(MQTT_HOST, MQTT_TLS_PORT)
        plain.loop_start()
        connected = not refused.wait(2) and plain.is_connected()
    except OSError:
        connected = False
    finally:
        plain.loop_stop()
    assert not connected, "cổng mTLS từ chối máy khách không có chứng chỉ"

    device = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"d-{uuid.uuid4().hex[:6]}")
    device.username_pw_set(username, password)
    device.connect(MQTT_HOST, MQTT_PORT)
    device.loop_start()
    time.sleep(0.5)
    device.publish("bamboo/TDX/CR-MTLS/attrs", b'{"temperature": 21}', qos=1).wait_for_publish(5)
    deadline = time.monotonic() + 5
    while not got and time.monotonic() < deadline:
        time.sleep(0.1)
    assert got == ["bamboo/TDX/CR-MTLS/attrs"]
    admin.delete_device(username)
    device.loop_stop()
    bridge.loop_stop()


def test_khai_bao_dau_ra_chung_chi_dich_vu():
    from app import openbao_init

    out = openbao_init.parse_cert_outputs("mosquitto=/mosquitto-tls@1883, bamboo-bridge=/run/bms-actions/mqtt")
    assert out == {
        "mosquitto": (openbao_init.pathlib.Path("/mosquitto-tls"), 1883),
        "bamboo-bridge": (openbao_init.pathlib.Path("/run/bms-actions/mqtt"), None),
    }
