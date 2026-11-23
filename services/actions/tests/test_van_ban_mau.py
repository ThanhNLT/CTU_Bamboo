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

import datetime
import re
import uuid

import httpx
import psycopg
import pytest
from test_phieu_pdf import _pdf_text, _reachable_tika
from test_quyet_dinh_nhan_su import day, leaders, session  # noqa: F401

from app import documents
from app.common import ActionError, Context
from conftest import ids


@pytest.fixture
def app_conn(database):
    with psycopg.connect(database, autocommit=True) as c:
        yield c


def test_van_ban_hanh_chinh_va_phan_quyen(conn, app_conn, leaders, s3, gotenberg):  # noqa: F811
    from app import hr

    tenant, boss = leaders["TDX"], session(leaders["ptgd"], leaders["TDX"])
    key = f"P_VB_{uuid.uuid4().hex[:8]}"
    conn.execute("SELECT test.position('TDX', %s, 'DT_MH', 'Chuyên viên <b>kiêm nhiệm</b>')", (key,))
    target = ids(conn, key)[key]
    made = hr.issue_personnel_decision(
        app_conn,
        boss,
        {
            "decision_type": "APPOINT",
            "person_id": leaders["c"],
            "target_position_id": target,
            "assignment_type": "CONCURRENT",
            "effective_date": day(3),
            "reason": "Bổ sung nhân lực <script>x</script>",
        },
        None,
    )
    ctx = Context(storage=s3, gotenberg_url=gotenberg)
    first = documents.get_personnel_decision_pdf(app_conn, boss, {"decision_id": made["id"]}, ctx)
    assert first["doc_no"] == made["doc_no"] and not first["cached"]
    pdf = httpx.get(first["url"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    if _reachable_tika():
        text = _pdf_text(pdf.content)
        for expected in (
            "QUYẾT ĐỊNH",
            "Về việc bổ nhiệm cán bộ",
            made["doc_no"],
            "kiêm nhiệm",
            "Điều 1",
            "Điều 3",
            f"Mã kiểm tra {first['check_code']}",
        ):
            assert expected in text, (expected, text)
        assert "<script>x</script>" in text, "mã trong dữ liệu chỉ hiện như chữ, không chạy"

    again = documents.get_personnel_decision_pdf(
        app_conn, session(leaders["c"], tenant), {"decision_id": made["id"]}, ctx
    )
    assert again["cached"] and again["check_code"] == first["check_code"], "người được quyết định xem được"
    with pytest.raises(ActionError) as err:
        documents.get_personnel_decision_pdf(app_conn, session(leaders["d"], tenant), {"decision_id": made["id"]}, ctx)
    assert err.value.status == 404
    with pytest.raises(ActionError) as err:
        documents.get_personnel_decision_pdf(app_conn, boss, {"decision_id": made["id"]}, Context())
    assert err.value.status == 503


def test_dieu_khoan_theo_loai_quyet_dinh():
    base = {
        "person": "A",
        "employee_code": "NV1",
        "source_position": "TP",
        "source_unit": "Phòng X",
        "target_position": "PGĐ",
        "target_unit": "Phòng Y",
        "assignment_type": "ACTING",
    }
    assert "quyền (tạm thời)" in documents.decision_article({**base, "decision_type": "APPOINT"})
    assert "từ chức danh TP – Phòng X sang chức danh PGĐ – Phòng Y" in documents.decision_article(
        {**base, "decision_type": "TRANSFER"}
    )
    assert documents.decision_article({**base, "decision_type": "DISMISS", "target_position": None}).startswith(
        "Miễn nhiệm"
    )


def test_danh_gia_nguong():
    assert documents.assess(5, "up", 3) == "Đạt ngưỡng" and documents.assess(5, "down", 3) == "Chưa đạt ngưỡng"
    assert documents.assess(5, "neutral", 3) == "–" and documents.assess(5, "up", None) == "–"


def test_bao_cao_kpi_dong_bang(conn, app_conn, leaders, s3, gotenberg):  # noqa: F811
    tenant = leaders["TDX"]
    key = f"kpi_vb_{uuid.uuid4().hex[:6]}"
    conn.execute(
        """INSERT INTO kpi.definition (tenant_id, key, label, unit, good_direction, threshold, grain, definition)
           VALUES (%s, %s, 'Thời gian duyệt <i>TB</i>', 'giờ', 'down', 8, 'month', 'Trung bình giờ từ gửi đến duyệt')""",
        (tenant, key),
    )
    for months_ago, value in ((3, 6.5), (2, 9.25)):
        start = (datetime.date.today().replace(day=1) - datetime.timedelta(days=30 * months_ago)).replace(day=1)
        conn.execute(
            "INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value) VALUES (%s, %s, %s::date, %s)",
            (tenant, key, start, value),
        )
    conn.execute("SELECT kpi.freeze()")
    who = session(leaders["c"], tenant)
    rows = documents.kpi_snapshots(app_conn, who, {"kpi_key": key}, None)
    assert [r["value"] for r in rows] == [9.25, 6.5] and all(r["valid"] for r in rows)
    assert re.fullmatch(r"[A-Z][a-z]{2}-\d{4}", rows[0]["period"]), "tháng dạng MMM-YYYY, ví dụ Sep-2026"

    ctx = Context(storage=s3, gotenberg_url=gotenberg)
    out = documents.get_kpi_report_pdf(app_conn, who, {}, ctx)
    assert out["kpis"] >= 1 and httpx.get(out["url"]).content.startswith(b"%PDF-")
    if _reachable_tika():
        text = _pdf_text(httpx.get(out["url"]).content)
        assert "BÁO CÁO CHỈ SỐ KPI" in text and "Thời gian duyệt <i>TB</i>" in text and "Chưa đạt ngưỡng" in text
    assert documents.get_kpi_report_pdf(app_conn, who, {}, ctx)["cached"]
    with pytest.raises(ActionError):
        documents.get_kpi_report_pdf(app_conn, who, {"month": "2026-13"}, ctx)
