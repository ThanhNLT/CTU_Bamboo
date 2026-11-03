# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import datetime as dt
import hashlib
import hmac
import json
import logging
import os
import pathlib
import secrets
import sys
import time

import httpx

from bamboo_common.openbao import Bao, BaoError

from . import config, search, storage

log = logging.getLogger("openbao_init")

POLICIES = {
    "actions": """
path "secret/data/bms/postgres"  { capabilities = ["read"] }
path "secret/data/bms/flowable"  { capabilities = ["read"] }
path "secret/data/bms/seaweedfs" { capabilities = ["read"] }
path "secret/data/bms/actions"   { capabilities = ["read"] }
path "secret/data/bms/meilisearch-search" { capabilities = ["read"] }
path "secret/data/bms/keycloak-provisioner" { capabilities = ["read"] }
path "secret/data/bms/trino-actions" { capabilities = ["read"] }
path "transit/encrypt/pii"       { capabilities = ["update"] }
path "transit/decrypt/pii"       { capabilities = ["update"] }
path "transit/sign/receipt"      { capabilities = ["update"] }
path "transit/verify/receipt"    { capabilities = ["update"] }
path "transit/sign/anchor"       { capabilities = ["update"] }
path "transit/verify/anchor"     { capabilities = ["update"] }
""",
    "bootstrap": """
path "secret/data/bms/seaweedfs-admin" { capabilities = ["read"] }
path "secret/data/bms/meilisearch-admin" { capabilities = ["read"] }
path "secret/data/bms/flowable"        { capabilities = ["read"] }
path "secret/data/bms/hasura"          { capabilities = ["read"] }
path "secret/data/bms/keycloak"        { capabilities = ["read"] }
path "secret/data/bms/keycloak-provisioner" { capabilities = ["read"] }
""",
    "search": """
path "secret/data/bms/postgres"            { capabilities = ["read"] }
path "secret/data/bms/seaweedfs-search"    { capabilities = ["read"] }
path "secret/data/bms/meilisearch-indexer" { capabilities = ["read"] }
""",
    "lakehouse": """
path "secret/data/bms/lakehouse"           { capabilities = ["read"] }
path "secret/data/bms/seaweedfs-lakehouse" { capabilities = ["read"] }
path "secret/data/bms/kafka-lakehouse"     { capabilities = ["read"] }
""",
}


INTERNAL_HOSTS = ["trino"]
TRINO_USERS = {"bms-admin": "bms/trino-admin", "bms-actions": "bms/trino-actions"}
TRINO_PBKDF2_ITERATIONS = 10000
CERT_RENEW_BEFORE = dt.timedelta(days=30)


def env_secrets() -> dict[str, dict]:
    env = os.environ.get
    return {
        "bms/postgres": {"username": "bamboo_actions", "password": env("ACTIONS_DB_PASSWORD", "actions-db-dev")},
        "bms/hasura": {"admin_secret": env("HASURA_GRAPHQL_ADMIN_SECRET", "dev-admin-secret")},
        "bms/keycloak": {
            "username": env("KEYCLOAK_ADMIN", "kcadmin"),
            "password": env("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"),
        },
        "bms/flowable": {
            "username": env("FLOWABLE_ADMIN", "rest-admin"),
            "password": env("FLOWABLE_ADMIN_PASSWORD", "test"),
        },
        "bms/actions": {"secret": env("ACTIONS_SECRET", "dev-actions-secret")},
        "bms/lakehouse": {"username": "bamboo_lakehouse", "password": env("LAKEHOUSE_DB_PASSWORD", "lakehouse-db-dev")},
        "bms/kafka-lakehouse": {
            "username": "lakehouse",
            "password": env("LAKEHOUSE_KAFKA_PASSWORD", "lakehouse-kafka-dev"),
        },
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
    bao = Bao(addr)
    if not bao.request("GET", "sys/init")["initialized"]:
        result = bao.request("PUT", "sys/init", {"secret_shares": 1, "secret_threshold": 1}, timeout=300)
        _write_private(keys_file, {"unseal_keys_b64": result["keys_base64"], "root_token": result["root_token"]})
        log.info("đã khởi tạo OpenBao, khóa lưu ở %s", keys_file)
    if not keys_file.exists():
        raise RuntimeError(
            f"OpenBao đã khởi tạo nhưng không có {keys_file}: khôi phục file khóa hoặc "
            "xóa volume openbao-data để khởi tạo lại (mất toàn bộ secret)"
        )
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
    for key in ("receipt", "anchor"):  # chữ ký biên nhận giao tin và neo chuỗi kiểm toán
        if root.request("GET", f"transit/keys/{key}", ok404=True) is None:
            root.request("POST", f"transit/keys/{key}", {"type": "ed25519"})
    if "pki/" not in mounts:
        root.request("POST", "sys/mounts/pki", {"type": "pki", "config": {"max_lease_ttl": "87600h"}})
    if not root.request("LIST", "pki/issuers", ok404=True):
        root.request(
            "POST",
            "pki/root/generate/internal",
            {"common_name": "Bamboo DX-OS internal CA", "ttl": "87600h", "key_type": "ec"},
        )
        log.info("đã tạo CA nội bộ pki/")
    root.request(
        "POST",
        "pki/roles/internal",
        {
            "allowed_domains": INTERNAL_HOSTS,
            "allow_bare_domains": True,
            "allow_localhost": True,
            "allow_ip_sans": True,
            "key_type": "rsa",
            "key_bits": 2048,
            "max_ttl": "8760h",
        },
    )
    if "approle/" not in root.request("GET", "sys/auth")["data"]:
        root.request("POST", "sys/auth/approle", {"type": "approle"})
    for name, policy in POLICIES.items():
        root.request("PUT", f"sys/policies/acl/{name}", {"policy": policy})
        root.request(
            "POST",
            f"auth/approle/role/{name}",
            {"token_policies": [name], "token_ttl": "1h", "token_max_ttl": "24h", "secret_id_ttl": "0"},
        )


def sync_secrets(root: Bao) -> None:
    for path, values in env_secrets().items():
        if root.read(path) != values:
            root.write(path, values)
            log.info("đã cập nhật secret/%s", path)
    for path, access_key in (
        ("bms/seaweedfs", "bms-app"),
        ("bms/seaweedfs-admin", "bms-admin"),
        ("bms/seaweedfs-search", "bms-search"),
        ("bms/seaweedfs-lakehouse", "bms-lakehouse"),
    ):
        if root.read(path) is None:
            root.write(path, {"access_key": access_key, "secret_key": secrets.token_urlsafe(32)})
            log.info("đã sinh khóa S3 secret/%s", path)
    for user, path in TRINO_USERS.items():
        if root.read(path) is None:
            root.write(path, {"username": user, "password": secrets.token_urlsafe(32)})
            log.info("đã sinh mật khẩu Trino secret/%s", path)
    if root.read("bms/trino-internal") is None:
        root.write("bms/trino-internal", {"shared_secret": secrets.token_urlsafe(48)})
    if root.read("bms/keycloak-provisioner") is None:
        root.write("bms/keycloak-provisioner", {"client_secret": secrets.token_urlsafe(32)})
        log.info("đã sinh secret client bms-provisioner")
    admin = root.read("bms/meilisearch-admin")
    if admin is None:
        admin = {"master_key": secrets.token_urlsafe(32)}
        root.write("bms/meilisearch-admin", admin)
        log.info("đã sinh khóa chủ Meilisearch")
    for path, uid in (
        ("bms/meilisearch-search", search.SEARCH_KEY_UID),
        ("bms/meilisearch-indexer", search.INDEXER_KEY_UID),
    ):
        values = {"key": search.derive_key(admin["master_key"], uid)}
        if root.read(path) != values:
            root.write(path, values)
            log.info("đã cập nhật secret/%s", path)


def write_approle(root: Bao, addr: str, role: str, path: pathlib.Path, uid: int | None = None) -> None:
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
    if uid is not None and path.stat().st_uid != uid:
        os.chown(path, uid, uid)


def parse_outputs(spec: str) -> dict[str, pathlib.Path]:
    return {k.strip(): pathlib.Path(v.strip()) for k, v in (item.split("=", 1) for item in spec.split(",") if item)}


def _write_if_changed(path: pathlib.Path, text: str, mode: int) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.chmod(mode)
    tmp.replace(path)
    return True


def trino_catalog(root: Bao, db_url: str, s3_endpoint: str, bucket: str) -> str:
    db = root.read("bms/lakehouse")
    s3 = root.read("bms/seaweedfs-lakehouse")
    return (
        "\n".join(
            [
                "connector.name=iceberg",
                "iceberg.catalog.type=jdbc",
                "iceberg.jdbc-catalog.catalog-name=bms",
                "iceberg.jdbc-catalog.driver-class=org.postgresql.Driver",
                f"iceberg.jdbc-catalog.connection-url={db_url}",
                f"iceberg.jdbc-catalog.connection-user={db['username']}",
                f"iceberg.jdbc-catalog.connection-password={db['password']}",
                f"iceberg.jdbc-catalog.default-warehouse-dir=s3://{bucket}/warehouse",
                "fs.native-s3.enabled=true",
                f"s3.endpoint={s3_endpoint}",
                "s3.region=us-east-1",
                "s3.path-style-access=true",
                f"s3.aws-access-key={s3['access_key']}",
                f"s3.aws-secret-key={s3['secret_key']}",
            ]
        )
        + "\n"
    )


def trino_password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha1", password.encode(), salt, TRINO_PBKDF2_ITERATIONS, dklen=32)
    return f"{TRINO_PBKDF2_ITERATIONS}:{salt.hex()}:{digest.hex()}"


def _trino_hash_matches(line: str, password: str) -> bool:
    try:
        iterations, salt, digest = line.split(":")
        computed = hashlib.pbkdf2_hmac(
            "sha1", password.encode(), bytes.fromhex(salt), int(iterations), dklen=len(digest) // 2
        )
    except ValueError:
        return False
    return hmac.compare_digest(computed.hex(), digest)


def _cert_needs_renewal(pem_path: pathlib.Path, ca_pem: str) -> bool:
    from cryptography import x509

    if not pem_path.exists():
        return True
    text = pem_path.read_text(encoding="utf-8")
    try:
        cert = x509.load_pem_x509_certificate(text[text.index("-----BEGIN CERTIFICATE-----") :].encode())
    except ValueError:
        return True
    if ca_pem.strip() not in text:
        return True
    return cert.not_valid_after_utc - dt.datetime.now(dt.UTC) < CERT_RENEW_BEFORE


def trino_secrets(root: Bao, directory: pathlib.Path, uid: int | None) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    ca_pem = root.request("GET", "pki/cert/ca")["data"]["certificate"]
    pem = directory / "trino.pem"
    if _cert_needs_renewal(pem, ca_pem):
        issued = root.request(
            "POST",
            "pki/issue/internal",
            {"common_name": "trino", "alt_names": "localhost", "ip_sans": "127.0.0.1", "ttl": "8760h"},
        )["data"]
        _write_if_changed(
            pem, "\n".join([issued["private_key"], issued["certificate"], issued["issuing_ca"]]) + "\n", 0o600
        )
        log.info("đã cấp chứng chỉ TLS cho Trino")
    _write_if_changed(directory / "ca.pem", ca_pem.strip() + "\n", 0o644)

    old = {}
    if (directory / "password.db").exists():
        old = dict(
            line.split(":", 1)
            for line in (directory / "password.db").read_text(encoding="utf-8").split()
            if ":" in line
        )
    lines = []
    for user, path in TRINO_USERS.items():
        password = root.read(path)["password"]
        hashed = old.get(user, "")
        lines.append(f"{user}:{hashed if _trino_hash_matches(hashed, password) else trino_password_hash(password)}")
    if _write_if_changed(directory / "password.db", "\n".join(lines) + "\n", 0o600):
        log.info("đã ghi tệp mật khẩu Trino")
    _write_if_changed(directory / "shared-secret", root.read("bms/trino-internal")["shared_secret"] + "\n", 0o600)
    _write_if_changed(directory / "admin.password", root.read(TRINO_USERS["bms-admin"])["password"] + "\n", 0o600)
    if uid is not None:
        for path in directory.iterdir():
            if path.stat().st_uid != uid:
                os.chown(path, uid, uid)


def write_internal_ca(root: Bao, paths: list[pathlib.Path]) -> None:
    ca_pem = root.request("GET", "pki/cert/ca")["data"]["certificate"].strip() + "\n"
    for path in paths:
        if _write_if_changed(path, ca_pem, 0o644):
            log.info("đã ghi CA nội bộ %s", path)


def run(
    addr: str,
    keys_file: pathlib.Path,
    approle_outputs: dict[str, pathlib.Path],
    s3_config_path: pathlib.Path | None,
    approle_uid: int | None = None,
    meili_config_path: pathlib.Path | None = None,
    trino_catalog_path: pathlib.Path | None = None,
    trino_uid: int | None = None,
    trino_secrets_dir: pathlib.Path | None = None,
    ca_outputs: list[pathlib.Path] | None = None,
) -> None:
    wait_reachable(addr)
    root = Bao(addr, init_and_unseal(addr, keys_file))
    configure(root)
    sync_secrets(root)
    if s3_config_path:
        settings = config.with_openbao(config._from_env(), root)
        if _write_if_changed(s3_config_path, json.dumps(storage.s3_identities(settings), indent=2), 0o644):
            log.info("đã ghi cấu hình S3 %s", s3_config_path)
    if meili_config_path:
        if _write_if_changed(
            meili_config_path, search.config_toml(root.read("bms/meilisearch-admin")["master_key"]), 0o600
        ):
            log.info("đã ghi cấu hình Meilisearch %s", meili_config_path)
    if trino_catalog_path:
        env = os.environ.get
        text = trino_catalog(
            root,
            env("TRINO_CATALOG_DB_URL", "jdbc:postgresql://db:5432/lakehouse"),
            env("S3_ENDPOINT", "http://seaweedfs:8333"),
            env("S3_LAKEHOUSE_BUCKET", "bms-lakehouse"),
        )
        if _write_if_changed(trino_catalog_path, text, 0o600):
            log.info("đã ghi catalog Trino %s", trino_catalog_path)
        if trino_uid is not None and trino_catalog_path.stat().st_uid != trino_uid:
            os.chown(trino_catalog_path, trino_uid, trino_uid)
    if trino_secrets_dir:
        trino_secrets(root, trino_secrets_dir, trino_uid)
    if ca_outputs:
        write_internal_ca(root, ca_outputs)
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
    meili_path = env("MEILI_CONFIG_PATH")
    trino_path = env("TRINO_CATALOG_PATH")
    trino_uid = env("TRINO_UID")
    trino_secrets_dir = env("TRINO_SECRETS_DIR")
    uid = env("APPROLE_UID")
    run(
        env("BAO_ADDR", "http://openbao:8200"),
        pathlib.Path(env("BAO_KEYS_FILE", "/openbao/keys/init.json")),
        parse_outputs(env("APPROLE_OUTPUTS", "")),
        pathlib.Path(s3_path) if s3_path else None,
        int(uid) if uid else None,
        pathlib.Path(meili_path) if meili_path else None,
        pathlib.Path(trino_path) if trino_path else None,
        int(trino_uid) if trino_uid else None,
        pathlib.Path(trino_secrets_dir) if trino_secrets_dir else None,
        [pathlib.Path(p) for p in env("INTERNAL_CA_OUTPUTS", "").split(",") if p],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
