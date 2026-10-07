# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Dữ liệu demo: nạp đúng, chạy lại không trùng, khớp realm Keycloak (ADR #16, #23)."""

import json
import os
import pathlib
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app import realm, seed
from app.demo import DEMO_USERS, HR_DEMO_USERS, OPEN_SEATS, account_id, uid

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
    # Mỗi ghế có người, trừ ghế cố ý để trống và ghế tuyển mới.
    assert one(conn, """SELECT count(*) FROM core.position p
                        WHERE NOT EXISTS (SELECT 1 FROM core.position_holder(p.id))""") == 1 + len(OPEN_SEATS)


def test_tai_khoan_demo_khop_keycloak(conn):
    """Id tài khoản = sub = person.id ở tenant giữ chính; tenant khác ánh xạ qua idp_subject."""
    for user in [*DEMO_USERS, *HR_DEMO_USERS]:
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


def test_dong_hang_va_so_chung_tu(conn):
    assert one(conn, """SELECT count(*) FROM proc.purchase_request r
                        WHERE r.total_amount <> (SELECT sum(amount) FROM proc.purchase_request_item i
                                                 WHERE i.request_id = r.id)""") == 0
    assert one(conn, "SELECT total_amount FROM proc.purchase_request WHERE title = 'Linh kiện thay thế cho lô điện thoại bị ảnh hưởng'") == 650_000_000
    assert one(conn, "SELECT count(DISTINCT (tenant_id, doc_no)) FROM proc.purchase_request WHERE doc_no ~ '^PR-'") == 11
    assert one(conn, "SELECT count(*) FROM mdm.partner WHERE internal_unit_id IS NOT NULL") == 3


def test_nhat_ky_va_thong_bao(conn):
    for code in ("TDX", "BVX"):
        assert one(conn, "SELECT count(*) FROM audit.verify_chain(%s)", uid("tenant", code)) == 0
    assert one(conn, "SELECT count(*) FROM audit.log WHERE table_name = 'proc.purchase_request_item'") >= 12
    assert one(conn, "SELECT count(*) FROM audit.v_reader WHERE person_id = %s", account_id("gd.taichinh")) == 1
    # TGĐ có hai việc chờ duyệt; người lập đề nghị bị trả về được báo kèm lý do.
    assert one(conn, """SELECT count(*) FROM collab.notification
                        WHERE recipient_id = %s AND kind = 'TASK_ASSIGNED'""", account_id("tgd")) == 2
    assert one(conn, """SELECT body FROM collab.notification
                        WHERE recipient_id = %s AND kind = 'REQUEST_RETURNED'""",
               account_id("nv.muahang.dienthoai")) == "Tách riêng mực in, bổ sung báo giá thứ hai"
    assert one(conn, "SELECT count(*) FROM collab.comment") == 2


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


def test_nhan_su(conn):
    """Phòng nhân sự lập hồ sơ cho cả công ty mình; quy tắc duyệt tiếp nhận; ghế tuyển mới còn trống (ADR #41)."""
    ns = account_id("ns.dienthoai")
    assert one(conn, "SELECT core.has_permission(%s, 'hr.onboarding.create', %s)", ns, uid("TDX", "unit", "DT_RD_PM"))
    assert not one(conn, "SELECT core.has_permission(%s, 'hr.onboarding.create', %s)", ns, uid("TDX", "unit", "CHIP_PS"))
    assert one(conn, "SELECT core.has_permission(%s, 'hr.onboarding.read', %s)",
               account_id("gd.dienthoai"), uid("TDX", "unit", "DT_RD_PM"))
    assert one(conn, "SELECT count(*) FROM wf.approval_rule WHERE process_code = 'ONBOARDING'") >= 4
    for tenant, key, *_ in OPEN_SEATS:
        assert not conn.execute("SELECT 1 FROM core.position_holder(%s)", (uid(tenant, "position", key),)).fetchone()
    chain = conn.execute("""SELECT array_agg(p.name ORDER BY c.step_order)
                            FROM wf.resolve_approval_chain(%s, 'ONBOARDING', %s, 0, NULL) c
                            JOIN core.position p ON p.id = c.position_id""",
                         (uid("tenant", "TDX"), uid("TDX", "position", "DT_RD_PM.S4"))).fetchone()[0]
    assert chain == ["Trưởng phòng", "Giám đốc"]


def test_don_hang_noi_bo(conn):
    """Kinh doanh Chip X xác nhận đơn bán ra từ Chip X; đơn demo đã giao lô PMIC cho Điện thoại X (ADR #42)."""
    kd = account_id("kd.chip")
    assert one(conn, "SELECT core.has_permission(%s, 'ic.order.confirm', %s)", kd, uid("TDX", "unit", "CHIP"))
    assert not one(conn, "SELECT core.has_permission(%s, 'ic.order.confirm', %s)", kd, uid("TDX", "unit", "DT"))
    assert one(conn, "SELECT core.has_permission(%s, 'ic.order.read', %s)",
               account_id("gd.chip"), uid("TDX", "unit", "CHIP"))
    row = conn.execute("""SELECT o.status, o.decided_by, po.doc_no, poi.lot_id
                          FROM proc.purchase_request r JOIN ic.ic_order o ON o.id = r.ic_order_id
                          JOIN proc.purchase_order po ON po.ic_order_id = o.id
                          JOIN proc.purchase_order_item poi ON poi.order_id = po.id
                          WHERE r.title = 'PMIC cho lô lắp ráp tháng 10'""").fetchone()
    assert row[:2] == ("CONFIRMED", kd)
    assert row[2].startswith("PO-")
    assert row[3] == uid("TDX", "lot", "PMIC-2609-A")
    # Đề nghị nội bộ 650 triệu còn chờ TGĐ: chưa có đơn hàng nội bộ.
    assert one(conn, """SELECT ic_order_id FROM proc.purchase_request
                        WHERE title = 'Linh kiện thay thế cho lô điện thoại bị ảnh hưởng'""") is None


def test_bo_sung_ban_da_cai(conn):
    """Bản đã cài trước khi có nhân sự: chạy seed lại thì bổ sung phòng nhân sự, không đổi dữ liệu cũ."""
    with conn.transaction():
        conn.execute("DELETE FROM core.role_grant WHERE role_id IN (SELECT id FROM core.role WHERE code = 'NHAN_SU')")
        conn.execute("DELETE FROM core.role_permission WHERE permission_code LIKE 'hr.%'")
        conn.execute("DELETE FROM core.role WHERE code = 'NHAN_SU'")
        conn.execute("DELETE FROM wf.approval_rule WHERE process_code = 'ONBOARDING'")
        conn.execute("DELETE FROM core.role_grant WHERE role_id IN (SELECT id FROM core.role WHERE code = 'BAN_HANG_NOI_BO')")
        conn.execute("DELETE FROM core.role_permission WHERE permission_code LIKE 'ic.%'")
        conn.execute("DELETE FROM core.role WHERE code = 'BAN_HANG_NOI_BO'")
        orders = one(conn, "SELECT count(*) FROM ic.ic_order")
        before = one(conn, "SELECT count(*) FROM core.person")
        assert seed.seed(conn) is False
        assert one(conn, "SELECT count(*) FROM core.person") == before
        assert one(conn, "SELECT count(*) FROM wf.approval_rule WHERE process_code = 'ONBOARDING'") >= 4
        assert one(conn, "SELECT core.has_permission(%s, 'hr.onboarding.create', %s)",
                   account_id("ns.chip"), uid("TDX", "unit", "CHIP_PS"))
        assert one(conn, "SELECT core.has_permission(%s, 'ic.order.confirm', %s)",
                   account_id("kd.chip"), uid("TDX", "unit", "CHIP"))
        assert one(conn, "SELECT count(*) FROM ic.ic_order") == orders, "không tạo lại đơn demo"
