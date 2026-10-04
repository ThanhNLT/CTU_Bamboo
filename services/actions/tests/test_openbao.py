"""OpenBao (ADR #25): khởi tạo lặp lại được, AppRole đặc quyền tối thiểu, transit, cấu hình đọc từ két.

Cần OpenBao đã được openbao-init khởi tạo: BAO_ADDR và BAO_KEYS_FILE (file khóa của openbao-init).
"""

import json
import os
import pathlib

import httpx
import pytest

from app import config, openbao_init
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
    files = {"actions": out / "actions.json", "bootstrap": out / "bootstrap.json"}
    openbao_init.run(ADDR, KEYS, files, out / "s3.json")
    return {**files, "s3": out / "s3.json"}


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
    assert root.request("GET", "secret/metadata/bms/seaweedfs")["data"]["current_version"] == before, \
        "khóa S3 chỉ sinh một lần"
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
