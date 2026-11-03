# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import email
import email.policy
import http.server
import json
import socketserver
import threading

import psycopg
import pytest
from psycopg.rows import dict_row

from app import config, delivery, messaging, receipts
from app.common import ActionError, Context
from conftest import SETTINGS, ids


class FakeSmtp:
    def __init__(self):
        self.messages: list[bytes] = []
        self.refuse = "bad@"
        outer = self

        class Handler(socketserver.StreamRequestHandler):
            def handle(self):
                self.wfile.write(b"220 fake ESMTP\r\n")
                recipient = ""
                while line := self.rfile.readline():
                    cmd = line.strip().upper()
                    if cmd.startswith(b"EHLO") or cmd.startswith(b"HELO"):
                        self.wfile.write(b"250 fake\r\n")
                    elif cmd.startswith(b"MAIL"):
                        self.wfile.write(b"250 OK\r\n")
                    elif cmd.startswith(b"RCPT"):
                        recipient = line.decode().lower()
                        self.wfile.write(b"550 no such user\r\n" if outer.refuse in recipient else b"250 OK\r\n")
                    elif cmd == b"DATA":
                        self.wfile.write(b"354 go\r\n")
                        data = b""
                        while (row := self.rfile.readline()) != b".\r\n":
                            data += row
                        outer.messages.append(data)
                        self.wfile.write(b"250 queued\r\n")
                    elif cmd == b"QUIT":
                        self.wfile.write(b"221 bye\r\n")
                        return
                    else:
                        self.wfile.write(b"250 OK\r\n")

        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class FakeGateway:
    def __init__(self, status: int = 200):
        self.requests: list[dict] = []
        self.status = status
        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"body": body, "auth": self.headers.get("Authorization")})
                self.send_response(outer.status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"id": "sms-123"}).encode())

            def log_message(self, *_):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/send"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def smtp():
    server = FakeSmtp()
    yield server
    server.close()


@pytest.fixture
def worker(database):
    with psycopg.connect(database, row_factory=dict_row) as c:
        yield c


@pytest.fixture
def app_conn(database):
    with psycopg.connect(database, autocommit=True) as c:
        yield c


def settings_for(database, **extra) -> config.Settings:
    return config.Settings(
        **{**SETTINGS.__dict__, "database_url": database, "web_origin": "http://localhost:8000", **extra}
    )


def signer() -> receipts.Signer:
    return receipts.Signer.from_env(SETTINGS.actions_secret)


def enqueue_for(conn, i, pref_channel: str, address: str, title="Có việc mới giao cho bạn") -> str:
    conn.execute("DELETE FROM collab.notification_pref WHERE person_id = %s", (i["c"],))
    conn.execute(
        "INSERT INTO collab.notification_pref (tenant_id, person_id, channel, address) VALUES (%s, %s, %s, %s)",
        (i["TDX"], i["c"], pref_channel, address),
    )
    conn.execute(
        "SELECT collab.notify(%s, %s, 'TASK_ASSIGNED', 'proc.purchase_request', gen_random_uuid(), %s, 'Hạn xử lý: 2 ngày', %s)",
        (i["TDX"], i["c"], title, i["a"]),
    )
    return conn.execute(
        "SELECT id FROM msg.queue WHERE payload ->> 'title' = %s AND payload ->> 'recipient_id' = %s ORDER BY created_at DESC",
        (title, i["c"]),
    ).fetchone()["id"]


def test_email_duoc_giao_va_co_bien_nhan_ky_so(conn, database, worker, smtp):
    i = ids(conn, "TDX", "c", "a")
    message_id = enqueue_for(conn, i, "EMAIL", "nhan.vien@bamboo.vn", "Có việc mới số một")
    settings = settings_for(database, smtp_host="127.0.0.1", smtp_port=smtp.port)
    assert delivery.run_once(worker, settings, signer()) >= 1

    row = conn.execute("SELECT status, receipt, payload_sha256 FROM msg.queue WHERE id = %s", (message_id,)).fetchone()
    assert row["status"] == "DELIVERED", row
    mail = email.message_from_bytes(smtp.messages[-1], policy=email.policy.default)
    assert mail["To"] == "nhan.vien@bamboo.vn" and "Có việc mới số một" in mail["Subject"]
    body = mail.get_body().get_content()
    assert "Hạn xử lý: 2 ngày" in body and "http://localhost:8000/p/purchase-requests/show/" in body

    receipt = row["receipt"]
    assert receipt["channel"] == "email" and receipt["provider_id"].startswith("<")
    assert receipts.verify_receipt(signer(), str(message_id), row["payload_sha256"], receipt), "chữ ký hợp lệ"
    assert not receipts.verify_receipt(signer(), str(message_id), "0" * 64, receipt), "đổi nội dung thì chữ ký sai"
    assert not receipts.verify_receipt(
        signer(), str(message_id), row["payload_sha256"], {**receipt, "delivered_at": "2020-01-01T00:00:00+00:00"}
    )


def test_dia_chi_bi_tu_choi_vao_hang_chet_va_loi_tam_thi_thu_lai(conn, database, worker, smtp):
    i = ids(conn, "TDX", "c", "a")
    bad = enqueue_for(conn, i, "EMAIL", "bad@bamboo.vn", "Gửi tới địa chỉ sai")
    settings = settings_for(database, smtp_host="127.0.0.1", smtp_port=smtp.port)
    delivery.run_once(worker, settings, signer())
    row = conn.execute("SELECT status, last_error FROM msg.queue WHERE id = %s", (bad,)).fetchone()
    assert row["status"] == "DEAD" and "bị từ chối" in row["last_error"], "lỗi vĩnh viễn: vào hàng chết ngay"

    down = enqueue_for(conn, i, "EMAIL", "ok@bamboo.vn", "SMTP đang tắt")
    delivery.run_once(worker, settings_for(database, smtp_host="127.0.0.1", smtp_port=1), signer())
    row = conn.execute(
        "SELECT status, attempts, next_attempt_at > now() AS later FROM msg.queue WHERE id = %s", (down,)
    ).fetchone()
    assert row["status"] == "PENDING" and row["attempts"] == 1 and row["later"], "lỗi tạm thì chờ thử lại"
    conn.execute("UPDATE msg.queue SET next_attempt_at = now() WHERE id = %s", (down,))
    delivery.run_once(worker, settings, signer())
    assert conn.execute("SELECT status FROM msg.queue WHERE id = %s", (down,)).fetchone()["status"] == "DELIVERED"

    none = enqueue_for(conn, i, "EMAIL", "ok@bamboo.vn", "Chưa cấu hình SMTP")
    delivery.run_once(worker, settings_for(database, smtp_host=""), signer())
    row = conn.execute("SELECT status, last_error FROM msg.queue WHERE id = %s", (none,)).fetchone()
    assert row["status"] == "DEAD" and "SMTP chưa được cấu hình" in row["last_error"]


def test_sms_qua_cong_http(conn, database, worker):
    i = ids(conn, "TDX", "c", "a")
    gateway = FakeGateway()
    try:
        message_id = enqueue_for(conn, i, "SMS", "+84901234567", "Duyệt đề nghị gấp")
        settings = settings_for(database, sms_gateway_url=gateway.url, sms_gateway_token="bi-mat")
        delivery.run_once(worker, settings, signer())
    finally:
        gateway.close()
    assert gateway.requests[0]["auth"] == "Bearer bi-mat"
    assert (
        gateway.requests[0]["body"]["to"] == "+84901234567"
        and "Duyệt đề nghị gấp" in gateway.requests[0]["body"]["text"]
    )
    row = conn.execute("SELECT status, receipt FROM msg.queue WHERE id = %s", (message_id,)).fetchone()
    assert row["status"] == "DELIVERED" and row["receipt"]["provider_id"] == "sms-123"

    rejected = FakeGateway(status=400)
    try:
        message_id = enqueue_for(conn, i, "SMS", "+84901234567", "Tin bị cổng từ chối")
        delivery.run_once(worker, settings_for(database, sms_gateway_url=rejected.url), signer())
    finally:
        rejected.close()
    assert conn.execute("SELECT status FROM msg.queue WHERE id = %s", (message_id,)).fetchone()["status"] == "DEAD"


def test_webhook_chan_dia_chi_noi_bo_va_ket_noi_thang_toi_ip(monkeypatch):
    for url in (
        "https://127.0.0.1/x",
        "https://localhost/hook",
        "https://10.1.2.3/h",
        "https://169.254.169.254/latest/meta-data",
    ):
        with pytest.raises(delivery.DeliveryError) as err:
            delivery.resolve_public(url)
        assert err.value.permanent, url
    with pytest.raises(delivery.DeliveryError):
        delivery.resolve_public("http://example.com/x")
    host, ip, _ = delivery.resolve_public("https://127.0.0.1/x", allow_private=True)
    assert ip == "127.0.0.1"

    seen = {}

    def fake_post(url, **kw):
        seen.update(url=url, **kw)

        class R:
            status_code = 200

        return R()

    monkeypatch.setattr(delivery.httpx, "post", fake_post)
    settings = settings_for("postgresql://x", webhook_allow_private=True)
    payload = {"address": "https://127.0.0.1:8443/hook?a=1", "kind": "COMMENT", "title": "Tiêu đề", "body": None}
    assert delivery.send_webhook(settings, payload) == "http-200"
    assert seen["url"] == "https://127.0.0.1:8443/hook?a=1" and seen["headers"]["Host"] == "127.0.0.1"
    assert seen["follow_redirects"] is False and seen["extensions"]["sni_hostname"] == "127.0.0.1"
    assert delivery.mask("nguyen.van@bamboo.vn") == "n***@bamboo.vn" and delivery.mask("+84901234567") == "+84***67"


def test_hanh_dong_tuy_chon_va_hang_doi(conn, database, app_conn, smtp):
    i = ids(conn, "TDX", "c", "gd_dt", "tp_mh_dt")
    session = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}
    ctx = Context(channels=("EMAIL", "WEBHOOK"), signer=signer())

    prefs = messaging.notification_prefs(app_conn, session, {}, ctx)
    by = {c["channel"]: c for c in prefs["channels"]}
    assert by["EMAIL"]["configured"] and not by["SMS"]["configured"] and not by["EMAIL"]["enabled"]

    with pytest.raises(ActionError, match="Email không đúng định dạng"):
        messaging.save_notification_pref(app_conn, session, {"channel": "EMAIL", "address": "sai"}, ctx)
    with pytest.raises(ActionError, match="https"):
        messaging.save_notification_pref(app_conn, session, {"channel": "WEBHOOK", "address": "http://x.vn"}, ctx)
    with pytest.raises(ActionError, match="nội bộ"):
        messaging.save_notification_pref(
            app_conn, session, {"channel": "WEBHOOK", "address": "https://127.0.0.1/h"}, ctx
        )
    with pytest.raises(ActionError, match="Loại thông báo"):
        messaging.save_notification_pref(
            app_conn, session, {"channel": "EMAIL", "address": "c@x.vn", "kinds": ["LA"]}, ctx
        )
    messaging.save_notification_pref(
        app_conn, session, {"channel": "EMAIL", "address": "c@bamboo.vn", "kinds": ["COMMENT"]}, ctx
    )
    assert messaging.notification_prefs(app_conn, session, {}, ctx)["channels"][0]["kinds"] == ["COMMENT"]

    with pytest.raises(ActionError, match="chưa được cấu hình"):
        messaging.send_test_notification(app_conn, session, {"channel": "SMS"}, ctx)
    test = messaging.send_test_notification(app_conn, session, {"channel": "EMAIL"}, ctx)
    settings = settings_for(database, smtp_host="127.0.0.1", smtp_port=smtp.port)
    with psycopg.connect(database, row_factory=dict_row) as worker:
        delivery.run_once(worker, settings, signer())
    mine = messaging.my_deliveries(app_conn, session, {}, ctx)
    assert mine[0]["status"] == "DELIVERED" and mine[0]["channel"] == "EMAIL" and mine[0]["address"] == "c***@bamboo.vn"

    with pytest.raises(ActionError) as err:
        messaging.queue_overview(app_conn, session, {}, ctx)
    assert err.value.status == 403, "nhân viên không xem được hàng đợi chung"
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'QT_TIN', 'Quản trị tin')")
    conn.execute(
        "INSERT INTO core.role_permission (tenant_id, role_id, permission_code) SELECT tenant_id, id, 'core.org.manage' FROM core.role WHERE code = 'QT_TIN'"
    )
    conn.execute(
        "INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope) SELECT test.id('TDX'), r.id, test.id('P_NV_MH_DT'), 'TENANT' FROM core.role r WHERE r.code = 'QT_TIN'"
    )
    overview = messaging.queue_overview(app_conn, session, {}, ctx)
    assert any(c["status"] == "DELIVERED" for c in overview["counts"])
    verified = messaging.queue_verify(app_conn, session, {"id": test["id"]}, ctx)
    assert verified["valid"] is True and verified["alg"] in ("ed25519", "hmac-sha256"), verified
    with pytest.raises(psycopg.errors.DataException, match="đã giao"):
        conn.execute(
            "UPDATE msg.queue SET receipt = jsonb_set(receipt, '{provider_id}', '\"<gia-mao>\"') WHERE id = %s",
            (test["id"],),
        )
    conn.execute("ALTER TABLE msg.queue DISABLE TRIGGER queue_before_write")
    try:  # kẻ có quyền cao sửa thẳng biên nhận thì xác minh chữ ký phải thất bại
        conn.execute(
            "UPDATE msg.queue SET receipt = jsonb_set(receipt, '{provider_id}', '\"<gia-mao>\"') WHERE id = %s",
            (test["id"],),
        )
        assert messaging.queue_verify(app_conn, session, {"id": test["id"]}, ctx)["valid"] is False, "biên nhận bị sửa"
        conn.execute(
            "UPDATE msg.queue SET payload = jsonb_set(payload, '{title}', '\"khac\"') WHERE id = %s", (test["id"],)
        )
        assert "mã băm" in messaging.queue_verify(app_conn, session, {"id": test["id"]}, ctx)["reason"], (
            "nội dung bị sửa"
        )
    finally:
        conn.execute("ALTER TABLE msg.queue ENABLE TRIGGER queue_before_write")
    with pytest.raises(ActionError, match="hàng chết"):
        messaging.queue_retry(app_conn, session, {"id": test["id"]}, ctx)
