# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import os
import pathlib
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app import realm, seed
from app.demo import DEMO_USERS, HR_DEMO_USERS, OPEN_SEATS, TRANSFER_DEMO_USERS, account_id, uid

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


def test_demo_bat_moi_mo_dun(conn):
    n = len(seed.DEMO_MODULES)
    assert one(conn, "SELECT count(*) FROM core.module_install") == n
    assert one(conn, "SELECT count(*) FROM core.tenant_module") == n * one(conn, "SELECT count(*) FROM core.tenant")


def test_quy_mo(conn):
    assert one(conn, "SELECT count(*) FROM core.org_unit") >= 40
    assert 100 <= one(conn, "SELECT count(*) FROM core.person") <= 160
    assert one(
        conn,
        """SELECT count(*) FROM core.position p
                        WHERE NOT EXISTS (SELECT 1 FROM core.position_holder(p.id))""",
    ) == 1 + len(OPEN_SEATS)


def test_tai_khoan_demo_khop_keycloak(conn):
    for user in [*DEMO_USERS, *HR_DEMO_USERS]:
        tenants = {s.tenant for s in user.seats}
        rows = conn.execute("SELECT tenant_code, person_id FROM core.account_tenants(%s)", (str(user.id),)).fetchall()
        assert {r[0] for r in rows} == tenants, user.username
        first = user.seats[0].tenant
        assert str(dict(rows)[first]) == str(account_id(user.username))


def test_kiem_nhiem_va_hop_dong(conn):
    assert one(conn, "SELECT count(*) FROM core.account_tenants(%s)", str(account_id("kiemnhiem"))) == 2
    assert (
        one(
            conn,
            """SELECT assignment_type FROM core.assignment
                        WHERE person_id = %s AND assignment_type = 'CONTRACT'""",
            account_id("hopdong"),
        )
        == "CONTRACT"
    )


def test_de_nghi_mau_dung_buoc(conn):
    rows = dict(
        conn.execute("""
        SELECT r.title, coalesce(p.employee_code || ':' || coalesce(t.escalation_reason, ''), r.status)
        FROM proc.purchase_request r
        LEFT JOIN wf.approval_step s ON s.entity_id = r.id AND s.status = 'ACTIVE'
        LEFT JOIN wf.task t ON t.step_id = s.id AND t.status = 'OPEN'
        LEFT JOIN core.person p ON p.id = t.assignee_id""").fetchall()
    )
    tgd = one(conn, "SELECT employee_code FROM core.person WHERE id = %s", account_id("tgd"))
    assert rows["Linh kiện thay thế cho lô điện thoại bị ảnh hưởng"] == f"{tgd}:"
    assert rows["Máy chủ cho nền tảng DX-OS"] == f"{tgd}:"
    assert rows["Bo mạch thử nghiệm cho kiểm chứng"].endswith(":VACANT")
    assert rows["Văn phòng phẩm quý IV"] == "RETURNED"
    assert rows["Bảo trì hệ thống điều hòa phòng sạch"] == "APPROVED"
    assert one(conn, "SELECT count(*) FROM wf.flow_sync WHERE dirty") >= 8, "flow-sync sẽ tạo tiến trình Flowable"


def test_dong_hang_va_so_chung_tu(conn):
    assert (
        one(
            conn,
            """SELECT count(*) FROM proc.purchase_request r
                        WHERE r.total_amount <> (SELECT sum(amount) FROM proc.purchase_request_item i
                                                 WHERE i.request_id = r.id)""",
        )
        == 0
    )
    assert (
        one(
            conn,
            "SELECT total_amount FROM proc.purchase_request WHERE title = 'Linh kiện thay thế cho lô điện thoại bị ảnh hưởng'",
        )
        == 650_000_000
    )
    assert one(
        conn, "SELECT count(DISTINCT (tenant_id, doc_no)) FROM proc.purchase_request WHERE doc_no ~ '^PR-'"
    ) == one(conn, "SELECT count(*) FROM proc.purchase_request")
    history = one(
        conn,
        """SELECT count(*) FROM proc.purchase_request r
           WHERE r.created_at < now() - interval '1 day' AND r.status IN ('APPROVED', 'REJECTED')""",
    )
    assert history >= 60, "lịch sử duyệt 60 ngày cho Trung tâm điều hành và KPI"
    assert (
        one(conn, "SELECT count(*) FROM wf.task WHERE status = 'OPEN' AND created_at < now() - interval '1 day'") == 0
    )
    assert one(conn, "SELECT count(*) FROM kpi.value WHERE kpi_key = 'on-time'") >= 14
    assert one(conn, "SELECT count(*) FROM mdm.partner WHERE internal_unit_id IS NOT NULL") == 3


def test_nhat_ky_va_thong_bao(conn):
    for code in ("TDX", "BVX"):
        assert one(conn, "SELECT count(*) FROM audit.verify_chain(%s)", uid("tenant", code)) == 0
    assert one(conn, "SELECT count(*) FROM audit.log WHERE table_name = 'proc.purchase_request_item'") >= 12
    assert one(conn, "SELECT count(*) FROM audit.v_reader WHERE person_id = %s", account_id("gd.taichinh")) == 1
    assert (
        one(
            conn,
            """SELECT count(*) FROM collab.notification
                        WHERE recipient_id = %s AND kind = 'TASK_ASSIGNED' AND read_at IS NULL""",
            account_id("tgd"),
        )
        == 2
    )
    assert (
        one(
            conn,
            """SELECT body FROM collab.notification
                        WHERE recipient_id = %s AND kind = 'REQUEST_RETURNED'""",
            account_id("nv.muahang.dienthoai"),
        )
        == "Tách riêng mực in, bổ sung báo giá thứ hai"
    )
    assert one(conn, "SELECT count(*) FROM collab.comment") == 2


def test_uy_quyen_hien_trong_hop_viec(conn):
    assert (
        one(conn, """SELECT count(*) FROM wf.v_inbox WHERE person_id = %s AND via_delegation""", account_id("pgd.chip"))
        == 1
    )


def test_realm_khop_file_da_commit():
    committed = json.loads((ROOT / "infra/platform/keycloak/realm/bms-realm.json").read_text(encoding="utf-8"))
    assert committed == realm.build(), "chạy lại `python -m app.realm` rồi commit"
    users = {u["username"]: u for u in committed["users"]}
    assert users["admin"]["requiredActions"] == ["CONFIGURE_TOTP"]
    assert all(u["credentials"][0]["value"] == "${DEMO_PASSWORD}" for u in users.values())
    assert users["tgd"]["id"] == str(uid("account", "tgd"))


def test_nhan_su(conn):
    ns = account_id("ns.dienthoai")
    assert one(conn, "SELECT core.has_permission(%s, 'hr.onboarding.create', %s)", ns, uid("TDX", "unit", "DT_RD_PM"))
    assert not one(
        conn, "SELECT core.has_permission(%s, 'hr.onboarding.create', %s)", ns, uid("TDX", "unit", "CHIP_PS")
    )
    assert one(
        conn,
        "SELECT core.has_permission(%s, 'hr.onboarding.read', %s)",
        account_id("gd.dienthoai"),
        uid("TDX", "unit", "DT_RD_PM"),
    )
    assert one(conn, "SELECT count(*) FROM wf.approval_rule WHERE process_code = 'ONBOARDING'") >= 4
    for tenant, key, *_ in OPEN_SEATS:
        assert not conn.execute("SELECT 1 FROM core.position_holder(%s)", (uid(tenant, "position", key),)).fetchone()
    chain = conn.execute(
        """SELECT array_agg(p.name ORDER BY c.step_order)
                            FROM wf.resolve_approval_chain(%s, 'ONBOARDING', %s, 0, NULL) c
                            JOIN core.position p ON p.id = c.position_id""",
        (uid("tenant", "TDX"), uid("TDX", "position", "DT_RD_PM.S4")),
    ).fetchone()[0]
    assert chain == ["Trưởng phòng", "Giám đốc"]


def test_don_hang_noi_bo(conn):
    kd = account_id("kd.chip")
    assert one(conn, "SELECT core.has_permission(%s, 'ic.order.confirm', %s)", kd, uid("TDX", "unit", "CHIP"))
    assert not one(conn, "SELECT core.has_permission(%s, 'ic.order.confirm', %s)", kd, uid("TDX", "unit", "DT"))
    assert one(
        conn, "SELECT core.has_permission(%s, 'ic.order.read', %s)", account_id("gd.chip"), uid("TDX", "unit", "CHIP")
    )
    row = conn.execute("""SELECT o.status, o.decided_by, po.doc_no, poi.lot_id
                          FROM proc.purchase_request r JOIN ic.ic_order o ON o.id = r.ic_order_id
                          JOIN proc.purchase_order po ON po.ic_order_id = o.id
                          JOIN proc.purchase_order_item poi ON poi.order_id = po.id
                          WHERE r.title = 'PMIC cho lô lắp ráp tháng 10'""").fetchone()
    assert row[:2] == ("CONFIRMED", kd)
    assert row[2].startswith("PO-")
    assert row[3] == uid("TDX", "lot", "PMIC-2609-A")
    assert (
        one(
            conn,
            """SELECT ic_order_id FROM proc.purchase_request
                        WHERE title = 'Linh kiện thay thế cho lô điện thoại bị ảnh hưởng'""",
        )
        is None
    )


def test_xem_lakehouse(conn):
    root = uid("TDX", "unit", "TDX")
    assert one(conn, "SELECT core.has_permission(%s, 'data.lakehouse.read', %s)", account_id("cdo"), root)
    assert not one(conn, "SELECT core.has_permission(%s, 'data.lakehouse.read', %s)", account_id("ns.chip"), root)


def test_bo_sung_ban_da_cai(conn):
    with conn.transaction():
        conn.execute("DELETE FROM core.role_grant WHERE role_id IN (SELECT id FROM core.role WHERE code = 'NHAN_SU')")
        conn.execute("DELETE FROM core.role_permission WHERE permission_code LIKE 'hr.%'")
        conn.execute("DELETE FROM core.role WHERE code = 'NHAN_SU'")
        conn.execute("DELETE FROM wf.approval_rule WHERE process_code = 'ONBOARDING'")
        conn.execute(
            "DELETE FROM core.role_grant WHERE role_id IN (SELECT id FROM core.role WHERE code = 'BAN_HANG_NOI_BO')"
        )
        conn.execute("DELETE FROM core.role_permission WHERE permission_code LIKE 'ic.%'")
        conn.execute("DELETE FROM core.role WHERE code = 'BAN_HANG_NOI_BO'")
        conn.execute(
            "DELETE FROM core.role_grant WHERE role_id IN (SELECT id FROM core.role WHERE code = 'PHAN_TICH_DU_LIEU')"
        )
        conn.execute("DELETE FROM core.role_permission WHERE permission_code = 'data.lakehouse.read'")
        conn.execute("DELETE FROM core.role WHERE code = 'PHAN_TICH_DU_LIEU'")
        orders = one(conn, "SELECT count(*) FROM ic.ic_order")
        before = one(conn, "SELECT count(*) FROM core.person")
        assert seed.seed(conn) is False
        assert one(conn, "SELECT count(*) FROM core.person") == before
        assert one(conn, "SELECT count(*) FROM wf.approval_rule WHERE process_code = 'ONBOARDING'") >= 4
        assert one(
            conn,
            "SELECT core.has_permission(%s, 'hr.onboarding.create', %s)",
            account_id("ns.chip"),
            uid("TDX", "unit", "CHIP_PS"),
        )
        assert one(
            conn,
            "SELECT core.has_permission(%s, 'ic.order.confirm', %s)",
            account_id("kd.chip"),
            uid("TDX", "unit", "CHIP"),
        )
        assert one(conn, "SELECT count(*) FROM ic.ic_order") == orders, "không tạo lại đơn demo"
        assert one(
            conn,
            "SELECT core.has_permission(%s, 'data.lakehouse.read', %s)",
            account_id("cdo"),
            uid("TDX", "unit", "TDX"),
        )


def test_bo_sung_du_lieu_chu_con_thieu(conn):
    def drop_unused(table):
        removed = []
        for (row_id,) in conn.execute(f"SELECT id FROM {table}").fetchall():
            try:
                with conn.transaction():
                    conn.execute(f"DELETE FROM {table} WHERE id = %s", (row_id,))
                removed.append(row_id)
            except psycopg.errors.ForeignKeyViolation:
                pass
        return removed

    with conn.transaction():
        conn.execute(
            "DELETE FROM core.role_grant WHERE role_id IN (SELECT id FROM core.role WHERE code = 'QUAN_LY_DU_LIEU_CHU')"
        )
        partners, items = drop_unused("mdm.partner"), drop_unused("mdm.item")
        assert partners
        assert seed.seed(conn) is False
        assert one(conn, "SELECT count(*) FROM mdm.partner WHERE id = ANY(%s)", partners) == len(partners)
        assert one(conn, "SELECT count(*) FROM mdm.item WHERE id = ANY(%s)", items) == len(items)
        assert one(
            conn, "SELECT core.has_permission(%s, 'mdm.manage', %s)", account_id("cdo"), uid("TDX", "unit", "TDX")
        )


def test_du_lieu_nhom5(conn):
    from app import demo_load

    assert one(conn, "SELECT count(*) FROM iot.entity") == 26
    assert one(conn, "SELECT count(*) FROM iot.measurement") > 40_000
    assert one(conn, "SELECT max(observed_at) > now() - interval '1 day' FROM iot.measurement")
    assert one(conn, "SELECT state ? 'particles05' FROM iot.entity WHERE code = 'CR-02'")
    assert one(conn, "SELECT count(*) FROM meta.lineage_node") == 32
    assert one(conn, "SELECT count(*) FROM meta.quality_check WHERE NOT passed") == 1
    tgd = next(u for u in DEMO_USERS if u.username == "tgd")
    assert one(conn, "SELECT count(*) FROM kpi.pin WHERE person_id = %s", tgd.id) == 4
    assert demo_load.load(conn) is False
    demo_load.clear(conn)
    assert demo_load.load(conn) is True
    assert one(conn, "SELECT count(*) FROM iot.entity") == 26


def test_tai_khoan_demo_chuyen_tiep_nhan(conn):
    for user in TRANSFER_DEMO_USERS:
        seat = user.seats[0]
        rows = conn.execute("SELECT tenant_code, person_id FROM core.account_tenants(%s)", (str(user.id),)).fetchall()
        assert [r[0] for r in rows] == [seat.tenant], user.username
        holder = one(
            conn, "SELECT person_id FROM core.position_holder(%s)", uid(seat.tenant, "position", seat.position)
        )
        assert rows[0][1] == holder, user.username


def test_du_lieu_demo_khong_gian_h_p_d(conn):
    """Tin nhắn, lịch, dự án, khóa API bám tình huống của README (ADR #64–#66); chạy lại không nhân đôi."""
    counts = (
        "SELECT (SELECT count(*) FROM chat.message), (SELECT count(*) FROM cal.event), (SELECT count(*) FROM pm.project),"
        " (SELECT count(*) FROM pm.report), (SELECT count(*) FROM api.api_key), (SELECT count(*) FROM api.usage)"
    )
    before = conn.execute(counts).fetchone()
    assert before[0] >= 25 and before[1] >= 12 and before[2] == 5 and before[3] >= 5 and before[4] == 2
    assert seed.seed(conn) is False
    assert conn.execute(counts).fetchone() == before, "chạy lại không nhân đôi"

    status = dict(conn.execute("SELECT code, status FROM pm.project").fetchall())
    assert status == {
        "DX-2027": "ACTIVE",
        "CHIP-CR02": "ACTIVE",
        "DT-SMT4": "PLANNING",
        "GD-BH": "DONE",
        "BVX-EMR": "ACTIVE",
    }
    assert (
        one(conn, "SELECT t.code FROM pm.project p JOIN core.tenant t ON t.id = p.tenant_id WHERE p.code = 'BVX-EMR'")
        == "BVX"
    )
    assert (
        one(conn, "SELECT health FROM pm.report r JOIN pm.project p ON p.id = r.project_id WHERE p.code = 'CHIP-CR02'")
        == "RED"
    )
    assert one(conn, "SELECT late_tasks FROM pm.stats(%s)", uid("TDX", "project", "CHIP-CR02")) >= 1, (
        "dự án phòng sạch có việc trễ"
    )

    gd_chip = account_id("gd.chip")
    trip = conn.execute(
        """SELECT e.kind, e.all_day, e.starts_at <= now() AND e.ends_at > now() FROM cal.event e
           JOIN core.person p ON p.id = e.organizer_id WHERE p.idp_subject = %s AND e.kind = 'TRIP'""",
        (str(gd_chip),),
    ).fetchone()
    assert trip == ("TRIP", True, True), "Giám đốc Chip X đang đi công tác"
    assert one(conn, "SELECT count(*) FROM cal.event WHERE scope = 'UNIT' AND recurrence <> 'NONE'") >= 5

    assert (
        one(
            conn,
            """SELECT count(*) FROM chat.member WHERE left_at IS NULL
                        AND unread <> chat.count_unread(conversation_id, person_id, last_read_id)""",
        )
        == 0
    )
    assert (
        one(
            conn,
            """SELECT sum(m.unread) FROM chat.member m JOIN chat.conversation c ON c.id = m.conversation_id
                        JOIN core.person p ON p.id = m.person_id WHERE c.kind = 'DIRECT' AND p.idp_subject = %s""",
            str(account_id("tp.muahang.dienthoai")),
        )
        == 2
    )
    assert one(conn, "SELECT count(*) FROM chat.message WHERE created_at < now() - interval '1 day'") > 0, (
        "tin trải qua nhiều ngày"
    )
    assert one(conn, "SELECT count(*) FROM collab.notification WHERE kind = 'MENTION'") >= 1

    assert one(conn, "SELECT count(*) FROM api.api_key WHERE revoked_at IS NOT NULL") == 1
    assert one(conn, "SELECT max(last_used_at) > now() - interval '1 day' FROM api.usage") is True


def test_tai_khoan_demo_mat_lien_ket_thi_tu_gan_lai(conn):
    """Người giữ ghế demo bị gỡ tài khoản (sửa tay, tài khoản lệch...) thì lần seed sau gắn lại; mọi tài khoản demo đều
    thuộc đủ tenant của mình."""
    gd = str(account_id("gd.dienthoai"))
    conn.execute("UPDATE core.person SET idp_subject = NULL WHERE idp_subject = %s", (gd,))
    conn.commit()
    assert not conn.execute("SELECT 1 FROM core.account_tenants(%s)", (gd,)).fetchone()
    assert seed.seed(conn) is False
    assert one(conn, "SELECT tenant_code FROM core.account_tenants(%s)", gd) == "TDX"
    for user in [*DEMO_USERS, *HR_DEMO_USERS, *TRANSFER_DEMO_USERS]:
        tenants = {r[0] for r in conn.execute("SELECT tenant_code FROM core.account_tenants(%s)", (str(user.id),))}
        assert tenants == {s.tenant for s in user.seats}, user.username


def test_phan_demo_loi_khong_keo_do_seed(conn, monkeypatch):
    def collab_demo(self):
        raise RuntimeError("giả lập lỗi")

    monkeypatch.setattr(seed.Seeder, "collab_demo", collab_demo)
    persons = one(conn, "SELECT count(*) FROM core.person WHERE idp_subject IS NOT NULL")
    assert seed.seed(conn) is False
    assert seed.FAILED == ["collab_demo"], "chỉ phần lỗi bị bỏ"
    assert one(conn, "SELECT count(*) FROM core.person WHERE idp_subject IS NOT NULL") == persons
    assert one(conn, "SELECT count(*) FROM pm.project") == 5, "dữ liệu đã có không bị mất"
