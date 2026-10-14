# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import base64
import io
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from app import config, main
from conftest import SETTINGS, ids, pr


@pytest.fixture
def client(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database})
    with TestClient(main.create_app(settings)) as c:
        yield c


@pytest.fixture
def admin(conn, org):
    role = f"QT_{uuid.uuid4().hex[:8]}"
    params = {"r": role, "p": org("P_GD")}
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %(r)s, 'Quản trị thử')", params)
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
                    SELECT tenant_id, id, p FROM core.role,
                           unnest(ARRAY['core.org.manage', 'core.permission.manage', 'mdm.manage']) p
                    WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
                    SELECT test.id('TDX'), id, test.id(%(p)s), 'TENANT' FROM core.role
                    WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    return ids(conn, org("gd"), org("nv"), org("PHONG"), org("CTY"), "TDX") | {"k": org}


def call(client, name, args, person, tenant):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})


def save(client, admin, entity, data, who="gd"):
    return call(client, "admin_save", {"entity": entity, "data": data}, admin[admin["k"](who)], admin["TDX"])


def test_khong_co_quyen_thi_bi_chan(client, admin):
    r = save(
        client,
        admin,
        "org_unit",
        {"code": "X", "name": "X", "parent_id": admin[admin["k"]("PHONG")], "unit_type_code": "PHONG"},
        who="nv",
    )
    assert r.status_code == 403 and r.json()["extensions"]["code"] == "forbidden"


def test_them_don_vi_vi_tri_nguoi_bo_nhiem(client, conn, admin):
    k = admin["k"]
    code = k("TO")
    r = save(
        client,
        admin,
        "org_unit",
        {"code": code, "name": "Tổ Kiểm thử", "parent_code": k("PHONG"), "unit_type_code": "PHONG"},
    )
    assert r.status_code == 200, r.text
    unit = r.json()["id"]
    path = conn.execute(
        "SELECT o.path::text p, par.path::text pp FROM core.org_unit o JOIN core.org_unit par "
        "ON par.id = o.parent_id WHERE o.id = %s",
        (unit,),
    ).fetchone()
    assert path["p"].startswith(path["pp"] + ".")

    head = save(client, admin, "position", {"org_unit_id": unit, "name": "Tổ trưởng", "is_head": True}).json()["id"]
    r = save(client, admin, "position", {"org_unit_id": unit, "name": "Tổ trưởng 2", "is_head": True})
    assert r.status_code == 400 and r.json()["extensions"]["code"] == "rejected"

    person = save(client, admin, "person", {"full_name": "Người Mới", "employee_code": k("NV")}).json()["id"]
    r = save(client, admin, "assignment", {"person_id": person, "position_id": head, "assignment_type": "PRIMARY"})
    assert r.status_code == 200, r.text
    assert conn.execute("SELECT person_id FROM core.position_holder(%s)", (head,)).fetchone()["person_id"] == uuid.UUID(
        person
    )

    r = call(client, "admin_close", {"entity": "position", "id": head}, admin[k("gd")], admin["TDX"])
    assert r.status_code == 400 and "còn người giữ" in r.json()["message"]
    assignment = conn.execute("SELECT id FROM core.assignment WHERE position_id = %s", (head,)).fetchone()["id"]
    assert (
        call(
            client, "admin_close", {"entity": "assignment", "id": str(assignment)}, admin[k("gd")], admin["TDX"]
        ).status_code
        == 200
    )
    assert (
        call(client, "admin_close", {"entity": "position", "id": head}, admin[k("gd")], admin["TDX"]).status_code == 200
    )
    assert (
        conn.execute("SELECT upper_inf(valid_period) u FROM core.position WHERE id = %s", (head,)).fetchone()["u"]
        is False
    )


def test_vai_tro_va_cap_quyen(client, conn, admin):
    k = admin["k"]
    code = k("VT")
    r = save(
        client,
        admin,
        "role",
        {
            "code": code,
            "name": "Người lập đề nghị",
            "permission_codes": ["proc.purchase_request.create", "proc.purchase_request.read"],
        },
    )
    assert r.status_code == 200, r.text
    role = r.json()["id"]
    perms = {
        x["permission_code"]
        for x in conn.execute("SELECT permission_code FROM core.role_permission WHERE role_id = %s", (role,))
    }
    assert perms == {"proc.purchase_request.create", "proc.purchase_request.read"}
    save(
        client,
        admin,
        "role",
        {"id": role, "code": code, "name": "Người lập", "permission_codes": ["proc.purchase_request.read"]},
    )
    assert conn.execute("SELECT count(*) n FROM core.role_permission WHERE role_id = %s", (role,)).fetchone()["n"] == 1

    pos = conn.execute("SELECT test.id(%s) id", (k("P_NV"),)).fetchone()["id"]
    r = save(client, admin, "role_grant", {"role_id": role, "position_id": str(pos), "scope": "UNIT"})
    assert r.status_code == 200, r.text
    assert conn.execute(
        "SELECT core.has_permission(test.id(%s), 'proc.purchase_request.read', test.id(%s)) ok", (k("nv"), k("PHONG"))
    ).fetchone()["ok"]
    r = save(
        client,
        admin,
        "role_grant",
        {"role_id": role, "person_id": admin[k("nv")], "scope": "SELF", "valid_to": "31/12/2099"},
    )
    assert r.status_code == 400 and "gán vai trò cho vị trí" in r.json()["message"]


def _xlsx(rows: list[list]) -> str:
    wb = Workbook()
    for row in rows:
        wb.active.append(row)
    out = io.BytesIO()
    wb.save(out)
    return base64.b64encode(out.getvalue()).decode()


def test_nhap_don_vi_xem_truoc_va_ghi(client, conn, admin):
    k = admin["k"]
    a, b = k("A"), k("B")
    content = _xlsx(
        [
            ["Mã đơn vị", "Tên đơn vị", "Mã đơn vị cha", "Mã loại đơn vị"],
            [b, "Tổ B", a, "PHONG"],
            [a, "Phòng A", k("CTY"), "PHONG"],
            [k("C"), "Sai", a, "KHONG_CO"],
        ]
    )
    args = {"kind": "org_unit", "file_name": "don-vi.xlsx", "content_base64": content, "dry_run": True}
    r = call(client, "admin_import", args, admin[k("gd")], admin["TDX"]).json()
    assert r["total"] == 3 and r["valid"] == 2 and not r["applied"]
    assert r["errors"] == [{"row": 4, "message": "Không có mục KHONG_CO trong danh mục UNIT_TYPE"}]
    r = call(client, "admin_import", {**args, "dry_run": False}, admin[k("gd")], admin["TDX"]).json()
    assert not r["applied"]
    assert conn.execute("SELECT count(*) n FROM core.org_unit WHERE code IN (%s, %s)", (a, b)).fetchone()["n"] == 0

    csv = f"Mã đơn vị;Tên đơn vị;Mã đơn vị cha;Mã loại đơn vị\n{b};Tổ B;{a};PHONG\n{a};Phòng A;{k('CTY')};PHONG\n"
    args = {
        "kind": "org_unit",
        "file_name": "don-vi.csv",
        "content_base64": base64.b64encode(csv.encode()).decode(),
        "dry_run": False,
    }
    r = call(client, "admin_import", args, admin[k("gd")], admin["TDX"]).json()
    assert r["applied"] and r["errors"] == []
    assert (
        conn.execute(
            "SELECT par.code FROM core.org_unit o JOIN core.org_unit par ON par.id = o.parent_id WHERE o.code = %s",
            (b,),
        ).fetchone()["code"]
        == a
    )


def test_nhap_nhan_su_kem_bo_nhiem(client, conn, admin):
    k = admin["k"]
    content = _xlsx(
        [
            ["Mã nhân viên", "Họ tên", "Vị trí (MÃ_ĐƠN_VỊ/Tên vị trí)", "Tên đăng nhập"],
            [k("E1"), "Lê Văn Một", f"{k('PHONG')}/Chuyên viên 2", ""],
            [k("E2"), "Lê Văn Hai", "", "hai.lv"],
        ]
    )
    save(client, admin, "position", {"unit_code": k("PHONG"), "name": "Chuyên viên 2"})
    r = call(
        client,
        "admin_import",
        {"kind": "person", "file_name": "ns.xlsx", "content_base64": content, "dry_run": False},
        admin[k("gd")],
        admin["TDX"],
    ).json()
    assert r["applied"], r
    assert [c["username"] for c in r["created"]] == ["hai.lv"]
    held = conn.execute(
        """SELECT p.full_name FROM core.assignment x JOIN core.person p ON p.id = x.person_id
                           JOIN core.position s ON s.id = x.position_id
                           WHERE s.name = 'Chuyên viên 2' AND s.org_unit_id = test.id(%s)""",
        (k("PHONG"),),
    ).fetchone()
    assert held["full_name"] == "Lê Văn Một"


def test_tep_mau(client, admin):
    r = call(client, "admin_import_template", {"kind": "partner"}, admin[admin["k"]("gd")], admin["TDX"]).json()
    sheet = load_workbook(io.BytesIO(base64.b64decode(r["content_base64"]))).active
    assert r["file_name"] == "mau-nha-cung-cap.xlsx"
    assert sheet["A1"].value == "Mã nhà cung cấp *"


def test_tep_mau_nhap_lai_duoc(client, conn, admin):
    k = admin["k"]
    r = call(client, "admin_import_template", {"kind": "partner"}, admin[k("gd")], admin["TDX"]).json()
    book = load_workbook(io.BytesIO(base64.b64decode(r["content_base64"])))
    assert book.active.max_row == 1, "trang Dữ liệu chỉ có tiêu đề"
    assert book["Ví dụ"]["A2"].value == "NCC001"
    book.active.append([k("NCC"), "Nhà cung cấp từ tệp mẫu", 101234567])
    out = io.BytesIO()
    book.save(out)
    args = {
        "kind": "partner",
        "file_name": r["file_name"],
        "content_base64": base64.b64encode(out.getvalue()).decode(),
        "dry_run": False,
    }
    r = call(client, "admin_import", args, admin[k("gd")], admin["TDX"]).json()
    assert r["applied"] and r["errors"] == [], r
    assert (
        conn.execute("SELECT tax_code FROM mdm.partner WHERE code = %s", (k("NCC"),)).fetchone()["tax_code"]
        == "101234567"
    )


def test_nhap_csv_mot_cot(client, admin):
    content = base64.b64encode("Mã nhà cung cấp\nNCC1\n".encode()).decode()
    r = call(
        client,
        "admin_import",
        {"kind": "partner", "file_name": "ncc.csv", "content_base64": content},
        admin[admin["k"]("gd")],
        admin["TDX"],
    )
    assert r.status_code == 400
    assert "Thiếu cột" in r.json()["message"]


def test_tai_khoan_chua_cau_hinh(client, admin):
    r = call(
        client,
        "create_person_accounts",
        {"accounts": [{"person_id": admin[admin["k"]("nv")], "username": "x"}]},
        admin[admin["k"]("gd")],
        admin["TDX"],
    )
    assert r.status_code in (200, 400, 503)
    if r.status_code == 200:
        assert r.json()[0]["error"] == "Người này đã có tài khoản"


@pytest.mark.parametrize("entity", ["partner", "item"])
def test_du_lieu_chu(client, conn, admin, entity):
    code = admin["k"]("MDM")
    data = {"code": code, "name": "Tên", "uom": "cái"} if entity == "item" else {"code": code, "name": "Tên"}
    r = save(client, admin, entity, data)
    assert r.status_code == 200, r.text
    table = "mdm.item" if entity == "item" else "mdm.partner"
    assert conn.execute(f"SELECT name FROM {table} WHERE code = %s", (code,)).fetchone()["name"] == "Tên"
    with pytest.raises(psycopg.errors.UniqueViolation):
        conn.execute(
            f"INSERT INTO {table} (tenant_id, code, name{', uom' if entity == 'item' else ''}) "
            f"VALUES (test.id('TDX'), %s, 'X'{', %s' if entity == 'item' else ''})",
            (code, "cái") if entity == "item" else (code,),
        )


def test_han_muc_dung_luong_quan_tri(client, conn, admin):
    r = save(client, admin, "storage_quota", {"quota_gb": "20"})
    assert r.status_code == 200, r.text
    quota = conn.execute("SELECT storage_quota_bytes FROM core.tenant WHERE code = 'TDX'").fetchone()
    assert quota["storage_quota_bytes"] == 20 * 1024**3
    assert save(client, admin, "storage_quota", {"quota_gb": "0"}).status_code == 400
    assert save(client, admin, "storage_quota", {"quota_gb": "5"}, who="nv").status_code == 403
    conn.execute("UPDATE core.tenant SET storage_quota_bytes = DEFAULT WHERE code = 'TDX'")


def test_them_ncc_de_xuat(client, conn, admin):
    k = admin["k"]
    pr_id = pr(conn, k("de_xuat"), "c", "P_NV_MH_DT", 1_000_000, submit=False)
    tax = "0" + str(uuid.uuid4().int)[:9]
    conn.execute(
        "UPDATE proc.purchase_request SET proposed_partner_name = 'NCC gõ tay', proposed_partner_tax_code = %s "
        "WHERE id = %s",
        (tax, pr_id),
    )
    who = admin[k("gd")]
    r = call(client, "adopt_proposed_partner", {"request_id": pr_id, "code": k("NCC")}, admin[k("nv")], admin["TDX"])
    assert r.status_code == 400 and "mdm.manage" in r.json()["message"]
    r = call(client, "adopt_proposed_partner", {"request_id": pr_id, "code": k("NCC")}, who, admin["TDX"])
    assert r.status_code == 200, r.text
    row = conn.execute(
        "SELECT p.code, p.tax_code, r.proposed_partner_name FROM proc.purchase_request r "
        "JOIN mdm.partner p ON p.id = r.partner_id WHERE r.id = %s",
        (pr_id,),
    ).fetchone()
    assert (row["code"], row["tax_code"], row["proposed_partner_name"]) == (k("NCC"), tax, None)
