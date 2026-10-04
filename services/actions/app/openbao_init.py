# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Job openbao-init (ADR #25): chạy mỗi lần `docker compose up`, làm lại bao nhiêu lần cũng được.

1. Lần đầu: khởi tạo OpenBao với 1 khóa unseal (chỉ cho dev), lưu khóa + root token vào
   BAO_KEYS_FILE (volume riêng, quyền 0600), không in ra log.
2. Mỗi lần: unseal nếu đang sealed, chờ raft bầu leader.
3. Cấu hình: KV v2 `secret/`, transit `transit/` + khóa `pii`, AppRole, policy đặc quyền tối thiểu.
4. Đồng bộ secret hạ tầng từ biến môi trường; khóa S3 do OpenBao sinh một lần và là nguồn duy nhất.
5. Ghi s3.json cho SeaweedFS và file AppRole (role-id + secret-id) cho từng dịch vụ.
Với BAMBOO_ENV=production: từ chối chạy nếu còn mật khẩu/secret mặc định của môi trường dev, nên
không dịch vụ nào khởi động được với cấu hình dev.

    python -m app.openbao_init
"""

import json
import logging
import os
import pathlib
import secrets
import sys
import time

import httpx

from . import config, storage
from .openbao import Bao, BaoError

log = logging.getLogger("openbao_init")

POLICIES = {
    # Dịch vụ actions và flow-sync: CSDL, Flowable, khóa S3 của ứng dụng, mã hóa dữ liệu nhạy cảm.
    "actions": """
path "secret/data/bms/postgres"  { capabilities = ["read"] }
path "secret/data/bms/flowable"  { capabilities = ["read"] }
path "secret/data/bms/seaweedfs" { capabilities = ["read"] }
path "secret/data/bms/actions"   { capabilities = ["read"] }
path "transit/encrypt/pii"       { capabilities = ["update"] }
path "transit/decrypt/pii"       { capabilities = ["update"] }
""",
    # Job bootstrap: tạo bucket (khóa S3 admin), deploy BPMN, nạp metadata Hasura.
    "bootstrap": """
path "secret/data/bms/seaweedfs-admin" { capabilities = ["read"] }
path "secret/data/bms/flowable"        { capabilities = ["read"] }
path "secret/data/bms/hasura"          { capabilities = ["read"] }
path "secret/data/bms/keycloak"        { capabilities = ["read"] }
""",
}


def env_secrets() -> dict[str, dict]:
    """Secret hạ tầng khai báo ở .env (môi trường dev); OpenBao giữ bản để dịch vụ đọc."""
    env = os.environ.get
    return {
        "bms/postgres": {"username": env("POSTGRES_USER", "bms"), "password": env("POSTGRES_PASSWORD", "bms-dev")},
        "bms/hasura": {"admin_secret": env("HASURA_GRAPHQL_ADMIN_SECRET", "dev-admin-secret")},
        "bms/keycloak": {"username": env("KEYCLOAK_ADMIN", "kcadmin"),
                         "password": env("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev")},
        "bms/flowable": {"username": env("FLOWABLE_ADMIN", "rest-admin"),
                         "password": env("FLOWABLE_ADMIN_PASSWORD", "test")},
        "bms/actions": {"secret": env("ACTIONS_SECRET", "dev-actions-secret")},
    }


def _write_private(path: pathlib.Path, data: dict, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.chmod(mode)
    tmp.replace(path)


def wait_reachable(addr: str, timeout: float = 120.0) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            httpx.get(f"{addr}/v1/sys/health", timeout=3)
            return
        except httpx.HTTPError:
            if time.monotonic() > deadline:
                raise
            time.sleep(1)


def init_and_unseal(addr: str, keys_file: pathlib.Path) -> str:
    """Trả về root token."""
    bao = Bao(addr)
    if not bao.request("GET", "sys/init")["initialized"]:
        # Raft khởi tạo có thể mất vài chục giây; hết giờ chờ ở đây là mất khóa nên chờ lâu.
        result = bao.request("PUT", "sys/init", {"secret_shares": 1, "secret_threshold": 1}, timeout=300)
        _write_private(keys_file, {"unseal_keys_b64": result["keys_base64"], "root_token": result["root_token"]})
        log.info("đã khởi tạo OpenBao, khóa lưu ở %s", keys_file)
    if not keys_file.exists():
        raise RuntimeError(f"OpenBao đã khởi tạo nhưng không có {keys_file}: khôi phục file khóa hoặc "
                           "xóa volume openbao-data để khởi tạo lại (mất toàn bộ secret)")
    keys = json.loads(keys_file.read_text(encoding="utf-8"))
    if bao.request("GET", "sys/seal-status")["sealed"]:
        for key in keys["unseal_keys_b64"]:
            bao.request("PUT", "sys/unseal", {"key": key})
        log.info("đã unseal")
    deadline = time.monotonic() + 60
    while httpx.get(f"{addr}/v1/sys/health", timeout=3).status_code != 200:
        if time.monotonic() > deadline:
            raise RuntimeError("OpenBao chưa có leader sau 60 giây")
        time.sleep(1)
    return keys["root_token"]


def configure(root: Bao) -> None:
    mounts = root.request("GET", "sys/mounts")["data"]
    if "secret/" not in mounts:
        root.request("POST", "sys/mounts/secret", {"type": "kv", "options": {"version": "2"}})
    if "transit/" not in mounts:
        root.request("POST", "sys/mounts/transit", {"type": "transit"})
    if root.request("GET", "transit/keys/pii", ok404=True) is None:
        root.request("POST", "transit/keys/pii", {"type": "aes256-gcm96"})
    if "approle/" not in root.request("GET", "sys/auth")["data"]:
        root.request("POST", "sys/auth/approle", {"type": "approle"})
    for name, policy in POLICIES.items():
        root.request("PUT", f"sys/policies/acl/{name}", {"policy": policy})
        root.request("POST", f"auth/approle/role/{name}", {
            "token_policies": [name], "token_ttl": "1h", "token_max_ttl": "24h", "secret_id_ttl": "0"})


def sync_secrets(root: Bao) -> None:
    """Ghi secret từ env khi khác bản đang có; sinh khóa S3 nếu chưa có (OpenBao là nguồn duy nhất)."""
    for path, values in env_secrets().items():
        if root.read(path) != values:
            root.write(path, values)
            log.info("đã cập nhật secret/%s", path)
    for path, access_key in (("bms/seaweedfs", "bms-app"), ("bms/seaweedfs-admin", "bms-admin")):
        if root.read(path) is None:
            root.write(path, {"access_key": access_key, "secret_key": secrets.token_urlsafe(32)})
            log.info("đã sinh khóa S3 secret/%s", path)


def write_approle(root: Bao, addr: str, role: str, path: pathlib.Path, uid: int | None = None) -> None:
    """Giữ file cũ nếu còn đăng nhập được; nếu không thì cấp secret-id mới. File thuộc `uid`
    (người dùng chạy dịch vụ, image Python chạy bằng uid 10001), quyền 0400."""
    keep = False
    if path.exists():
        try:
            creds = json.loads(path.read_text(encoding="utf-8"))
            Bao.login_approle(addr, creds["role_id"], creds["secret_id"])
            keep = True
        except (BaoError, ValueError, KeyError):
            pass
    if not keep:
        role_id = root.request("GET", f"auth/approle/role/{role}/role-id")["data"]["role_id"]
        secret_id = root.request("POST", f"auth/approle/role/{role}/secret-id")["data"]["secret_id"]
        _write_private(path, {"role_id": role_id, "secret_id": secret_id}, mode=0o400)
        log.info("đã cấp AppRole %s vào %s", role, path)
    # Cả file cũ (bản trước chạy dịch vụ bằng root) cũng chuyển cho đúng người dùng.
    if uid is not None and path.stat().st_uid != uid:
        os.chown(path, uid, uid)


def parse_outputs(spec: str) -> dict[str, pathlib.Path]:
    """"actions=/run/a.json,bootstrap=/run/b.json" → {role: đường dẫn}."""
    return {k.strip(): pathlib.Path(v.strip()) for k, v in (item.split("=", 1) for item in spec.split(",") if item)}


def run(addr: str, keys_file: pathlib.Path, approle_outputs: dict[str, pathlib.Path],
        s3_config_path: pathlib.Path | None, approle_uid: int | None = None) -> None:
    wait_reachable(addr)
    root = Bao(addr, init_and_unseal(addr, keys_file))
    configure(root)
    sync_secrets(root)
    if s3_config_path:
        settings = config.with_openbao(config._from_env(), root)
        _write_private(s3_config_path, storage.s3_identities(settings), mode=0o644)
        log.info("đã ghi cấu hình S3 %s", s3_config_path)
    for role, path in approle_outputs.items():
        if role not in POLICIES:
            raise ValueError(f"Không có AppRole {role}")
        write_approle(root, addr, role, path, approle_uid)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    config.assert_production_ready()
    env = os.environ.get
    s3_path = env("S3_CONFIG_PATH")
    uid = env("APPROLE_UID")
    run(env("BAO_ADDR", "http://openbao:8200"),
        pathlib.Path(env("BAO_KEYS_FILE", "/openbao/keys/init.json")),
        parse_outputs(env("APPROLE_OUTPUTS", "")),
        pathlib.Path(s3_path) if s3_path else None,
        int(uid) if uid else None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
