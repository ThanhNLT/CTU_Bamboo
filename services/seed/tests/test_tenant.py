# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import os
import pathlib
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app import tenant

ROOT = pathlib.Path(__file__).resolve().parents[3]
URL = os.environ.get("TEST_DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms_seed_test") + "_tenant"


@pytest.fixture(scope="module")
def conn():
    name = urlparse(URL).path.lstrip("/")
    with psycopg.connect(urlunparse(urlparse(URL)._replace(path="/postgres")), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        admin.execute(f'CREATE DATABASE "{name}"')
    with psycopg.connect(URL, autocommit=True) as c:
        for path in sorted((ROOT / "db/migrations/bms").glob("*.sql")):
            c.execute(path.read_text(encoding="utf-8"))
        yield c


def one(conn, sql, *args):
    return conn.execute(sql, args).fetchone()[0]


def test_tao_cong_ty_moi(conn):
    ids = tenant.create_tenant(conn, "ABC", "Công ty ABC", "sub-abc", "Nguyễn Văn A")
    tid, root, person = ids["tenant_id"], ids["root_unit_id"], ids["person_id"]
    assert one(conn, "SELECT tenant_code FROM core.account_tenants('sub-abc')") == "ABC"
    for perm in ("core.org.manage", "core.permission.manage", "core.module.manage", "mdm.manage", "audit.read"):
        assert one(conn, "SELECT core.has_permission(%s, %s, %s)", person, perm, root), perm
    assert one(conn, "SELECT core.has_permission(%s, 'proc.purchase_request.create', %s)", person, root)
    assert one(conn, "SELECT count(*) FROM core.position WHERE tenant_id = %s AND is_head", tid) == 1
    assert one(conn, "SELECT count(*) FROM wf.approval_rule WHERE tenant_id = %s", tid) == 2
    assert one(conn, "SELECT count(*) FROM core.catalog_item WHERE tenant_id = %s AND catalog = 'UNIT_TYPE'", tid) > 0
    assert one(conn, "SELECT count(*) FROM core.tenant_module WHERE tenant_id = %s", tid) == 0
    assert one(conn, "SELECT person_id FROM core.tenant_owner WHERE tenant_id = %s", tid) == person


def test_khong_tao_trung(conn):
    with pytest.raises(SystemExit, match="đã có"):
        tenant.create_tenant(conn, "ABC", "Trùng", "sub-khac", "Người khác")


def test_cong_ty_thanh_vien(conn):
    tenant.create_tenant(conn, "TD", "Tập đoàn TD", "sub-td", "Trần B", root_type="TAP_DOAN")
    child = tenant.create_tenant(conn, "TD_A", "Công ty A", "sub-td-a", "Lê C", parent="TD")["tenant_id"]
    parent = one(conn, "SELECT id FROM core.tenant WHERE code = 'TD'")
    assert one(conn, "SELECT parent_tenant_id FROM core.tenant_relation WHERE child_tenant_id = %s", child) == parent


def test_cong_ty_me_khong_ton_tai(conn):
    with pytest.raises(SystemExit, match="công ty mẹ"):
        tenant.create_tenant(conn, "LE", "Lẻ", "sub-le", "Phạm D", parent="KHONG_CO")
    assert one(conn, "SELECT count(*) FROM core.tenant WHERE code = 'LE'") == 0
