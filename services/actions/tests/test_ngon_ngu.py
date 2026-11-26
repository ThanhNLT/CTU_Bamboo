# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

"""Ngôn ngữ và định dạng ngày, số của văn bản máy chủ tự dựng: PDF, Excel mẫu, email."""

import base64
import datetime as dt
import email
import email.policy
import importlib.util
import io
import pathlib
from decimal import Decimal

import psycopg
import pytest
from openpyxl import load_workbook
from test_giao_thong_bao import enqueue_for, settings_for, signer, smtp, worker  # noqa: F401
from test_phieu_pdf import _sample
from test_quan_tri import admin, call, client  # noqa: F401

from app import admin as admin_app
from app import delivery, documents, forms, i18n, messaging, projects
from app.common import Context
from conftest import ids

ROOT = pathlib.Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def tieng_viet_mac_dinh():
    i18n.set_locale("vi")
    yield
    i18n.set_locale("vi")


def test_ngay_va_so_theo_chuan_chung():
    assert i18n.date(dt.date(2026, 11, 5)) == "05-Nov-2026"
    assert i18n.date("2026-01-31") == "31-Jan-2026"
    assert i18n.date(dt.datetime(2026, 11, 5, 14, 7), time=True) == "05-Nov-2026 14:07"
    assert i18n.month(dt.date(2026, 3, 1)) == "Mar-2026"
    assert i18n.number(Decimal("1234567.50"), 2) == "1,234,567.5"
    assert i18n.date(None) == ""


def test_cau_co_dinh_theo_ngon_ngu():
    assert i18n.t("Người đề nghị") == "Người đề nghị"
    with i18n.use("en"):
        assert i18n.t("Người đề nghị") == "Requester"
        assert i18n.t("Tuần từ {0}", "05-Nov-2026") == "Week of 05-Nov-2026"
    assert i18n.get_locale() == "vi"
    assert i18n.normalize("en-US") == "en" and i18n.normalize(None) == "vi" and i18n.normalize("fr") == "vi"


def test_thong_bao_da_ghep_dich_duoc_ca_phan_dong():
    assert i18n.message("Đề nghị tiếp nhận TN-0001 (Trần B) đã được duyệt", "en") == (
        "Onboarding request TN-0001 (Trần B) has been approved"
    )
    assert i18n.message("Sắp đến lịch: Họp giao ban", "en") == "Upcoming event: Họp giao ban"
    assert i18n.message("Nguyễn An nhắc đến bạn trong Phòng Kỹ thuật", "en") == (
        "Nguyễn An mentioned you in Phòng Kỹ thuật"
    )
    assert i18n.message("09:00 15/11/2026 · Phòng họp A", "vi") == "09:00 15-Nov-2026 · Phòng họp A"
    assert i18n.message("Ghi chú riêng của người dùng", "en") == "Ghi chú riêng của người dùng"
    assert i18n.message(None, "en") == ""


def test_moi_cau_van_ban_deu_co_ban_dich():
    spec = importlib.util.spec_from_file_location("i18n_server", ROOT / "tools/i18n_server.py")
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    assert tool.main(["i18n_server", "check"]) == 0
    labels = [
        *forms.STATUS_LABELS.values(),
        *forms.STEP_LABELS.values(),
        *documents.TITLES.values(),
        *documents.ASSIGNMENT.values(),
        *projects.STATUS_LABEL.values(),
        *projects.ROLE_LABEL.values(),
        *projects.HEALTH_LABEL.values(),
        *admin_app.EXAMPLE_WORDS,
        *(title for columns in admin_app.COLUMNS.values() for _, title, *_ in columns if title != "Email"),
    ]
    assert [x for x in labels if i18n.english(x) == x] == []


@pytest.mark.parametrize(
    "amount,words",
    [
        (0, "Zero dong"),
        (15, "Fifteen dong"),
        (105, "One hundred five dong"),
        (300_000, "Three hundred thousand dong"),
        (1_234_567, "One million two hundred thirty-four thousand five hundred sixty-seven dong"),
        (2_000_005_000, "Two billion five thousand dong"),
    ],
)
def test_so_tien_bang_chu_tieng_anh(amount, words):
    with i18n.use("en"):
        assert forms.amount_in_words(amount) == words


def test_phieu_mua_sam_tieng_anh():
    with i18n.use("en"):
        html = forms.render_purchase_request(_sample())
    assert "PURCHASE REQUEST" in html and "Requester" in html and "Three hundred thousand dong" in html
    assert "Pending approval" in html and "300,000" in html
    assert "Người đề nghị" not in html and "PHIẾU ĐỀ NGHỊ" not in html
    assert "PHIẾU ĐỀ NGHỊ MUA SẮM" in forms.render_purchase_request(_sample())


def test_quyet_dinh_nhan_su_tieng_anh():
    d = {
        "id": "x",
        "tenant_id": "t",
        "doc_no": "QD-0001",
        "decision_type": "APPOINT",
        "assignment_type": "PRIMARY",
        "reason": "Nhu cầu công tác",
        "effective_date": dt.date(2026, 12, 1),
        "created_at": dt.datetime(2026, 11, 5, 3, 0, tzinfo=dt.UTC),
        "person": "Trần Thị B",
        "employee_code": "NV0002",
        "issuer": "Nguyễn Văn A",
        "issuer_position": "Tổng giám đốc",
        "source_position": None,
        "source_unit": None,
        "target_position": "Trưởng phòng",
        "target_unit": "Phòng Kỹ thuật",
        "company": "Công ty X",
    }
    vi = documents.render_decision(d)
    assert "01-Dec-2026" in vi and "Hà Nội, 05-Nov-2026" in vi and "Bổ nhiệm Trần Thị B (mã nhân sự NV0002)" in vi
    with i18n.use("en"):
        en = documents.render_decision(d)
    assert "To appoint Trần Thị B (employee code NV0002) to the position of Trưởng phòng – Phòng Kỹ thuật" in en
    assert "Hanoi, 05-Nov-2026" in en and "On the appointment of personnel" in en and "Điều 1." not in en


def test_nhan_ky_va_danh_gia_kpi():
    start = dt.datetime(2026, 11, 2, 17, 0, tzinfo=dt.UTC)
    assert documents.period_label("day", start) == "03-Nov-2026"
    assert documents.period_label("month", start) == "Nov-2026"
    assert documents.period_label("week", start) == "Tuần từ 03-Nov-2026"
    with i18n.use("en"):
        assert documents.period_label("week", start) == "Week of 03-Nov-2026"
        assert documents.assess(5, "up", 3) == "Threshold met"


def test_tep_nhap_nhan_tieu_de_va_gia_tri_tieng_anh():
    content = "Supplier code *,Supplier name *,Tax code\nNCC9,Nhà cung cấp chín,0101234567\n".encode()
    rows = admin_app._read_rows("partner", "ncc.csv", content)
    assert rows == [{"code": "NCC9", "name": "Nhà cung cấp chín", "tax_code": "0101234567"}]
    cu = "Từ ngày (dd/mm/yyyy),Mã vai trò *\n01/12/2026,QUAN_LY\n".encode()
    assert admin_app._read_rows("role_grant", "quyen.csv", cu)[0]["valid_from"] == "01/12/2026"
    assert admin_app._date("05-Nov-2026", "Từ ngày") == dt.date(2026, 11, 5)
    assert admin_app._date("05/11/2026", "Từ ngày") == dt.date(2026, 11, 5)
    assert admin_app.ASSIGNMENT_LABELS["primary"] == "PRIMARY" and admin_app.SCOPE_LABELS["branch"] == "SUBTREE"


def test_tep_mau_theo_ngon_ngu_nguoi_goi(client, admin):  # noqa: F811
    k = admin["k"]
    person, tenant = admin[k("gd")], admin["TDX"]
    assert call(client, "set_my_locale", {"locale": "en"}, person, tenant).json() == {"locale": "en"}
    r = call(client, "admin_import_template", {"kind": "partner"}, person, tenant).json()
    book = load_workbook(io.BytesIO(base64.b64decode(r["content_base64"])))
    assert book.sheetnames == ["Data", "Example"] and book["Data"]["A1"].value == "Supplier code *"
    assert call(client, "set_my_locale", {"locale": "vi"}, person, tenant).json() == {"locale": "vi"}
    r = call(client, "admin_import_template", {"kind": "partner"}, person, tenant).json()
    assert load_workbook(io.BytesIO(base64.b64decode(r["content_base64"]))).active["A1"].value == "Mã nhà cung cấp *"


def test_email_theo_ngon_ngu_nguoi_nhan(conn, database, worker, smtp):  # noqa: F811
    i = ids(conn, "TDX", "c", "a")
    session = {"x-hasura-tenant-id": str(i["TDX"]), "x-hasura-user-id": str(i["c"])}
    with psycopg.connect(database, autocommit=True) as app_conn:
        assert messaging.set_my_locale(app_conn, session, {"locale": "en"}, Context())["locale"] == "en"
    try:
        title = "Đề nghị PR-0099 đã được duyệt"
        message_id = enqueue_for(conn, i, "EMAIL", "nhan.vien@bamboo.vn", title)
        settings = settings_for(database, smtp_host="127.0.0.1", smtp_port=smtp.port)
        assert delivery.run_once(worker, settings, signer()) >= 1
        row = conn.execute("SELECT status, payload FROM msg.queue WHERE id = %s", (message_id,)).fetchone()
        assert row["status"] == "DELIVERED" and row["payload"]["title"] == title, "bản lưu giữ nguyên để khớp mã băm"
        # Hàng đợi có thể còn thư của test khác; lấy đúng thư PR-0099 thay vì thư gửi sau cùng.
        mails = [email.message_from_bytes(m, policy=email.policy.default) for m in smtp.messages]
        mail = next(m for m in mails if "PR-0099" in m["Subject"])
        assert mail["Subject"] == "Request PR-0099 has been approved"
        assert "Open in Bamboo: http://localhost:8000/" in mail.get_body().get_content()
    finally:
        conn.execute("DELETE FROM collab.person_locale WHERE person_id = %s", (i["c"],))
        conn.execute("DELETE FROM collab.notification_pref WHERE person_id = %s", (i["c"],))
