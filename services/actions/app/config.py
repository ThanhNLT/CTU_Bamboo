# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

# ===== Thư viện chuẩn =====
import os
from dataclasses import dataclass, replace
from urllib.parse import quote, urlparse, urlunparse

# ===== Module nội bộ =====
from .openbao import Bao, BaoError

# ===== Hằng số & cấu hình =====
# Secret trong OpenBao (KV v2 secret/<đường dẫn>) → trường Settings (ADR #25). Mỗi dịch vụ chỉ đọc
# được những đường dẫn mà policy của nó cho phép; đường dẫn bị từ chối thì giữ giá trị env.
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


# ===== Kiểu dữ liệu =====
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
    keycloak_url: str  # địa chỉ nội bộ (Admin API), không qua cổng công khai
    keycloak_admin_user: str
    keycloak_admin_password: str
    web_origin: str  # địa chỉ ứng dụng trình duyệt thấy (redirect URI của bms-web)
    keycloak_provisioner_secret: str  # client bms-provisioner: chỉ quản lý người dùng realm bms (ADR #41)
    s3_search_access_key: str  # search-sync: chỉ đọc bucket tài liệu (ADR #36)
    s3_search_secret_key: str
    meili_url: str
    meili_index: str
    meili_master_key: str  # chỉ job bootstrap (tạo index, khóa API)
    meili_search_key: str  # actions: chỉ tìm
    meili_indexer_key: str  # search-sync: ghi chỉ mục
    tika_url: str
    gotenberg_url: str  # in phiếu PDF (ADR #37)
    kafka_bootstrap: str  # CDC (ADR #38)
    kafka_username: str  # SCRAM (ADR #45); bỏ trống: Kafka không xác thực (chạy native khi dev)
    kafka_password: str
    lakehouse_catalog_url: str  # catalog Iceberg (SQLAlchemy, CSDL lakehouse; ADR #39)
    s3_lakehouse_bucket: str
    s3_lakehouse_access_key: str  # lakehouse-sink: chỉ đọc/ghi bucket lakehouse
    s3_lakehouse_secret_key: str
    trino_url: str  # truy vấn Lakehouse (ADR #45): HTTPS, CA nội bộ của OpenBao
    trino_ca_file: str
    trino_user: str  # bms-actions: chỉ mượn danh người dùng tenant t_<tenant_id>
    trino_password: str


# ===== Hằng số & cấu hình =====
# Giá trị mặc định chỉ dành cho máy dev (docker-compose.yml, .env.example). Chạy với
# BAMBOO_ENV=production mà còn giá trị nào trong số này thì dừng ngay, không khởi động.
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


# ===== Hàm =====
def production_problems(env: dict[str, str] | None = None) -> list[str]:
    """Biến còn giữ giá trị dev mặc định hoặc để trống."""
    env = os.environ if env is None else env
    return [name for name, dev in DEV_DEFAULTS.items() if env.get(name, dev) in ("", dev)]


def assert_production_ready(env: dict[str, str] | None = None) -> None:
    """BAMBOO_ENV=production mà còn giá trị dev mặc định thì dừng (job openbao-init gọi trước mọi dịch vụ)."""
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
    """Thay các giá trị env bằng secret đọc được từ OpenBao."""

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
    """Tham số kết nối cho kafka-python: SCRAM-SHA-512 khi có tài khoản (ADR #45)."""
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


def load() -> Settings:
    """Cấu hình từ biến môi trường; có BAO_ADDR và BAO_APPROLE_FILE thì secret lấy từ OpenBao."""
    settings = _from_env()
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    if addr and approle:
        settings = with_openbao(settings, Bao.from_approle_file(addr, approle))
    return settings


def _from_env() -> Settings:
    env = os.environ.get
    from .search import INDEXER_KEY_UID, SEARCH_KEY_UID, derive_key  # search dùng config: import muộn

    # Chạy ngoài compose (kiểm thử native): đặt MEILI_MASTER_KEY thì hai khóa API suy ra từ khóa chủ.
    master = env("MEILI_MASTER_KEY", "")
    return Settings(
        database_url=env("DATABASE_URL", "postgresql://bamboo_actions:actions-db-dev@db:5432/bms"),
        actions_secret=env("ACTIONS_SECRET", "dev-actions-secret"),
        flowable_url=env("FLOWABLE_URL", "http://flowable:8080/flowable-rest/service"),
        flowable_user=env("FLOWABLE_USER", "rest-admin"),
        flowable_password=env("FLOWABLE_PASSWORD", "test"),
        hasura_url=env("HASURA_URL", "http://hasura:8080"),
        hasura_admin_secret=env("HASURA_GRAPHQL_ADMIN_SECRET", "dev-admin-secret"),
        # JWKS lấy qua mạng nội bộ; issuer là URL trình duyệt thấy (KC_HOSTNAME).
        keycloak_jwks_url=env("KEYCLOAK_JWKS_URL", "http://keycloak:8080/realms/bms/protocol/openid-connect/certs"),
        keycloak_issuer=env("KEYCLOAK_ISSUER", "http://localhost:8080/realms/bms"),
        keycloak_clients=frozenset(env("KEYCLOAK_CLIENTS", "bms-web,bms-e2e").split(",")),
        # S3 (SeaweedFS). Link có chữ ký dùng địa chỉ trình duyệt thấy (ADR #26).
        s3_endpoint=env("S3_ENDPOINT", "http://seaweedfs:8333"),
        s3_public_endpoint=env("S3_PUBLIC_ENDPOINT", "http://localhost:8333"),
        s3_region=env("S3_REGION", "us-east-1"),
        s3_access_key=env("S3_ACCESS_KEY", "bms-app"),
        s3_secret_key=env("S3_SECRET_KEY", "bms-app-dev-secret"),
        s3_admin_access_key=env("S3_ADMIN_ACCESS_KEY", "bms-admin"),
        s3_admin_secret_key=env("S3_ADMIN_SECRET_KEY", "bms-admin-dev-secret"),
        s3_quarantine_bucket=env("S3_QUARANTINE_BUCKET", "bms-quarantine"),
        s3_documents_bucket=env("S3_DOCUMENTS_BUCKET", "bms-documents"),
        # Bỏ trống: chưa quét virus, confirm_upload ghi "bỏ qua" và vẫn nhận tệp.
        clamav_host=env("CLAMAV_HOST", ""),
        clamav_port=int(env("CLAMAV_PORT", "3310")),
        keycloak_url=env("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080"),
        keycloak_admin_user=env("KEYCLOAK_ADMIN", "kcadmin"),
        keycloak_admin_password=env("KEYCLOAK_ADMIN_PASSWORD", "kcadmin-dev"),
        web_origin=env("WEB_ORIGIN", "http://localhost:8000"),
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
    )
