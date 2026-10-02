"""Dữ liệu demo: nạp đúng, chạy lại không trùng, khớp realm Keycloak (ADR #16, #23)."""

import json
import os
import pathlib
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app import realm, seed
from app.demo import DEMO_USERS, account_id, uid

ROOT = pathlib.Path(__file__).resolve().parents[3]
URL = os.environ.get("TEST_DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms_seed_test")


@pytest.fixture(scope="module")
def conn():
    name = urlparse(URL).path.lstrip("/")
    with psycopg.connect(urlunparse(urlparse(URL)._replace(path="/postgres")), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        admin.execute(f'CREATE DATABASE "{name}"')
    with psycopg.connect(URL) as c:
        for path in sorted((ROOT / "db/migrations/bms").glob("*.sql")):
            c.execute(path.read_text(encoding="utf-8"))
        c.commit()
        assert seed.seed(c) is True
        yield c


def one(conn, sql, *args):
    return conn.execute(sql, args).fetchone()[0]


def test_chay_lai_khong_trung(conn):
    before = one(conn, "SELECT count(*) FROM core.person")
    assert seed.seed(conn) is False
    assert one(conn, "SELECT count(*) FROM core.person") == before


def test_quy_mo(conn):
    assert one(conn, "SELECT count(*) FROM core.org_unit") >= 40
    assert 100 <= one(conn, "SELECT count(*) FROM core.person") <= 160
    # Mỗi ghế có người, trừ ghế cố ý để trống.
    assert one(conn, """SELECT count(*) FROM core.position p
                        WHERE NOT EXISTS (SELECT 1 FROM core.position_holder(p.id))""") == 1


def test_tai_khoan_demo_khop_keycloak(conn):
    """Id tài khoản = sub = person.id ở tenant giữ chính; tenant khác ánh xạ qua idp_subject."""
    for user in DEMO_USERS:
        tenants = {s.tenant for s in user.seats}
        rows = conn.execute("SELECT tenant_code, person_id FROM core.account_tenants(%s)", (str(user.id),)).fetchall()
        assert {r[0] for r in rows} == tenants, user.username
        first = user.seats[0].tenant
        assert str(dict(rows)[first]) == str(account_id(user.username))


def test_kiem_nhiem_va_hop_dong(conn):
    assert one(conn, "SELECT count(*) FROM core.account_tenants(%s)", str(account_id("kiemnhiem"))) == 2
    assert one(conn, """SELECT assignment_type FROM core.assignment
                        WHERE person_id = %s AND assignment_type = 'CONTRACT'""", account_id("hopdong")) == "CONTRACT"


def test_de_nghi_mau_dung_buoc(conn):
    rows = dict(conn.execute("""
        SELECT r.title, coalesce(p.employee_code || ':' || coalesce(t.escalation_reason, ''), r.status)
        FROM proc.purchase_request r
        LEFT JOIN wf.approval_step s ON s.entity_id = r.id AND s.status = 'ACTIVE'
        LEFT JOIN wf.task t ON t.step_id = s.id AND t.status = 'OPEN'
        LEFT JOIN core.person p ON p.id = t.assignee_id""").fetchall())
    tgd = one(conn, "SELECT employee_code FROM core.person WHERE id = %s", account_id("tgd"))
    assert rows["Linh kiện thay thế cho lô điện thoại bị ảnh hưởng"] == f"{tgd}:"
    assert rows["Máy chủ cho nền tảng DX-OS"] == f"{tgd}:"
    assert rows["Bo mạch thử nghiệm cho kiểm chứng"].endswith(":VACANT")
    assert rows["Văn phòng phẩm quý IV"] == "RETURNED"
    assert rows["Bảo trì hệ thống điều hòa phòng sạch"] == "APPROVED"
    assert one(conn, "SELECT count(*) FROM wf.flow_sync WHERE dirty") >= 8, "flow-sync sẽ tạo tiến trình Flowable"


def test_uy_quyen_hien_trong_hop_viec(conn):
    assert one(conn, """SELECT count(*) FROM wf.v_inbox WHERE person_id = %s AND via_delegation""",
               account_id("pgd.chip")) == 1


def test_realm_khop_file_da_commit():
    committed = json.loads((ROOT / "platform/keycloak/realm/bms-realm.json").read_text(encoding="utf-8"))
    assert committed == realm.build(), "chạy lại `python -m app.realm` rồi commit"
    users = {u["username"]: u for u in committed["users"]}
    assert users["admin"]["requiredActions"] == ["CONFIGURE_TOTP"]
    assert all(u["credentials"][0]["value"] == "${DEMO_PASSWORD}" for u in users.values())
    assert users["tgd"]["id"] == str(uid("account", "tgd"))
