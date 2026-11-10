# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import os
import pathlib
import shutil
import subprocess

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from conftest import ROOT

SCRIPTS = ROOT / "tools" / "ops"
pytestmark = pytest.mark.skipif(not shutil.which("pg_dump"), reason="không có công cụ khách PostgreSQL (pg_dump)")


@pytest.fixture
def env(database, tmp_path):
    info = conninfo_to_dict(database)
    out = {
        **os.environ,
        "PGHOST": info.get("host", "localhost"),
        "PGPORT": str(info.get("port", 5432)),
        "PGUSER": info.get("user", "postgres"),
        "BACKUP_DIR": str(tmp_path),
        "BACKUP_DATABASES": info["dbname"],
        "CATALOG_DB": info["dbname"],
    }
    if info.get("password"):
        out["PGPASSWORD"] = info["password"]
    return out


def run(script: str, *args: str, env) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(SCRIPTS / script), *args], env=env, capture_output=True, text=True, timeout=300)


@pytest.fixture
def cur(database):
    with psycopg.connect(database, row_factory=dict_row, autocommit=True) as c:
        yield c


def test_sao_luu_roi_dien_tap_khoi_phuc_dat(env, cur, tmp_path):
    result = run("backup-db.sh", env=env)
    assert result.returncode == 0, result.stderr
    backup = pathlib.Path(result.stdout.strip().splitlines()[-1])
    assert {p.name for p in backup.iterdir()} == {"SHA256SUMS", "globals.sql", f"{env['CATALOG_DB']}.dump"}

    drill = run("restore-drill.sh", str(backup), env=env)
    assert drill.returncode == 0, drill.stdout + drill.stderr
    rows = cur.execute("SELECT kind, status, location FROM audit.backup_run ORDER BY id DESC LIMIT 2").fetchall()
    assert {(r["kind"], r["status"]) for r in rows} == {("BACKUP", "OK"), ("DRILL", "OK")}
    leftovers = cur.execute("SELECT datname FROM pg_database WHERE datname LIKE 'bms_drill_%'").fetchall()
    assert leftovers == [], "CSDL tạm phải được xóa sau diễn tập"


def test_tep_sao_luu_hong_thi_dien_tap_that_bai(env, cur):
    backup = pathlib.Path(run("backup-db.sh", env=env).stdout.strip().splitlines()[-1])
    dump = backup / f"{env['CATALOG_DB']}.dump"
    data = bytearray(dump.read_bytes())
    data[len(data) // 2] ^= 0xFF
    dump.write_bytes(bytes(data))
    drill = run("restore-drill.sh", str(backup), env=env)
    assert drill.returncode != 0 and "mã băm tệp sao lưu không khớp" in drill.stdout
    row = cur.execute(
        "SELECT status, detail FROM audit.backup_run WHERE kind = 'DRILL' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    assert row["status"] == "FAILED" and "mã băm" in row["detail"]["problems"][0]


def test_chi_giu_so_ban_gan_nhat_va_khong_con_thu_muc_do_dang(env, tmp_path):
    env = {**env, "BACKUP_KEEP": "2"}
    for _ in range(4):
        assert run("backup-db.sh", env=env).returncode == 0
    kept = sorted(p.name for p in tmp_path.iterdir())
    assert len(kept) == 2 and not any(name.endswith(".partial") for name in kept), kept


def test_loi_sao_luu_duoc_ghi_lai_va_khong_de_lai_ban_do(env, cur, tmp_path):
    env = {**env, "BACKUP_DATABASES": "csdl_khong_ton_tai"}
    result = run("backup-db.sh", env=env)
    assert result.returncode != 0 and "không có CSDL nào" in result.stderr
    assert list(tmp_path.iterdir()) == []
    assert (
        cur.execute("SELECT status FROM audit.backup_run WHERE kind = 'BACKUP' ORDER BY id DESC LIMIT 1").fetchone()[
            "status"
        ]
        == "FAILED"
    )
