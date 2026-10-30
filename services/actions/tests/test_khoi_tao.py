# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import base64
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest
from asn1crypto import pem
from fastapi.testclient import TestClient
from test_ky_so import TAX, make_pki, original_pdf, sign

from app import config, main, setup
from app.common import Context
from app.hr_account import AccountConflict
from conftest import ROOT, SETTINGS, TEST_DB_URL

EMPTY_DB_URL = urlunparse(urlparse(TEST_DB_URL)._replace(path="/bms_setup_test"))

COMPANY = {
    "code": "ABC",
    "tax_code": TAX,
    "legal_name": "Công ty Cổ phần ABC",
    "short_name": "ABC",
    "address": "1 Tràng Tiền, Hà Nội",
    "legal_rep_name": "Nguyễn Văn An",
    "legal_rep_title": "Tổng giám đốc",
}


class FakeUsers:
    def __init__(self):
        self.created: dict[str, dict] = {}
        self.disabled: list[str] = []

    def create(self, request_id, username, full_name, email, password, attribute, required_actions):
        if username == "da-co":
            raise AccountConflict("Tên đăng nhập hoặc email đã thuộc một tài khoản khác")
        subject = f"sub-{username}"
        self.created[subject] = {"username": username, "required": required_actions, "attribute": attribute}
        return subject

    def disable(self, subject):
        self.disabled.append(subject)
        return True

    def find(self, username):
        return next(({"id": sub} for sub, u in self.created.items() if u["username"] == username), None)

    def recover(self, subject, password):
        self.recovered = (subject, password)
        return self.created[subject]["username"]


@pytest.fixture
def empty_db():
    """CSDL đủ migration nhưng chưa có công ty nào, như máy chủ vừa cài."""
    admin = urlunparse(urlparse(TEST_DB_URL)._replace(path="/postgres"))
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute('DROP DATABASE IF EXISTS "bms_setup_test" WITH (FORCE)')
        c.execute('CREATE DATABASE "bms_setup_test"')
    with psycopg.connect(EMPTY_DB_URL) as conn:
        for path in sorted((ROOT / "db/migrations/bms").glob("*.sql")):
            conn.execute(path.read_text(encoding="utf-8"))
    return EMPTY_DB_URL


@pytest.fixture(scope="module")
def pki():
    return make_pki()


@pytest.fixture
def env(empty_db, pki, tmp_path, monkeypatch):
    ca, leaf, key = pki
    (tmp_path / "root.pem").write_bytes(pem.armor("CERTIFICATE", ca.dump()))
    pdfs = {}

    def fake_pdf(ctx, application):
        pdfs[application["nonce"]] = original_pdf(f"Đơn {application['nonce']}")
        return pdfs[application["nonce"]]

    monkeypatch.setattr(setup, "render_pdf", fake_pdf)
    users = FakeUsers()
    ctx = Context(users=users, signature_trust_dir=str(tmp_path), signature_online=False, gotenberg_url="http://x")
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": empty_db, "sleeper_url": ""})
    with TestClient(main.create_app(settings, ctx=ctx)) as client:
        yield {"client": client, "users": users, "db": empty_db, "leaf": leaf, "key": key}


def issue_code(db: str) -> str:
    with psycopg.connect(db) as conn, conn.transaction():
        return setup.new_code(conn)


def one(db: str, sql: str, *args):
    with psycopg.connect(db) as conn:
        return conn.execute(sql, args).fetchone()[0]


def apply(client, code, company=COMPANY, owner=None, admin=None):
    body = {
        "setup_code": code,
        "company": company,
        "owner": owner or {"username": "an.nguyen", "email": "an@abc.vn"},
        "admin": admin,
    }
    return client.post("/setup/applications", json=body)


def test_ma_thiet_lap_sai_bi_khoa_sau_nhieu_lan(env):
    client, db = env["client"], env["db"]
    assert client.get("/setup/status").json()["open"] is True
    r = apply(client, "SAI-MA")
    assert r.status_code == 403 and r.json()["code"] == "setup-code-expired"
    code = issue_code(db)
    for _ in range(setup.MAX_FAILURES):
        assert apply(client, "AAAA-BBBB-CCCC").json()["code"] == "setup-code-invalid"
    r = apply(client, code)
    assert r.status_code == 403 and r.json()["code"] == "setup-code-locked"
    # mã mới hủy mã cũ
    assert apply(client, issue_code(db).lower()).status_code == 200


def test_khoi_tao_bang_don_da_ky_so(env):
    client, db, users = env["client"], env["db"], env["users"]
    r = apply(client, issue_code(db), admin={"username": "it.abc", "full_name": "Trần Bình", "email": None})
    assert r.status_code == 200, r.text
    app_id, token = r.json()["application_id"], r.json()["token"]
    assert client.get(f"/setup/applications/{app_id}/pdf", params={"token": "sai"}).status_code == 404
    pdf = client.get(f"/setup/applications/{app_id}/pdf", params={"token": token})
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")

    signed = sign(pdf.content, env["leaf"], env["key"])
    r = client.post(
        f"/setup/applications/{app_id}/finish",
        json={"token": token, "signed_pdf_base64": base64.b64encode(signed).decode()},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["legal_status"] == "VERIFIED" and body["tenant_code"] == "ABC"
    assert [a["role"] for a in body["accounts"]] == ["Chủ sở hữu", "Quản trị viên"]
    assert all(len(a["password"]) >= 12 for a in body["accounts"])
    assert users.created["sub-an.nguyen"]["required"] == ("UPDATE_PASSWORD", "CONFIGURE_TOTP")

    assert one(db, "SELECT legal_status FROM core.tenant WHERE tax_code = %s", TAX) == "VERIFIED"
    assert one(db, "SELECT count(*) FROM core.legal_verification") == 1
    owner = one(
        db, "SELECT p.idp_subject FROM core.tenant_owner o JOIN core.person p ON p.id = o.person_id WHERE o.platform"
    )
    assert owner == "sub-an.nguyen"
    assert one(db, "SELECT count(*) FROM core.setup_code WHERE used_at IS NOT NULL") == 1
    # đã có công ty thì trang khởi tạo đóng, đơn không dùng lại được
    assert client.get("/setup/status").json()["open"] is False
    assert apply(client, issue_code(db)).json()["code"] == "setup-closed"
    r = client.post(f"/setup/applications/{app_id}/finish", json={"token": token})
    assert r.json()["code"] == "setup-closed"


def test_chu_ky_sai_ma_so_thue_khong_tao_gi(env):
    client, db, users = env["client"], env["db"], env["users"]
    other = make_pki("0109999999")
    r = apply(client, issue_code(db))
    app_id, token = r.json()["application_id"], r.json()["token"]
    pdf = client.get(f"/setup/applications/{app_id}/pdf", params={"token": token}).content
    signed = sign(pdf, other[1], other[2])
    r = client.post(
        f"/setup/applications/{app_id}/finish",
        json={"token": token, "signed_pdf_base64": base64.b64encode(signed).decode()},
    )
    assert r.status_code == 422 and r.json()["code"] == "signature-rejected", r.text
    assert one(db, "SELECT count(*) FROM core.tenant") == 0 and users.created == {}


def test_trung_ten_dang_nhap_va_du_lieu_sai(env):
    client, db = env["client"], env["db"]
    code = issue_code(db)
    assert "Mã số thuế" in apply(client, code, company={**COMPANY, "tax_code": "123"}).json()["message"]
    assert "Mã công ty" in apply(client, code, company={**COMPANY, "code": "1-ABC"}).json()["message"]
    assert "Tên đăng nhập" in apply(client, code, owner={"username": "A B"}).json()["message"]
    r = apply(client, code, owner={"username": "da-co"})
    app_id, token = r.json()["application_id"], r.json()["token"]
    r = client.post(f"/setup/applications/{app_id}/finish", json={"token": token})
    assert r.status_code == 409 and r.json()["code"] == "account-conflict"
    assert one(db, "SELECT count(*) FROM core.tenant") == 0


def test_chua_xac_thuc_roi_ky_bo_sung(env):
    client, db = env["client"], env["db"]
    r = apply(client, issue_code(db), admin={"username": "it.abc", "full_name": "Trần Bình"})
    app_id, token = r.json()["application_id"], r.json()["token"]
    r = client.post(f"/setup/applications/{app_id}/finish", json={"token": token})
    assert r.status_code == 200 and r.json()["legal_status"] == "UNVERIFIED", r.text

    tenant = str(one(db, "SELECT id FROM core.tenant"))
    owner = str(one(db, "SELECT person_id FROM core.tenant_owner"))
    admin = str(one(db, "SELECT id FROM core.person WHERE idp_subject = 'sub-it.abc'"))

    def call(name, args, person):
        payload = {
            "action": {"name": name},
            "input": args,
            "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
        }
        return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})

    status = call("legal_status", {}, admin).json()
    assert status["legal_status"] == "UNVERIFIED" and status["is_owner"] is False and status["signature_ready"]
    assert call("legal_application", {}, admin).json()["extensions"]["code"] == "forbidden"

    application = call("legal_application", {}, owner).json()
    pdf = base64.b64decode(application["pdf_base64"])
    signed = sign(pdf, env["leaf"], env["key"])
    r = call(
        "legal_verify",
        {"application_id": application["application_id"], "content_base64": base64.b64encode(signed).decode()},
        owner,
    )
    assert r.status_code == 200, r.text
    assert (
        r.json()["legal_status"] == "VERIFIED" and "CÔNG TY CỔ PHẦN ABC" in r.json()["verification"]["signer_subject"]
    )
    # đơn đã dùng không dùng lại được
    r = call(
        "legal_verify",
        {"application_id": application["application_id"], "content_base64": base64.b64encode(signed).decode()},
        owner,
    )
    assert r.json()["extensions"]["code"] == "application-used"

    # chủ sở hữu công ty khởi tạo máy chủ cài được mô-đun; quản trị viên chỉ bật trong số đã cài
    assert call("modules", {}, owner).json()["can_install"] is True
    assert call("modules", {}, admin).json()["can_install"] is False
    # quản trị viên không tự trao quyền quản trị cho người khác qua trang quản trị
    role = str(one(db, "SELECT id FROM core.role WHERE code = 'QUAN_TRI_TO_CHUC'"))
    seat = str(one(db, "SELECT id FROM core.position WHERE name = 'Quản trị hệ thống'"))
    r = call(
        "admin_save",
        {"entity": "role_grant", "data": {"role_id": role, "position_id": seat, "scope": "UNIT"}},
        admin,
    )
    assert "Chỉ chủ sở hữu" in r.json()["message"], r.text


class OtpUsers:
    def __init__(self, with_otp=()):
        self.with_otp = set(with_otp)
        self.asked: list[str] = []

    def ensure_otp(self, subject):
        self.asked.append(subject)
        return subject not in self.with_otp


def test_quan_tri_vien_bi_bat_cai_otp(env):
    from app import hr_account

    client, db = env["client"], env["db"]
    r = apply(client, issue_code(db), admin={"username": "it.abc", "full_name": "Trần Bình"})
    client.post(f"/setup/applications/{r.json()['application_id']}/finish", json={"token": r.json()["token"]})
    users, done = OtpUsers(with_otp={"sub-it.abc"}), set()
    with psycopg.connect(db) as conn:
        assert hr_account.enforce_admin_otp(conn, users, done) == 1
        assert sorted(users.asked) == ["sub-an.nguyen", "sub-it.abc"]
        # đã kiểm thì không hỏi lại Keycloak
        assert hr_account.enforce_admin_otp(conn, users, done) == 0 and len(users.asked) == 2


def setup_signed(env, admin=True) -> dict:
    client, db = env["client"], env["db"]
    r = apply(client, issue_code(db), admin={"username": "it.abc", "full_name": "Trần Bình"} if admin else None)
    app_id, token = r.json()["application_id"], r.json()["token"]
    pdf = client.get(f"/setup/applications/{app_id}/pdf", params={"token": token}).content
    signed = sign(pdf, env["leaf"], env["key"])
    r = client.post(
        f"/setup/applications/{app_id}/finish",
        json={"token": token, "signed_pdf_base64": base64.b64encode(signed).decode()},
    )
    assert r.status_code == 200, r.text
    with psycopg.connect(db) as conn:
        ids = dict(conn.execute("SELECT idp_subject, id::text FROM core.person").fetchall())
        tenant = str(conn.execute("SELECT id FROM core.tenant").fetchone()[0])
    return {"tenant": tenant, "owner": ids["sub-an.nguyen"], "admin": ids.get("sub-it.abc")}


def action(client, name, args, person, tenant):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})


def test_khoi_phuc_chu_so_huu_bang_ky_so(env):
    client, db, users = env["client"], env["db"], env["users"]
    setup_signed(env)
    assert client.post("/setup/recovery", json={"tax_code": "0109999999"}).json()["code"] == "not-found"
    r = client.post("/setup/recovery", json={"tax_code": TAX})
    assert r.status_code == 200, r.text
    app_id, token = r.json()["application_id"], r.json()["token"]
    pdf = client.get(f"/setup/applications/{app_id}/pdf", params={"token": token})
    assert pdf.status_code == 200 and "don-khoi-phuc" in pdf.headers["content-disposition"]

    other = make_pki("0109999999")
    bad = client.post(
        f"/setup/recovery/{app_id}/finish",
        json={"token": token, "signed_pdf_base64": base64.b64encode(sign(pdf.content, other[1], other[2])).decode()},
    )
    assert bad.status_code == 422 and not hasattr(users, "recovered")

    signed = sign(pdf.content, env["leaf"], env["key"])
    r = client.post(
        f"/setup/recovery/{app_id}/finish",
        json={"token": token, "signed_pdf_base64": base64.b64encode(signed).decode()},
    )
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "an.nguyen" and users.recovered == ("sub-an.nguyen", r.json()["password"])
    assert (
        one(db, "SELECT count(*) FROM collab.notification WHERE kind = 'SECURITY' AND title LIKE 'Đã khôi phục%%'") == 2
    )
    again = client.post(
        f"/setup/recovery/{app_id}/finish",
        json={"token": token, "signed_pdf_base64": base64.b64encode(signed).decode()},
    )
    assert again.json()["code"] == "application-used"


def test_thiet_bi_moi_cua_quan_tri_vien(env):
    from app import auth

    ids = setup_signed(env)
    session = {"X-Hasura-User-Id": ids["admin"], "X-Hasura-Tenant-Id": ids["tenant"]}
    headers = {"user-agent": "Mozilla/5.0 Firefox/140", "x-forwarded-for": "203.0.113.25, 10.0.0.1"}
    with psycopg.connect(env["db"]) as conn:
        assert auth.record_login(conn, session, headers) is True
        assert auth.record_login(conn, session, {**headers, "x-forwarded-for": "203.0.113.99"}) is False  # cùng dải /24
        assert auth.record_login(conn, session, {**headers, "x-forwarded-for": "198.51.100.7"}) is True
        title, body = conn.execute(
            "SELECT title, body FROM collab.notification WHERE kind = 'SECURITY' ORDER BY created_at LIMIT 1"
        ).fetchone()
    assert "Trần Bình" in title and "203.0.113.0" in body and "Firefox" in body
    # giao diện gửi mã thiết bị: cùng trình duyệt đổi mạng không báo, trình duyệt khác thì báo
    web = {
        "x-bamboo-device": "6f1c-may-cong-ty",
        "x-bamboo-agent": "Chrome trên Windows",
        "x-forwarded-for": "10.1.1.1",
    }
    with psycopg.connect(env["db"]) as conn:
        assert auth.record_login(conn, session, web) is True
        assert auth.record_login(conn, session, {**web, "x-forwarded-for": "172.16.0.9"}) is False
        assert auth.record_login(conn, session, {**web, "x-bamboo-device": "may-la"}) is True


def test_chuyen_quyen_chu_so_huu(env):
    client, db = env["client"], env["db"]
    ids = setup_signed(env)
    t = ids["tenant"]
    assert (
        action(client, "transfer_ownership", {"person_id": ids["owner"]}, ids["admin"], t).json()["extensions"]["code"]
        == "forbidden"
    )
    r = action(client, "transfer_ownership", {"person_id": ids["admin"]}, ids["owner"], t)
    assert r.status_code == 200 and r.json()["owner_name"] == "Trần Bình", r.text
    assert str(one(db, "SELECT person_id FROM core.tenant_owner")) == ids["admin"]
    # chủ sở hữu cũ không còn trao được quyền quản trị, chủ sở hữu mới thì được
    role = str(one(db, "SELECT id FROM core.role WHERE code = 'QUAN_TRI_TO_CHUC'"))
    seat = str(one(db, "SELECT id FROM core.position WHERE name = 'Quản trị hệ thống'"))
    grant = {"entity": "role_grant", "data": {"role_id": role, "position_id": seat, "scope": "UNIT"}}
    assert "Chỉ chủ sở hữu" in action(client, "admin_save", grant, ids["owner"], t).json()["message"]


def test_tao_cong_ty_thanh_vien(env):
    client, db, users = env["client"], env["db"], env["users"]
    ids = setup_signed(env)
    t = ids["tenant"]
    body = {
        "code": "ABC_SX",
        "name": "Công ty Sản xuất ABC",
        "tax_code": "0101234567-001",
        "legal_name": "Chi nhánh Sản xuất ABC",
        "address": "KCN Thăng Long",
        "legal_rep_name": "Lê Văn Cường",
        "owner": {"username": "cuong.le", "full_name": "Lê Văn Cường", "email": None},
    }
    assert action(client, "create_subsidiary", body, ids["admin"], t).json()["extensions"]["code"] == "forbidden"
    r = action(client, "create_subsidiary", body, ids["owner"], t)
    assert r.status_code == 200 and r.json()["password"], r.text
    assert users.created["sub-cuong.le"]["required"] == ("UPDATE_PASSWORD", "CONFIGURE_TOTP")
    child = one(db, "SELECT id FROM core.tenant WHERE code = 'ABC_SX'")
    assert str(one(db, "SELECT parent_tenant_id FROM core.tenant_relation WHERE child_tenant_id = %s", child)) == t
    assert one(db, "SELECT legal_status FROM core.tenant WHERE id = %s", child) == "UNVERIFIED"
    assert one(db, "SELECT count(*) FROM core.tenant_module WHERE tenant_id = %s", child) == 0
    assert action(client, "create_subsidiary", body, ids["owner"], t).json()["extensions"]["code"] == "conflict"

    # dùng chung tài khoản của người ở công ty mẹ: không tạo tài khoản mới, người đó vào được cả hai công ty
    shared = {**body, "code": "ABC_TM", "name": "Thương mại ABC", "tax_code": None}
    shared["owner"] = {"username": "it.abc", "full_name": "Trần Bình"}
    r = action(client, "create_subsidiary", shared, ids["owner"], t)
    assert r.status_code == 200 and r.json()["password"] is None, r.text
    assert one(db, "SELECT count(*) FROM core.account_tenants('sub-it.abc')") == 2
    outsider = {**shared, "code": "ABC_X", "owner": {"username": "da-co-ngoai", "full_name": "Người ngoài"}}
    users.created["sub-ngoai"] = {"username": "da-co-ngoai", "required": (), "attribute": ""}
    assert (
        action(client, "create_subsidiary", outsider, ids["owner"], t).json()["extensions"]["code"]
        == "account-conflict"
    )
