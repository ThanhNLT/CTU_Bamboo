# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import datetime
import uuid

import psycopg
import pytest

from app import hr
from app.common import ActionError
from conftest import ids


@pytest.fixture
def app_conn(database):
    # Kết nối như của dịch vụ actions: hàng dạng tuple, mỗi lệnh tự cam kết
    with psycopg.connect(database, autocommit=True) as c:
        yield c


@pytest.fixture
def leaders(conn):
    """Phó tổng giám đốc được cấp quyền ban hành; chuyên viên thì không."""
    role = f"QD_{uuid.uuid4().hex[:8]}"
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %s, 'Quyết định')", (role,))
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT r.tenant_id, r.id, p FROM core.role r, unnest(ARRAY['hr.decision.issue', 'hr.decision.read']) p
           WHERE r.tenant_id = test.id('TDX') AND r.code = %s""",
        (role,),
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT r.tenant_id, r.id, test.id('P_PTGD'), 'TENANT' FROM core.role r
           WHERE r.tenant_id = test.id('TDX') AND r.code = %s""",
        (role,),
    )
    return ids(conn, "ptgd", "c", "d", "TDX", "P_NV_MH_DT", "P_NV2_MH_DT")


def session(person: str, tenant: str) -> dict:
    return {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant}


def day(offset: int) -> str:
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


def test_chi_nguoi_co_quyen_ra_quyet_dinh(app_conn, leaders):
    tenant = leaders["TDX"]
    with pytest.raises(ActionError) as err:
        hr.personnel_decision_context(app_conn, session(leaders["c"], tenant), {}, None)
    assert err.value.status == 403
    context = hr.personnel_decision_context(app_conn, session(leaders["ptgd"], tenant), {}, None)
    listed = {p["id"] for p in context["people"]}
    assert leaders["c"] in listed and leaders["ptgd"] not in listed, "không tự ra quyết định về chính mình"
    assert context["positions"]


def test_ban_hanh_va_xem_quyet_dinh(conn, app_conn, leaders):
    tenant, boss = leaders["TDX"], session(leaders["ptgd"], leaders["TDX"])
    key = f"P_QD_{uuid.uuid4().hex[:8]}"
    conn.execute("SELECT test.position('TDX', %s, 'DT_MH', 'Chuyên viên bổ nhiệm kiêm nhiệm')", (key,))
    target = ids(conn, key)[key]
    args = {
        "decision_type": "APPOINT",
        "person_id": leaders["c"],
        "target_position_id": target,
        "assignment_type": "CONCURRENT",
        "effective_date": day(2),
        "reason": "Bổ sung nhân lực dự án",
    }
    result = hr.issue_personnel_decision(app_conn, boss, args, None)
    assert result["doc_no"].startswith("QD-")

    seen_by_issuer = hr.personnel_decisions(app_conn, boss, {}, None)
    assert seen_by_issuer["can_issue"] is True
    assert [d["doc_no"] for d in seen_by_issuer["decisions"]] == [result["doc_no"]]
    row = seen_by_issuer["decisions"][0]
    assert row["decision_type"] == "APPOINT" and row["assignment_type"] == "CONCURRENT"
    assert row["target_position"] == "Chuyên viên bổ nhiệm kiêm nhiệm"

    subject = hr.personnel_decisions(app_conn, session(leaders["c"], tenant), {}, None)
    assert subject["can_issue"] is False and len(subject["decisions"]) == 1, "người được ra quyết định xem được"
    other = hr.personnel_decisions(app_conn, session(leaders["d"], tenant), {}, None)
    assert other["decisions"] == [], "người khác không xem được"

    with pytest.raises(Exception, match="đã giữ vị trí|đã có người ngồi"):
        hr.issue_personnel_decision(app_conn, boss, args, None)
