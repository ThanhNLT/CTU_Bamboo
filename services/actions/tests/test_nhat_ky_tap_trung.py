# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import logging
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app import config, main, obs
from app.common import ActionError, Context
from conftest import SETTINGS, drop_role, ids


@pytest.fixture
def cur(database):
    with psycopg.connect(database, row_factory=dict_row, autocommit=True) as c:
        yield c


def test_che_thong_tin_nhay_cam():
    text = obs.mask(
        "Gửi tới nguyen.van@bamboo.vn số 0901 234 567, CCCD 079203456789, Authorization: Bearer abc.def.ghi"
    )
    assert "nguyen.van@" not in text and "n***@bamboo.vn" in text
    assert "0901" not in text and "079203456789" not in text and "abc.def" not in text
    assert obs.mask("Đề nghị DN-2026-000012 vượt hạn mức 50000000") == "Đề nghị DN-2026-000012 vượt hạn mức 50000000"


def test_bo_ghi_log_gan_ma_truy_vet_che_va_khong_chan(cur, database):
    handler = obs.DbHandler("kiem-thu", database, interval=60)
    log = logging.getLogger("bamboo.kiem_thu")
    log.addHandler(handler)
    log.setLevel(logging.DEBUG)
    trace = uuid.uuid4().hex
    try:
        obs.bind(trace_id=trace)
        log.info("Gửi mail cho %s", "a.b@congty.vn", extra={"fields": {"k": 1}})
        log.debug("mức debug không ghi")
        try:
            raise ValueError("lỗi thử nghiệm với 0912345678")
        except ValueError:
            log.exception("Xử lý thất bại")
        handler.flush()
    finally:
        log.removeHandler(handler)
    rows = cur.execute(
        "SELECT level, message, trace_id, fields, service FROM obs.log_event WHERE trace_id = %s ORDER BY id", (trace,)
    ).fetchall()
    assert [r["level"] for r in rows] == ["INFO", "ERROR"] and rows[0]["service"] == "kiem-thu"
    assert rows[0]["message"] == "Gửi mail cho a***@congty.vn" and rows[0]["fields"] == {"k": 1}
    assert "ValueError" in rows[1]["fields"]["exception"] and "0912345678" not in rows[1]["fields"]["exception"]

    tiny = obs.DbHandler("day", database, maxsize=3, interval=60)
    log.addHandler(tiny)
    try:
        for n in range(10):
            log.info("dòng %s", n)
    finally:
        log.removeHandler(tiny)
    assert tiny.dropped == 7, "hàng đợi đầy thì bỏ bớt, không chặn"
    broken = obs.DbHandler("hong", "postgresql://khong-ton-tai/x", interval=60)
    log.addHandler(broken)
    try:
        log.info("không ghi được cũng không văng lỗi")
        broken.flush()
    finally:
        log.removeHandler(broken)


def test_yeu_cau_http_mang_ma_truy_vet_va_ingest(cur, database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database, "obs_enabled": True})
    trace = "trace-" + uuid.uuid4().hex[:12]
    with TestClient(main.create_app(settings, ctx=Context())) as client:
        headers = {"x-actions-secret": SETTINGS.actions_secret, "x-request-id": trace}
        i = ids(cur, "TDX", "c")
        session = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}
        response = client.post("/actions/obs_logs", json={"input": {}, "session_variables": session}, headers=headers)
        assert response.status_code == 403 and response.headers["x-request-id"] == trace, "nhân viên không xem được log"
        assert client.post("/actions/obs_logs", json={}, headers={"x-actions-secret": "sai"}).status_code == 401
        obs._installed.flush()
        rows = cur.execute(
            "SELECT message, tenant_id, person_id, service FROM obs.log_event WHERE trace_id = %s ORDER BY id", (trace,)
        ).fetchall()
        assert any(
            r["message"].startswith("action obs_logs bị từ chối")
            and str(r["tenant_id"]) == i["TDX"]
            and str(r["person_id"]) == i["c"]
            for r in rows
        )
        assert any("POST /actions/obs_logs -> 403" in r["message"] for r in rows) and {r["service"] for r in rows} == {
            "actions"
        }

        nd = (
            '{"timestamp": "2026-10-25T08:00:00Z", "service": "hasura", "level": "warn", "message": "lỗi kết nối của a@b.vn", "trace_id": "%s"}\n'
            '{"service": "keycloak", "message": "đăng nhập thất bại"}\n{"message": ""}\nkhông phải json\n'
        ) % trace
        assert client.post("/obs/ingest", content=nd, headers={"x-actions-secret": "sai"}).status_code == 401
        assert (
            client.post(
                "/obs/ingest", content="không phải json", headers={"x-actions-secret": SETTINGS.actions_secret}
            ).status_code
            == 400
        )
        ok = client.post(
            "/obs/ingest", content=nd.rsplit("\n", 2)[0] + "\n", headers={"x-actions-secret": SETTINGS.actions_secret}
        )
        assert ok.json() == {"accepted": 2}
    got = cur.execute(
        "SELECT service, level, message FROM obs.log_event WHERE trace_id = %s AND service = 'hasura'", (trace,)
    ).fetchone()
    assert got == {"service": "hasura", "level": "WARNING", "message": "lỗi kết nối của a***@b.vn"}


def test_tra_cuu_theo_quyen_va_theo_tenant(cur, database):
    i = ids(cur, "TDX", "BVX", "c")
    trace = "tv-" + uuid.uuid4().hex[:10]
    cur.execute(
        "INSERT INTO obs.log_event (service, level, message, trace_id, tenant_id) VALUES ('actions', 'ERROR', 'lỗi của TDX', %s, %s)",
        (trace, i["TDX"]),
    )
    cur.execute(
        "INSERT INTO obs.log_event (service, level, message, trace_id, tenant_id) VALUES ('actions', 'INFO', 'bước hai', %s, %s)",
        (trace, i["TDX"]),
    )
    cur.execute(
        "INSERT INTO obs.log_event (service, level, message, trace_id, tenant_id) VALUES ('actions', 'ERROR', 'bí mật của BVX', %s, %s)",
        (trace, i["BVX"]),
    )
    cur.execute(
        "INSERT INTO obs.log_event (service, level, message, trace_id) VALUES ('hasura', 'WARNING', 'log hệ thống', %s)",
        (trace,),
    )
    session = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}
    try:
        cur.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'KT_LOG', 'Xem log')")
        cur.execute(
            "INSERT INTO core.role_permission (tenant_id, role_id, permission_code) SELECT tenant_id, id, 'audit.read' FROM core.role WHERE code = 'KT_LOG'"
        )
        cur.execute(
            "INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope) SELECT test.id('TDX'), r.id, test.id('P_NV_MH_DT'), 'TENANT' FROM core.role r WHERE r.code = 'KT_LOG'"
        )
        with psycopg.connect(database, autocommit=True) as conn:
            everything = obs.obs_logs(conn, session, {"trace_id": trace}, Context())
            assert [e["message"] for e in everything["events"]] == ["lỗi của TDX", "bước hai", "log hệ thống"], (
                "chuỗi sự kiện theo thời gian, không lộ tenant khác"
            )
            errors = obs.obs_logs(conn, session, {"trace_id": trace, "level": "error"}, Context())
            assert [e["message"] for e in errors["events"]] == ["lỗi của TDX"]
            assert [
                e["service"]
                for e in obs.obs_logs(conn, session, {"trace_id": trace, "service": "hasura"}, Context())["events"]
            ] == ["hasura"]
            assert len(obs.obs_logs(conn, session, {"q": "lỗi của tdx", "trace_id": trace}, Context())["events"]) == 1
            assert not obs.obs_logs(conn, session, {"q": "bí mật của BVX"}, Context())["events"]
            with pytest.raises(ActionError, match="Mức log"):
                obs.obs_logs(conn, session, {"level": "x"}, Context())

    finally:
        drop_role(cur, "KT_LOG")
