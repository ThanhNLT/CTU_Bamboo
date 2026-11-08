"""Cầu nối MQTT → bản sao số (ADR #74): `python -m app.iot_bridge`.

Đăng nhập Mosquitto bằng tài khoản `bamboo-bridge` (chỉ đọc `bamboo/+/+/attrs`), mỗi bản tin
`bamboo/<mã công ty>/<mã thiết bị hoặc URN>/attrs` (thân NGSI-LD) được ghi bằng iot.ingest. Broker đã chặn thiết bị
publish ra ngoài nhánh của công ty mình, nên mã công ty trong chủ đề là đáng tin. Bản tin lỗi chỉ ghi log (đếm theo
lý do), không làm dừng cầu nối. Mỗi phút chuyển thiết bị trực tiếp im lặng quá 15 phút sang ngoại tuyến.
"""

import json
import logging
import queue
import threading
import time
import uuid

import psycopg

from . import config, iot, mqtt_admin
from .common import ActionError

log = logging.getLogger("iot_bridge")

SUBSCRIPTION = f"{mqtt_admin.TOPIC_ROOT}/+/+/attrs"
MAX_PAYLOAD = 64 * 1024
OFFLINE_EVERY = 60.0


class Bridge:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn
        self.tenants: dict[str, str] = {}
        self.stats = {"ok": 0, "rejected": 0}

    def tenant_of(self, code: str) -> str | None:
        if code not in self.tenants:
            row = self.conn.execute("SELECT id FROM core.tenant WHERE code = %s", (code,)).fetchone()
            self.conn.commit()
            if row is None:
                return None
            self.tenants[code] = str(row[0])
        return self.tenants[code]

    def handle(self, topic: str, payload: bytes) -> int:
        """Ghi một bản tin; trả số giá trị đã ghi, ném ValueError/ActionError nếu bản tin không hợp lệ."""
        parts = topic.split("/")
        if len(parts) != 4 or parts[0] != mqtt_admin.TOPIC_ROOT or parts[3] != "attrs":
            raise ValueError(f"chủ đề không đúng mẫu {SUBSCRIPTION}")
        if len(payload) > MAX_PAYLOAD:
            raise ValueError("bản tin quá 64 KB")
        tenant = self.tenant_of(parts[1])
        if tenant is None:
            raise ValueError(f"không có công ty {parts[1]}")
        try:
            body = json.loads(payload)
        except ValueError as exc:
            raise ValueError("thân bản tin không phải JSON") from exc
        try:
            written = iot.ingest(self.conn, tenant, parts[2], body, "mqtt")
            self.conn.commit()
        except (psycopg.errors.RaiseException, psycopg.errors.DataError) as exc:
            self.conn.rollback()
            raise ValueError(exc.diag.message_primary or str(exc)) from exc
        except Exception:
            self.conn.rollback()
            raise
        return written

    def process(self, topic: str, payload: bytes) -> None:
        try:
            self.handle(topic, payload)
            self.stats["ok"] += 1
        except (ValueError, ActionError) as exc:
            self.stats["rejected"] += 1
            log.warning("bỏ bản tin %s: %s", topic, getattr(exc, "message", exc))

    def mark_offline(self) -> int:
        n = self.conn.execute("SELECT iot.mark_offline(15)").fetchone()[0]
        self.conn.commit()
        return n


def run_forever(settings: config.Settings) -> None:
    from paho.mqtt import client as mqtt

    inbox: queue.Queue = queue.Queue(maxsize=10_000)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"bamboo-bridge-{uuid.uuid4().hex[:6]}")
    port, password, tls = mqtt_admin.connect_options(
        mqtt_admin.BRIDGE_USER, settings.mqtt_bridge_password, settings.mqtt_port, settings.mqtt_tls_dir,
        settings.mqtt_tls_port,
    )  # fmt: skip
    if tls:
        tls(client)
    else:
        client.username_pw_set(mqtt_admin.BRIDGE_USER, password)
    client.reconnect_delay_set(1, 30)

    def on_connect(c, _userdata, _flags, reason, _props):
        if reason.is_failure:
            log.warning("không đăng nhập được Mosquitto: %s", reason)
            return
        c.subscribe(SUBSCRIPTION, qos=1)
        log.info("iot-bridge đã kết nối %s:%s (%s), nghe %s", settings.mqtt_host, port, "mTLS" if tls else "mật khẩu",
                 SUBSCRIPTION)  # fmt: skip

    def on_message(_c, _userdata, msg):
        try:
            inbox.put_nowait((msg.topic, msg.payload))
        except queue.Full:
            log.warning("hàng đợi đầy, bỏ bản tin %s", msg.topic)

    client.on_connect, client.on_message = on_connect, on_message
    while True:
        try:
            client.connect(settings.mqtt_host, port, keepalive=30)
            break
        except OSError as exc:
            log.warning("chờ Mosquitto: %s", exc)
            time.sleep(3)
    threading.Thread(target=client.loop_forever, kwargs={"retry_first_connection": True}, daemon=True).start()

    bridge, last_offline = None, 0.0
    while True:
        try:
            if bridge is None:
                bridge = Bridge(psycopg.connect(settings.database_url))
            try:
                topic, payload = inbox.get(timeout=5)
                bridge.process(topic, payload)
            except queue.Empty:
                pass
            if time.monotonic() - last_offline >= OFFLINE_EVERY:
                if n := bridge.mark_offline():
                    log.info("%s thiết bị chuyển ngoại tuyến", n)
                last_offline = time.monotonic()
        except psycopg.OperationalError as exc:
            log.warning("mất kết nối CSDL: %s", exc)
            bridge = None
            time.sleep(3)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    settings = config.load()
    if not settings.mqtt_host:
        raise SystemExit("Chưa đặt MQTT_HOST")
    run_forever(settings)


if __name__ == "__main__":
    main()
