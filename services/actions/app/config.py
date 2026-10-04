# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import os
from dataclasses import dataclass, replace
from urllib.parse import quote, urlparse, urlunparse

from .openbao import Bao, BaoError

# Secret trong OpenBao (KV v2 secret/<đường dẫn>) → trường Settings. Mỗi dịch vụ chỉ đọc
# được những đường dẫn policy của nó cho phép (ADR #25); đường dẫn bị từ chối thì giữ giá trị env.
SECRET_FIELDS = {
    "bms/actions": {"secret": "actions_secret"},
    "bms/flowable": {"username": "flowable_user", "password": "flowable_password"},
    "bms/hasura": {"admin_secret": "hasura_admin_secret"},
    "bms/keycloak": {"username": "keycloak_admin_user", "password": "keycloak_admin_password"},
    "bms/seaweedfs": {"access_key": "s3_access_key", "secret_key": "s3_secret_key"},
    "bms/seaweedfs-admin": {"access_key": "s3_admin_access_key", "secret_key": "s3_admin_secret_key"},
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
    keycloak_url: str             # địa chỉ nội bộ (Admin API), không qua cổng công khai
    keycloak_admin_user: str
    keycloak_admin_password: str
    web_origin: str               # địa chỉ ứng dụng trình duyệt thấy (redirect URI của bms-web)


# Giá trị mặc định chỉ dành cho máy dev (docker-compose.yml, .env.example). Chạy với
# BAMBOO_ENV=production mà còn giá trị nào trong số này thì dừng ngay, không khởi động.
DEV_DEFAULTS = {
    "POSTGRES_PASSWORD": "bms-dev",
    "HASURA_GRAPHQL_ADMIN_SECRET": "dev-admin-secret",
    "ACTIONS_SECRET": "dev-actions-secret",
    "KEYCLOAK_ADMIN_PASSWORD": "kcadmin-dev",
    "FLOWABLE_ADMIN_PASSWORD": "test",
    "DEMO_PASSWORD": "demo-password",
}


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
        raise SystemExit("BAMBOO_ENV=production nhưng còn giá trị mặc định của môi trường dev: "
                         + ", ".join(problems) + ". Đặt giá trị riêng trong .env (xem .env.example).")


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
    pg = read("bms/postgres")
    if pg:
        url = urlparse(settings.database_url)
        netloc = f"{quote(pg['username'], safe='')}:{quote(pg['password'], safe='')}@{url.hostname}"
        if url.port:
            netloc += f":{url.port}"
        changes["database_url"] = urlunparse(url._replace(netloc=netloc))
    return replace(settings, **changes)


def load() -> Settings:
    """Cấu hình từ biến môi trường; có BAO_ADDR và BAO_APPROLE_FILE thì secret lấy từ OpenBao."""
    settings = _from_env()
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    if addr and approle:
        settings = with_openbao(settings, Bao.from_approle_file(addr, approle))
    return settings


def _from_env() -> Settings:
    env = os.environ.get
    return Settings(
        database_url=env("DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms"),
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
    )
