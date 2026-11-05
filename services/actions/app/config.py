# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import logging
import os
import pathlib
import time
from dataclasses import dataclass, replace
from urllib.parse import quote, urlparse, urlunparse

import httpx

from bamboo_common.openbao import Bao, BaoError

log = logging.getLogger("config")

SECRET_FIELDS = {
    "bms/actions": {"secret": "actions_secret"},
    "bms/flowable": {"username": "flowable_user", "password": "flowable_password"},
    "bms/hasura": {"admin_secret": "hasura_admin_secret"},
    "bms/keycloak": {"username": "keycloak_admin_user", "password": "keycloak_admin_password"},
    "bms/keycloak-provisioner": {"client_secret": "keycloak_provisioner_secret"},
    "bms/seaweedfs": {"access_key": "s3_access_key", "secret_key": "s3_secret_key"},
    "bms/seaweedfs-admin": {"access_key": "s3_admin_access_key", "secret_key": "s3_admin_secret_key"},
    "bms/seaweedfs-search": {"access_key": "s3_search_access_key", "secret_key": "s3_search_secret_key"},
    "bms/seaweedfs-lakehouse": {"access_key": "s3_lakehouse_access_key", "secret_key": "s3_lakehouse_secret_key"},
    "bms/meilisearch-admin": {"master_key": "meili_master_key"},
    "bms/meilisearch-search": {"key": "meili_search_key"},
    "bms/meilisearch-indexer": {"key": "meili_indexer_key"},
    "bms/kafka-lakehouse": {"username": "kafka_username", "password": "kafka_password"},
    "bms/trino-actions": {"username": "trino_user", "password": "trino_password"},
}


@dataclass(frozen=True)
class Settings:
    database_url: str
    actions_secret: str
    flowable_url: str
    flowable_user: str
    flowable_password: str
    hasura_url: str
    hasura_admin_secret: str
    keycloak_jwks_url: str
    keycloak_issuer: str
    keycloak_clients: frozenset[str]
    s3_endpoint: str
    s3_public_endpoint: str
    s3_region: str
    s3_access_key: str
    s3_secret_key: str
    s3_admin_access_key: str
    s3_admin_secret_key: str
    s3_quarantine_bucket: str
    s3_documents_bucket: str
    clamav_host: str
    clamav_port: int
    scan_require_clamav: bool
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    smtp_from: str
    smtp_starttls: bool
    sms_gateway_url: str
    sms_gateway_token: str
    webhook_allow_private: bool
    anchor_url: str
    anchor_interval: float
    obs_enabled: bool
    keycloak_url: str
    keycloak_admin_user: str
    keycloak_admin_password: str
    web_origin: str
    keycloak_admin_url: str
    keycloak_provisioner_secret: str
    s3_search_access_key: str
    s3_search_secret_key: str
    meili_url: str
    meili_index: str
    meili_master_key: str
    meili_search_key: str
    meili_indexer_key: str
    tika_url: str
    gotenberg_url: str
    kafka_bootstrap: str
    kafka_username: str
    kafka_password: str
    lakehouse_catalog_url: str
    s3_lakehouse_bucket: str
    s3_lakehouse_access_key: str
    s3_lakehouse_secret_key: str
    trino_url: str
    trino_ca_file: str
    trino_user: str
    trino_password: str
    ollama_url: str = ""
    meili_chunk_index: str = "documents_kb_chunk"
    ai_chat_model: str = "qwen3:4b"
    ai_embed_model: str = "bge-m3"
    ai_min_score: float = 0.7
    ocr_url: str = ""
    sleeper_url: str = ""
    ai_cpu_models: tuple[str, ...] = ("bge-m3",)
    signature_trust_dir: str = "/repo/infra/platform/trust"
    signature_online: bool = True
    setup_allow_unverified: bool = True
    # Mở trang đăng ký cả khi máy đã có công ty (bản demo: dữ liệu mẫu và đăng ký cùng dùng được); không cần mã 24 giờ
    setup_open_signup: bool = False


DEV_DEFAULTS = {
    "POSTGRES_PASSWORD": "bms-dev",
    "ACTIONS_DB_PASSWORD": "actions-db-dev",
    "HASURA_DB_PASSWORD": "hasura-db-dev",
    "KEYCLOAK_DB_PASSWORD": "keycloak-db-dev",
    "FLOWABLE_DB_PASSWORD": "flowable-db-dev",
    "CDC_DB_PASSWORD": "cdc-db-dev",
    "LAKEHOUSE_DB_PASSWORD": "lakehouse-db-dev",
    "DEBEZIUM_KAFKA_PASSWORD": "debezium-kafka-dev",
    "LAKEHOUSE_KAFKA_PASSWORD": "lakehouse-kafka-dev",
    "HASURA_GRAPHQL_ADMIN_SECRET": "dev-admin-secret",
    "ACTIONS_SECRET": "dev-actions-secret",
    "KEYCLOAK_ADMIN_PASSWORD": "kcadmin-dev",
    "FLOWABLE_ADMIN_PASSWORD": "test",
    "DEMO_PASSWORD": "demo-password",
}


def production_problems(env: dict[str, str] | None = None) -> list[str]:
    env = os.environ if env is None else env
    return [name for name, dev in DEV_DEFAULTS.items() if env.get(name, dev) in ("", dev)]


def assert_production_ready(env: dict[str, str] | None = None) -> None:
    env = os.environ if env is None else env
    if env.get("BAMBOO_ENV", "development").lower() != "production":
        return
    problems = production_problems(env)
    if problems:
        raise SystemExit(
            "BAMBOO_ENV=production nhưng còn giá trị mặc định của môi trường dev: "
            + ", ".join(problems)
            + ". Đặt giá trị riêng trong .env (xem .env.example)."
        )


def with_openbao(settings: Settings, bao: Bao) -> Settings:
    def read(path: str) -> dict | None:
        try:
            return bao.read(path)
        except BaoError as exc:
            if exc.status == 403:
                return None
            raise

    changes = {}
    for path, fields in SECRET_FIELDS.items():
        values = read(path) or {}
        changes.update({attr: values[key] for key, attr in fields.items() if key in values})
    for path, attr in (("bms/postgres", "database_url"), ("bms/lakehouse", "lakehouse_catalog_url")):
        creds = read(path)
        if creds:
            changes[attr] = _with_credentials(getattr(settings, attr), creds["username"], creds["password"])
    return replace(settings, **changes)


def kafka_options(settings: Settings) -> dict:
    options = {"bootstrap_servers": settings.kafka_bootstrap}
    if settings.kafka_password:
        options.update(
            security_protocol="SASL_PLAINTEXT",
            sasl_mechanism="SCRAM-SHA-512",
            sasl_plain_username=settings.kafka_username,
            sasl_plain_password=settings.kafka_password,
        )
    return options


def _with_credentials(url: str, username: str, password: str) -> str:
    parsed = urlparse(url)
    netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{parsed.hostname}"
    if parsed.port:
        netloc += f":{parsed.port}"
    return urlunparse(parsed._replace(netloc=netloc))


def _login(addr: str, approle: str, wait: float) -> Bao:
    """Đăng nhập AppRole, chờ tối đa `wait` giây khi OpenBao chưa sẵn sàng (đang khởi động, đang khóa chờ
    `openbao-unseal`) thay vì thoát ngay để Docker khởi động lại liên tục."""
    deadline = time.monotonic() + wait
    while True:
        try:
            return Bao.from_approle_file(addr, approle)
        except (httpx.HTTPError, BaoError) as exc:
            if time.monotonic() >= deadline or (isinstance(exc, BaoError) and exc.status < 500):
                raise
            log.warning("chờ OpenBao sẵn sàng: %s", exc)
            time.sleep(3)


def load() -> Settings:
    settings = _from_env()
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    if addr and approle:
        settings = with_openbao(settings, _login(addr, approle, float(os.environ.get("BAO_WAIT_SECONDS", "120"))))
    return settings


def _from_env() -> Settings:
    env = os.environ.get
    from .search import INDEXER_KEY_UID, SEARCH_KEY_UID, derive_key

    master = env("MEILI_MASTER_KEY", "")
    return Settings(
        database_url=env("DATABASE_URL", "postgresql://bamboo_actions:actions-db-dev@db:5432/bms"),
        actions_secret=env("ACTIONS_SECRET", "dev-actions-secret"),
        flowable_url=env("FLOWABLE_URL", "http://flowable:8080/flowable-rest/service"),
        flowable_user=env("FLOWABLE_USER", "rest-admin"),
        flowable_password=env("FLOWABLE_PASSWORD", "test"),
        hasura_url=env("HASURA_URL", "http://hasura:8080"),
        hasura_admin_secret=env("HASURA_GRAPHQL_ADMIN_SECRET", "dev-admin-secret"),
        keycloak_jwks_url=env("KEYCLOAK_JWKS_URL", "http://keycloak:8080/realms/bms/protocol/openid-connect/certs"),
        keycloak_issuer=env("KEYCLOAK_ISSUER", "http://localhost:8080/realms/bms"),
        keycloak_clients=frozenset(env("KEYCLOAK_CLIENTS", "bms-web,bms-e2e").split(",")),
        s3_endpoint=env("S3_ENDPOINT", "http://seaweedfs:8333"),
        s3_public_endpoint=env("S3_PUBLIC_ENDPOINT", "http://localhost:8333"),
        s3_region=env("S3_REGION", "us-east-1"),
        s3_access_key=env("S3_ACCESS_KEY", "bms-app"),
        s3_secret_key=env("S3_SECRET_KEY", "bms-app-dev-secret"),
        s3_admin_access_key=env("S3_ADMIN_ACCESS_KEY", "bms-admin"),
        s3_admin_secret_key=env("S3_ADMIN_SECRET_KEY", "bms-admin-dev-secret"),
        s3_quarantine_bucket=env("S3_QUARANTINE_BUCKET", "bms-quarantine"),
        s3_documents_bucket=env("S3_DOCUMENTS_BUCKET", "bms-documents"),
        clamav_host=env("CLAMAV_HOST", ""),
        clamav_port=int(env("CLAMAV_PORT", "3310")),
        scan_require_clamav=env("SCAN_REQUIRE_CLAMAV", "false").lower() in ("1", "true", "yes"),
        smtp_host=env("SMTP_HOST", ""),
        smtp_port=int(env("SMTP_PORT", "25")),
        smtp_user=env("SMTP_USER", ""),
        smtp_password=env("SMTP_PASSWORD", ""),
        smtp_from=env("SMTP_FROM", "Bamboo DX-OS <no-reply@bamboo.local>"),
        smtp_starttls=env("SMTP_STARTTLS", "false").lower() in ("1", "true", "yes"),
        sms_gateway_url=env("SMS_GATEWAY_URL", ""),
        sms_gateway_token=env("SMS_GATEWAY_TOKEN", ""),
        webhook_allow_private=env("WEBHOOK_ALLOW_PRIVATE", "false").lower() in ("1", "true", "yes"),
        anchor_url=env("ANCHOR_URL", ""),
        anchor_interval=float(env("ANCHOR_INTERVAL_SECONDS", "300")),
        obs_enabled=env("OBS_ENABLED", "true").lower() in ("1", "true", "yes"),
        keycloak_url=env("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080"),
        keycloak_admin_user=env("KEYCLOAK_ADMIN", "kcadmin"),
        keycloak_admin_password=env("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"),
        web_origin=env("WEB_ORIGIN", "http://localhost:8000"),
        keycloak_admin_url=env("KEYCLOAK_ADMIN_URL", ""),
        keycloak_provisioner_secret=env("KEYCLOAK_PROVISIONER_SECRET", ""),
        s3_search_access_key=env("S3_SEARCH_ACCESS_KEY", "bms-search"),
        s3_search_secret_key=env("S3_SEARCH_SECRET_KEY", "bms-search-dev-secret"),
        meili_url=env("MEILI_URL", "http://meilisearch:7700"),
        meili_index=env("MEILI_INDEX", "documents"),
        meili_master_key=master,
        meili_search_key=env("MEILI_SEARCH_KEY") or (derive_key(master, SEARCH_KEY_UID) if master else ""),
        meili_indexer_key=env("MEILI_INDEXER_KEY") or (derive_key(master, INDEXER_KEY_UID) if master else ""),
        tika_url=env("TIKA_URL", "http://tika:9998"),
        gotenberg_url=env("GOTENBERG_URL", "http://gotenberg:3000"),
        kafka_bootstrap=env("KAFKA_BOOTSTRAP", "kafka:9092"),
        kafka_username=env("KAFKA_USERNAME", ""),
        kafka_password=env("KAFKA_PASSWORD", ""),
        lakehouse_catalog_url=env(
            "LAKEHOUSE_CATALOG_URL", "postgresql+psycopg://bamboo_lakehouse:lakehouse-db-dev@db:5432/lakehouse"
        ),
        s3_lakehouse_bucket=env("S3_LAKEHOUSE_BUCKET", "bms-lakehouse"),
        s3_lakehouse_access_key=env("S3_LAKEHOUSE_ACCESS_KEY", "bms-lakehouse"),
        s3_lakehouse_secret_key=env("S3_LAKEHOUSE_SECRET_KEY", "bms-lakehouse-dev-secret"),
        trino_url=env("TRINO_URL", "https://trino:8443"),
        trino_ca_file=env("TRINO_CA_FILE", ""),
        trino_user=env("TRINO_USER", "bms-actions"),
        trino_password=env("TRINO_PASSWORD", ""),
        ollama_url=env("OLLAMA_URL", ""),
        meili_chunk_index=env("MEILI_CHUNK_INDEX", "documents_kb_chunk"),
        ai_chat_model=env("AI_CHAT_MODEL", "qwen3:4b"),
        ai_embed_model=env("AI_EMBED_MODEL", "bge-m3"),
        ai_min_score=float(env("AI_MIN_SCORE", "0.7")),
        ocr_url=env("OCR_URL", ""),
        sleeper_url=env("SLEEPER_URL", ""),
        ai_cpu_models=tuple(m.strip() for m in env("AI_CPU_MODELS", "bge-m3").split(",") if m.strip()),
        signature_trust_dir=env(
            "SIGNATURE_TRUST_DIR", str(pathlib.Path(__file__).resolve().parents[3] / "infra/platform/trust")
        ),
        signature_online=env("SIGNATURE_ONLINE", "true").lower() in ("1", "true", "yes"),
        setup_allow_unverified=env("SETUP_ALLOW_UNVERIFIED", "true").lower() in ("1", "true", "yes"),
        setup_open_signup=env("SETUP_OPEN_SIGNUP", "false").lower() in ("1", "true", "yes"),
    )
