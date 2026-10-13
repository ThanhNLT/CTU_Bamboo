# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""OpenBao (ADR #25): khởi tạo lặp lại được, AppRole đặc quyền tối thiểu, transit, cấu hình đọc từ két.

Cần OpenBao đã được openbao-init khởi tạo: BAO_ADDR và BAO_KEYS_FILE (file khóa của openbao-init).
"""

import json
import os
import pathlib

import httpx
import pytest

from app import config, openbao_init, search
from app.openbao import Bao, BaoError
from conftest import _missing

ADDR = os.environ.get("BAO_ADDR", "")
KEYS = pathlib.Path(os.environ.get("BAO_KEYS_FILE", "/openbao/keys/init.json"))


@pytest.fixture(scope="module")
def roles(tmp_path_factory) -> dict[str, pathlib.Path]:
    if not ADDR or not KEYS.exists():
        _missing("OpenBao (BAO_ADDR, BAO_KEYS_FILE)")
    try:
        httpx.get(f"{ADDR}/v1/sys/health", timeout=3)
    except httpx.HTTPError:
        _missing("OpenBao")
    out = tmp_path_factory.mktemp("bao")
    files = {
        "actions": out / "actions.json",
        "bootstrap": out / "bootstrap.json",
        "search": out / "search.json",
        "lakehouse": out / "lakehouse.json",
    }
    openbao_init.run(ADDR, KEYS, files, out / "s3.json", meili_config_path=out / "meili.toml")
    return {**files, "s3": out / "s3.json", "meili": out / "meili.toml"}


def denied(fn) -> bool:
    try:
        fn()
    except BaoError as exc:
        return exc.status == 403
    return False


def test_chay_lai_khong_doi(roles):
    root = Bao(ADDR, json.loads(KEYS.read_text())["root_token"])
    before = root.request("GET", "secret/metadata/bms/seaweedfs")["data"]["current_version"]
    secret_id = json.loads(roles["actions"].read_text())["secret_id"]
    openbao_init.run(ADDR, KEYS, {"actions": roles["actions"]}, None)
    assert root.request("GET", "secret/metadata/bms/seaweedfs")["data"]["current_version"] == before, (
        "khóa S3 chỉ sinh một lần"
    )
    assert json.loads(roles["actions"].read_text())["secret_id"] == secret_id, "còn đăng nhập được thì giữ secret-id"
    assert oct(roles["actions"].stat().st_mode & 0o777) == "0o400"


def test_dac_quyen_toi_thieu(roles):
    actions = Bao.from_approle_file(ADDR, roles["actions"])
    assert actions.read("bms/seaweedfs")["access_key"] == "bms-app"
    assert actions.read("bms/postgres") and actions.read("bms/actions")
    for path in ("bms/keycloak", "bms/hasura", "bms/seaweedfs-admin"):
        assert denied(lambda p=path: actions.read(p)), f"actions không được đọc {path}"
    assert denied(lambda: actions.write("bms/actions", {"secret": "x"})), "actions không ghi được secret"

    bootstrap = Bao.from_approle_file(ADDR, roles["bootstrap"])
    assert bootstrap.read("bms/seaweedfs-admin")["access_key"] == "bms-admin"
    assert bootstrap.read("bms/hasura")
    assert denied(lambda: bootstrap.read("bms/postgres"))
    assert denied(lambda: bootstrap.encrypt("x")), "bootstrap không dùng được khóa pii"


def test_dac_quyen_tao_tai_khoan(roles):
    """ADR #41: secret client bms-provisioner sinh một lần; bootstrap đọc để đặt cho client, actions/flow-sync đọc
    để tạo tài khoản nhân viên mới; search-sync và lakehouse-sink không đọc được."""
    root = Bao(ADDR, json.loads(KEYS.read_text())["root_token"])
    secret = root.read("bms/keycloak-provisioner")["client_secret"]
    assert len(secret) >= 32
    for role in ("actions", "bootstrap"):
        assert Bao.from_approle_file(ADDR, roles[role]).read("bms/keycloak-provisioner")["client_secret"] == secret
    for role in ("search", "lakehouse"):
        client = Bao.from_approle_file(ADDR, roles[role])
        assert denied(lambda c=client: c.read("bms/keycloak-provisioner")), f"{role} không được đọc"
    openbao_init.run(ADDR, KEYS, {}, None)
    assert root.read("bms/keycloak-provisioner")["client_secret"] == secret, "chạy lại không sinh secret mới"


def test_dac_quyen_tim_kiem(roles):
    """ADR #36: khóa chủ Meilisearch chỉ bootstrap đọc; actions chỉ có khóa tìm; search-sync có khóa ghi
    chỉ mục và khóa S3 chỉ đọc."""
    root = Bao(ADDR, json.loads(KEYS.read_text())["root_token"])
    master = root.read("bms/meilisearch-admin")["master_key"]
    assert len(master) >= 32

    actions = Bao.from_approle_file(ADDR, roles["actions"])
    assert actions.read("bms/meilisearch-search")["key"] == search.derive_key(master, search.SEARCH_KEY_UID)
    for path in ("bms/meilisearch-admin", "bms/meilisearch-indexer", "bms/seaweedfs-search"):
        assert denied(lambda p=path: actions.read(p)), f"actions không được đọc {path}"

    indexer = Bao.from_approle_file(ADDR, roles["search"])
    assert indexer.read("bms/meilisearch-indexer")["key"] == search.derive_key(master, search.INDEXER_KEY_UID)
    assert indexer.read("bms/seaweedfs-search")["access_key"] == "bms-search"
    assert indexer.read("bms/postgres")
    for path in ("bms/meilisearch-admin", "bms/meilisearch-search", "bms/seaweedfs", "bms/actions", "bms/flowable"):
        assert denied(lambda p=path: indexer.read(p)), f"search-sync không được đọc {path}"
    assert denied(lambda: indexer.encrypt("x"))

    bootstrap = Bao.from_approle_file(ADDR, roles["bootstrap"])
    assert bootstrap.read("bms/meilisearch-admin")["master_key"] == master

    assert f'master_key = "{master}"' in roles["meili"].read_text()
    assert oct(roles["meili"].stat().st_mode & 0o777) == "0o600"
    s3 = {i["name"]: i for i in json.loads(roles["s3"].read_text())["identities"]}
    assert s3["bms-search"]["actions"] == ["Read:bms-documents"], "search-sync chỉ đọc bucket tài liệu"

    # Chạy lại không sinh khóa chủ mới, không ghi lại tệp cấu hình (SeaweedFS nạp lại khi tệp đổi).
    mtime = roles["s3"].stat().st_mtime_ns
    openbao_init.run(ADDR, KEYS, {}, roles["s3"], meili_config_path=roles["meili"])
    assert root.read("bms/meilisearch-admin")["master_key"] == master
    assert roles["s3"].stat().st_mtime_ns == mtime


def test_transit_ma_hoa_du_lieu_nhay_cam(roles):
    actions = Bao.from_approle_file(ADDR, roles["actions"])
    cipher = actions.encrypt("079123456789")
    assert cipher.startswith("vault:v1:") and "079123456789" not in cipher
    assert actions.decrypt(cipher) == "079123456789"


def test_cau_hinh_doc_tu_ket(roles, monkeypatch):
    monkeypatch.setenv("BAO_ADDR", ADDR)
    monkeypatch.setenv("BAO_APPROLE_FILE", str(roles["actions"]))
    settings = config.load()
    actions = Bao.from_approle_file(ADDR, roles["actions"])
    assert settings.s3_secret_key == actions.read("bms/seaweedfs")["secret_key"]
    assert settings.actions_secret == actions.read("bms/actions")["secret"]
    assert settings.s3_admin_secret_key == config._from_env().s3_admin_secret_key, "actions không có khóa S3 admin"

    s3 = json.loads(roles["s3"].read_text())
    keys = {i["name"]: i["credentials"][0]["secretKey"] for i in s3["identities"]}
    assert keys["bms-app"] == settings.s3_secret_key, "SeaweedFS dùng đúng khóa trong két"


def test_dac_quyen_lakehouse(roles):
    """ADR #39: lakehouse-sink chỉ đọc tài khoản catalog và khóa S3 của bucket lakehouse."""
    lake = Bao.from_approle_file(ADDR, roles["lakehouse"])
    assert lake.read("bms/lakehouse")["username"] == "bamboo_lakehouse"
    assert lake.read("bms/seaweedfs-lakehouse")["access_key"] == "bms-lakehouse"
    for path in ("bms/postgres", "bms/seaweedfs", "bms/seaweedfs-admin", "bms/actions", "bms/meilisearch-admin"):
        assert denied(lambda p=path: lake.read(p)), f"lakehouse-sink không được đọc {path}"
    assert denied(lambda: lake.encrypt("x"))
    s3 = {i["name"]: i for i in json.loads(roles["s3"].read_text())["identities"]}
    assert s3["bms-lakehouse"]["actions"] == [f"{a}:bms-lakehouse" for a in ("Read", "Write", "List", "Tagging")]
    for name in ("bms-app", "bms-search"):
        assert not any("bms-lakehouse" in a for a in s3[name]["actions"]), f"{name} không vào bucket lakehouse"
