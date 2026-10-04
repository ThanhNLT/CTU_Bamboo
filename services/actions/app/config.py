import os
from dataclasses import dataclass


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


def load() -> Settings:
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
    )
