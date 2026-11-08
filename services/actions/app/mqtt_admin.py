"""Quản trị Mosquitto qua plugin dynamic-security (ADR #74).

- `dynsec_config`: cấu hình ban đầu do openbao-init ghi một lần: tài khoản `bamboo-admin` (chỉ kênh điều khiển
  `$CONTROL/dynamic-security/#`) và `bamboo-bridge` (chỉ đọc `bamboo/+/+/attrs`); mặc định mọi publish/subscribe bị cấm.
- `Dynsec`: gửi lệnh tạo vai trò theo công ty (`tenant-<mã>`: chỉ publish vào `bamboo/<mã>/#`), tạo/xóa tài khoản thiết
  bị, ngắt kết nối khi thu hồi. Mật khẩu thiết bị không lưu ở Bamboo; Mosquitto giữ bản băm PBKDF2-SHA512.
"""

import base64
import hashlib
import json
import secrets
import threading
import uuid

ADMIN_USER = "bamboo-admin"
BRIDGE_USER = "bamboo-bridge"
CONTROL = "$CONTROL/dynamic-security/v1"
TOPIC_ROOT = "bamboo"
ITERATIONS = 101


class MqttUnavailable(Exception):
    pass


def connect_options(identity: str, password: str, port: int, tls_dir: str = "", tls_port: int = 8884):
    """(cổng, mật khẩu, hàm cấu hình TLS) cho một danh tính: có chứng chỉ do openbao-init cấp thì mTLS, không thì
    mật khẩu qua cổng thường. Với mTLS, Mosquitto lấy CN của chứng chỉ làm tên đăng nhập (use_identity_as_username)."""
    import pathlib

    base = pathlib.Path(tls_dir) if tls_dir else None
    if base and (base / f"{identity}.crt").exists() and (base / f"{identity}.key").exists():

        def tls(client) -> None:
            client.tls_set(
                ca_certs=str(base / "ca.crt"),
                certfile=str(base / f"{identity}.crt"),
                keyfile=str(base / f"{identity}.key"),
            )

        return tls_port, None, tls
    return port, password, None


def hash_password(password: str, salt: bytes | None = None, iterations: int = ITERATIONS) -> dict:
    salt = salt or secrets.token_bytes(12)
    digest = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, iterations, 64)
    return {
        "password": base64.b64encode(digest).decode(),
        "salt": base64.b64encode(salt).decode(),
        "iterations": iterations,
    }


def _acl(kind: str, topic: str, allow: bool = True, priority: int = 0) -> dict:
    return {"acltype": kind, "topic": topic, "priority": priority, "allow": allow}


def tenant_role(code: str) -> str:
    return f"tenant-{code.lower()}"


def tenant_topic(code: str) -> str:
    return f"{TOPIC_ROOT}/{code}/#"


def dynsec_config(admin_password: str, bridge_password: str) -> dict:
    return {
        "defaultACLAccess": {
            "publishClientSend": False,
            "publishClientReceive": True,
            "subscribe": False,
            "unsubscribe": True,
        },
        "clients": [
            {
                "username": ADMIN_USER,
                "textname": "Bamboo quản trị",
                "roles": [{"rolename": "bamboo-admin"}],
                **hash_password(admin_password),
            },
            {
                "username": BRIDGE_USER,
                "textname": "Bamboo iot-bridge",
                "roles": [{"rolename": "bamboo-bridge"}],
                **hash_password(bridge_password),
            },
        ],  # fmt: skip
        "groups": [],
        "roles": [
            {
                "rolename": "bamboo-admin",
                "acls": [
                    _acl("publishClientSend", "$CONTROL/dynamic-security/#"),
                    _acl("publishClientReceive", "$CONTROL/dynamic-security/#"),
                    _acl("subscribePattern", "$CONTROL/dynamic-security/#"),
                ],
            },
            {
                "rolename": "bamboo-bridge",
                "acls": [
                    _acl("subscribePattern", f"{TOPIC_ROOT}/+/+/attrs"),
                    _acl("publishClientReceive", f"{TOPIC_ROOT}/#"),
                ],
            },
        ],
    }


def tenant_role_commands(code: str) -> list[dict]:
    """Lệnh tạo vai trò của công ty: thiết bị chỉ publish được vào nhánh chủ đề của công ty mình."""
    return [
        {
            "command": "createRole",
            "rolename": tenant_role(code),
            "textname": f"Thiết bị của công ty {code}",
            "acls": [_acl("publishClientSend", tenant_topic(code))],
        }
    ]


def new_username(code: str) -> str:
    return f"{code.lower()}-{secrets.token_hex(4)}"


class Dynsec:
    """Gửi một lô lệnh dynamic-security và chờ trả lời (kết nối ngắn bằng tài khoản quản trị)."""

    def __init__(
        self, host: str, port: int, password: str, timeout: float = 10.0, tls_dir: str = "", tls_port: int = 8884
    ):
        self.host, self.timeout = host, timeout
        self.port, self.password, self.tls = connect_options(ADMIN_USER, password, port, tls_dir, tls_port)

    def run(self, commands: list[dict]) -> list[dict]:
        if not self.host or not (self.password or self.tls):
            raise MqttUnavailable("Chưa cấu hình broker MQTT")
        from paho.mqtt import client as mqtt

        done = threading.Event()
        replies: list[dict] = []
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"bamboo-admin-{uuid.uuid4().hex[:8]}")
        if self.tls:
            self.tls(client)
        else:
            client.username_pw_set(ADMIN_USER, self.password)

        def on_connect(c, _userdata, _flags, reason, _props):
            if reason.is_failure:
                done.set()
                return
            c.subscribe(f"{CONTROL}/response", qos=1)

        def on_subscribe(c, *_args):
            c.publish(CONTROL, json.dumps({"commands": commands}), qos=1)

        def on_message(_c, _userdata, msg):
            replies.extend(json.loads(msg.payload).get("responses", []))
            done.set()

        client.on_connect, client.on_subscribe, client.on_message = on_connect, on_subscribe, on_message
        try:
            client.connect(self.host, self.port, keepalive=30)
        except OSError as exc:
            raise MqttUnavailable(f"Không kết nối được broker MQTT: {exc}") from exc
        client.loop_start()
        try:
            if not done.wait(self.timeout) or not replies:
                raise MqttUnavailable("Broker MQTT không trả lời lệnh quản trị")
        finally:
            client.loop_stop()
            client.disconnect()
        return replies

    def ensure_ok(self, commands: list[dict], tolerate: tuple[str, ...] = ()) -> list[dict]:
        replies = self.run(commands)
        for reply in replies:
            error = reply.get("error")
            if error and not any(t in error for t in tolerate):
                raise MqttUnavailable(f"Mosquitto từ chối {reply.get('command')}: {error}")
        return replies

    def create_device(self, code: str, username: str, password: str, label: str) -> None:
        self.ensure_ok(tenant_role_commands(code), tolerate=("already exists",))
        self.ensure_ok(
            [
                {
                    "command": "createClient",
                    "username": username,
                    "password": password,
                    "textname": label[:80],
                    "roles": [{"rolename": tenant_role(code)}],
                }
            ]
        )

    def delete_device(self, username: str) -> None:
        self.ensure_ok(
            [{"command": "disableClient", "username": username}, {"command": "deleteClient", "username": username}],
            tolerate=("not found",),
        )
