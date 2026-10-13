# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Kiểm thử tích hợp: PostgreSQL thật, Hasura và Flowable thật (bỏ qua nếu không truy cập được).

Biến môi trường (mặc định khớp `make test-actions` trong docker compose):
  TEST_DATABASE_URL   CSDL kiểm thử, bị xóa và tạo lại mỗi phiên (Hasura phải trỏ BMS_DATABASE_URL vào đây)
  TEST_APP_DATABASE_URL  cùng CSDL nhưng bằng tài khoản ứng dụng (bamboo_actions): dịch vụ actions chạy
                      trong lúc kiểm thử dùng URL này để lộ quyền còn thiếu như production (ADR #35)
  HASURA_URL, HASURA_GRAPHQL_ADMIN_SECRET, FLOWABLE_URL, FLOWABLE_USER, FLOWABLE_PASSWORD
  S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_*_KEY  SeaweedFS (kiểm thử tệp đính kèm)
  GOTENBERG_URL       in phiếu PDF
  MEILI_URL, MEILI_MASTER_KEY, TIKA_URL  tìm kiếm (khóa chủ đọc từ OpenBao nếu có BAO_KEYS_FILE); index
                      kiểm thử MEILI_TEST_INDEX (mặc định documents_test), tạo lại mỗi phiên
  ACTIONS_PORT        cổng chạy dịch vụ actions trong lúc kiểm thử (Hasura gọi vào ACTIONS_URL)
  WAIT_FOR_SERVICES   số giây chờ Hasura/Flowable/SeaweedFS trước khi bỏ qua kiểm thử cần chúng (mặc định 180)
  REQUIRE_SERVICES=1  thiếu Hasura/Flowable/SeaweedFS thì báo lỗi thay vì bỏ qua (dùng trong `make test-actions`)
"""

import json
import os
import pathlib
import ssl
import threading
import time
import uuid
from urllib.parse import urlparse, urlunparse

import httpx
import psycopg
import pytest
import uvicorn
from psycopg.rows import dict_row

from app import bootstrap, config, main, search, storage
from app.flowable import FlowableClient
from app.openbao import Bao

ROOT = pathlib.Path(__file__).resolve().parents[3]
TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms_hasura_test")
TEST_APP_DB_URL = os.environ.get("TEST_APP_DATABASE_URL") or TEST_DB_URL
ACTIONS_PORT = int(os.environ.get("ACTIONS_PORT", "8090"))
MEILI_TEST_INDEX = os.environ.get("MEILI_TEST_INDEX", "documents_test")
SETTINGS = config.load()


def _admin_url(url: str) -> str:
    return urlunparse(urlparse(url)._replace(path="/postgres"))


@pytest.fixture(scope="session")
def database() -> str:
    """CSDL kiểm thử sạch: migration, hàm tiện ích db/tests/helpers.sql, dữ liệu mẫu Tập đoàn X."""
    name = urlparse(TEST_DB_URL).path.lstrip("/")
    with psycopg.connect(_admin_url(TEST_DB_URL), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        admin.execute(f'CREATE DATABASE "{name}"')
    with psycopg.connect(TEST_DB_URL) as conn:
        for path in sorted((ROOT / "db/migrations/bms").glob("*.sql")) + [ROOT / "db/tests/helpers.sql"]:
            conn.execute(path.read_text(encoding="utf-8"))
        conn.execute("SELECT test.fixture()")
        # Quyền lập/xem đề nghị cho mọi vị trí ở Phòng Mua hàng Điện thoại X.
        conn.execute("""
            INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'MUA_HANG', 'Mua hàng');
            INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
            SELECT tenant_id, id, p FROM core.role, unnest(ARRAY['proc.purchase_request.create',
                                                                 'proc.purchase_request.read']) p
            WHERE code = 'MUA_HANG';
            INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
            SELECT r.tenant_id, r.id, test.id('P_NV_MH_DT'), 'UNIT' FROM core.role r WHERE r.code = 'MUA_HANG';
        """)
        # Quyền của tài khoản ứng dụng như job migrate cấp cho CSDL bms (bỏ qua nếu chưa có role).
        conn.execute((ROOT / "db/roles/grants.sql").read_text(encoding="utf-8"))
    return TEST_DB_URL


@pytest.fixture
def conn(database):
    with psycopg.connect(database, row_factory=dict_row, autocommit=True) as c:
        yield c


def ids(conn: psycopg.Connection, *keys: str) -> dict[str, str]:
    return {k: str(conn.execute("SELECT test.id(%s) AS id", (k,)).fetchone()["id"]) for k in keys}


@pytest.fixture
def org(conn):
    """Một công ty con riêng cho từng kiểm thử (dưới Tập đoàn X): giám đốc, trưởng phòng, chuyên viên.

    Trả về hàm k(tên) → khóa trong test.ids (gắn hậu tố riêng để không đụng kiểm thử khác).
    """
    sfx = uuid.uuid4().hex[:8]

    def k(name: str) -> str:
        return f"{name}_{sfx}"

    conn.execute(f"""
        SELECT test.unit('TDX', '{k("CTY")}', 'ME', 'CONG_TY', 'Công ty {sfx}', true);
        SELECT test.unit('TDX', '{k("PHONG")}', '{k("CTY")}', 'PHONG', 'Phòng {sfx}');
        SELECT test.position('TDX', '{k("P_GD")}', '{k("CTY")}', 'Giám đốc', true);
        SELECT test.position('TDX', '{k("P_TP")}', '{k("PHONG")}', 'Trưởng phòng', true);
        SELECT test.position('TDX', '{k("P_NV")}', '{k("PHONG")}', 'Chuyên viên');
        SELECT test.person('TDX', '{k("gd")}', 'Giám đốc {sfx}');
        SELECT test.person('TDX', '{k("tp")}', 'Trưởng phòng {sfx}');
        SELECT test.person('TDX', '{k("nv")}', 'Chuyên viên {sfx}');
        SELECT test.assign('TDX', '{k("gd")}', '{k("P_GD")}');
        SELECT test.assign('TDX', '{k("tp")}', '{k("P_TP")}');
        SELECT test.assign('TDX', '{k("nv")}', '{k("P_NV")}');
    """)
    return k


def pr(conn, key: str, person: str, position: str, amount: int, submit: bool = True) -> str:
    return str(conn.execute("SELECT test.pr(%s, %s, %s, %s, %s) AS id",
                            (key, person, position, amount, submit)).fetchone()["id"])


def status(conn, pr_id: str) -> str:
    return conn.execute("SELECT status FROM proc.purchase_request WHERE id = %s", (pr_id,)).fetchone()["status"]


def open_task(conn, pr_id: str) -> dict | None:
    return conn.execute(
        """SELECT t.* FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
           WHERE s.entity_id = %s AND t.status = 'OPEN'""", (pr_id,)).fetchone()


# --- Dịch vụ ngoài -------------------------------------------------------------

WAIT_SECONDS = float(os.environ.get("WAIT_FOR_SERVICES", "180"))


def _reachable(url: str, **kw) -> bool:
    """Chờ dịch vụ sẵn sàng (Flowable khởi động mất khoảng nửa phút) trước khi kết luận bỏ qua."""
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            if httpx.get(url, timeout=3, **kw).status_code < 500:
                return True
        except httpx.HTTPError:
            pass
        if time.monotonic() > deadline:
            return False
        time.sleep(2)


def _missing(name: str):
    if os.environ.get("REQUIRE_SERVICES") == "1":
        pytest.fail(f"{name} không truy cập được")
    pytest.skip(f"{name} không truy cập được")


@pytest.fixture(scope="session")
def flowable(database) -> FlowableClient:
    if not _reachable(SETTINGS.flowable_url + "/management/engine",
                      auth=(SETTINGS.flowable_user, SETTINGS.flowable_password)):
        _missing("Flowable")
    client = FlowableClient(SETTINGS.flowable_url, SETTINGS.flowable_user, SETTINGS.flowable_password)
    bootstrap.deploy_bpmn(client)
    return client


@pytest.fixture(scope="session")
def s3(database) -> storage.Storage:
    """SeaweedFS với hai bucket. Job bootstrap tạo bucket khi chạy thật; khóa ứng dụng không tạo
    được bucket nên chỉ dùng khóa admin khi bucket chưa có (chạy ngoài compose)."""
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            s3 = storage.Storage(SETTINGS)
            try:
                for bucket in (s3.quarantine, s3.documents):
                    s3.s3.head_bucket(Bucket=bucket)
            except Exception:  # noqa: BLE001
                storage.ensure_buckets(SETTINGS)
            return s3
        except Exception:  # noqa: BLE001
            if time.monotonic() > deadline:
                _missing("SeaweedFS")
            time.sleep(2)


@pytest.fixture(scope="session")
def gotenberg(database) -> str:
    if not _reachable(SETTINGS.gotenberg_url + "/health"):
        _missing("Gotenberg")
    return SETTINGS.gotenberg_url


def root_settings() -> config.Settings:
    """Cấu hình với mọi secret đọc từ OpenBao bằng root token (container kiểm thử chỉ có AppRole actions, không đọc
    được secret của dịch vụ khác); chạy native không có OpenBao thì giữ giá trị env."""
    keys = pathlib.Path(os.environ.get("BAO_KEYS_FILE", "/openbao/keys/init.json"))
    addr = os.environ.get("BAO_ADDR")
    if addr and keys.exists():
        return config.with_openbao(config._from_env(), Bao(addr, json.loads(keys.read_text())["root_token"]))
    return SETTINGS


def trino_admin_password() -> str:
    """Mật khẩu bms-admin của Trino (ADR #45): đọc từ OpenBao bằng root token, chạy native thì TRINO_ADMIN_PASSWORD."""
    keys = pathlib.Path(os.environ.get("BAO_KEYS_FILE", "/openbao/keys/init.json"))
    addr = os.environ.get("BAO_ADDR")
    if addr and keys.exists():
        creds = Bao(addr, json.loads(keys.read_text())["root_token"]).read("bms/trino-admin")
        if creds:
            return creds["password"]
    return os.environ.get("TRINO_ADMIN_PASSWORD", "")


def trino_reachable(settings: config.Settings) -> bool:
    verify = ssl.create_default_context(cafile=settings.trino_ca_file) if settings.trino_ca_file else True
    return _reachable(settings.trino_url + "/v1/info", verify=verify)


@pytest.fixture(scope="session")
def search_settings(database) -> config.Settings:
    """Cấu hình tìm kiếm cho kiểm thử: khóa chủ, khóa ghi chỉ mục, khóa S3 chỉ đọc lấy từ OpenBao (root_settings)
    hoặc từ MEILI_MASTER_KEY khi chạy native. Index kiểm thử tạo lại."""
    settings = config.Settings(**{**root_settings().__dict__, "database_url": TEST_APP_DB_URL,
                                  "meili_index": MEILI_TEST_INDEX})
    if not settings.meili_master_key or not _reachable(settings.meili_url + "/health"):
        _missing("Meilisearch")
    if not _reachable(settings.tika_url + "/version"):
        _missing("Tika")
    admin = search.Meili(settings.meili_url, settings.meili_master_key)
    if admin.request("GET", f"/indexes/{MEILI_TEST_INDEX}", ok404=True):
        admin.wait(admin.request("DELETE", f"/indexes/{MEILI_TEST_INDEX}"))
    search.ensure_index(admin, MEILI_TEST_INDEX)
    search.ensure_keys(admin)
    return settings


@pytest.fixture(scope="session")
def actions_server(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": TEST_APP_DB_URL,
                                  "meili_index": MEILI_TEST_INDEX})
    server = uvicorn.Server(uvicorn.Config(main.create_app(settings), host="0.0.0.0", port=ACTIONS_PORT,
                                           log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.1)
    yield f"http://127.0.0.1:{ACTIONS_PORT}"
    server.should_exit = True
    thread.join(5)


@pytest.fixture(scope="session")
def hasura(database, actions_server):
    if not _reachable(SETTINGS.hasura_url + "/healthz"):
        _missing("Hasura")
    bootstrap.apply_hasura_metadata(SETTINGS.hasura_url, SETTINGS.hasura_admin_secret)
    return Gql(SETTINGS.hasura_url, SETTINGS.hasura_admin_secret)


class Gql:
    """Gọi GraphQL dưới vai một người dùng (role user) bằng admin secret + header phiên."""

    def __init__(self, url: str, secret: str):
        self.http = httpx.Client(base_url=url, timeout=30)
        self.secret = secret

    def __call__(self, query: str, variables: dict | None = None, *, person: str, tenant: str) -> dict:
        headers = {"x-hasura-admin-secret": self.secret, "x-hasura-role": "user",
                   "x-hasura-user-id": person, "x-hasura-tenant-id": tenant}
        return self.http.post("/v1/graphql", json={"query": query, "variables": variables or {}},
                              headers=headers).json()
