# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Đối chiếu CSDL → Flowable thật (ADR #31)."""

# ===== Thư viện bên ngoài =====
import psycopg  # psycopg
import pytest  # pytest
from psycopg.rows import dict_row  # psycopg

# ===== Module nội bộ =====
from app import flow_sync
from conftest import ids, open_task, pr

# ===== Hằng số & cấu hình =====
PROCESS = flow_sync.PROCESS_KEY


# ===== Fixture kiểm thử =====
@pytest.fixture
def work(database):
    with psycopg.connect(database, row_factory=dict_row) as c:
        yield c


# ===== Hàm hỗ trợ kiểm thử =====
def sync(work, flowable):
    while flow_sync.run_once(work, flowable):
        pass
    left = work.execute("SELECT entity_id, last_error FROM wf.flow_sync WHERE dirty").fetchall()
    work.commit()
    assert not [r for r in left if r["last_error"]], left


def process(flowable, pr_id, round_no=1):
    return flowable.find_process(PROCESS, flow_sync.business_key(pr_id, round_no))


def assignee(flowable, pr_id, round_no=1):
    tasks = flowable.tasks(process(flowable, pr_id, round_no)["id"])
    assert len(tasks) == 1
    return tasks[0]["assignee"]


def approve(conn, pr_id, person_key):
    conn.execute("SELECT wf.act(%s, test.id(%s), 'APPROVE')", (open_task(conn, pr_id)["id"], person_key))


# ===== Kiểm thử =====
def test_hai_buoc_den_khi_duyet_xong(flowable, conn, work, org):
    k = org
    i = ids(conn, k("gd"), "tgd")
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 600_000_000)
    sync(work, flowable)
    proc = process(flowable, pr_id)
    assert proc["endTime"] is None
    assert assignee(flowable, pr_id) == i[k("gd")]

    approve(conn, pr_id, k("gd"))
    sync(work, flowable)
    assert assignee(flowable, pr_id) == i["tgd"]
    assert flowable.variable(proc["id"], "stepIndex") == 1

    approve(conn, pr_id, "tgd")
    sync(work, flowable)
    proc = process(flowable, pr_id)
    assert proc["endTime"] is not None and proc["endActivityId"] == "approved"

    sync(work, flowable)  # chạy lại không đổi gì
    assert process(flowable, pr_id)["endActivityId"] == "approved"


def test_tra_ve_roi_gui_lai(flowable, conn, work, org):
    k = org
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 20_000_000)
    conn.execute("SELECT wf.act(%s, test.id(%s), 'RETURN', 'Bổ sung')", (open_task(conn, pr_id)["id"], k("tp")))
    conn.execute("SELECT proc.submit_purchase_request(%s, test.id(%s))", (pr_id, k("nv")))
    sync(work, flowable)
    assert process(flowable, pr_id, 1)["endActivityId"] == "returned"
    assert process(flowable, pr_id, 2)["endTime"] is None


def test_chuyen_viec_khi_doi_nguoi_ngoi_ghe(flowable, conn, work, org):
    k = org
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 100_000_000)
    sync(work, flowable)
    i = ids(conn, k("gd"))
    assert assignee(flowable, pr_id) == i[k("gd")]

    with conn.transaction():
        conn.execute("SELECT test.end_assignment(%s, %s)", (k("gd"), k("P_GD")))
        conn.execute("SELECT test.person('TDX', %s, 'Giám đốc mới')", (k("gd2"),))
        conn.execute("SELECT test.assign('TDX', %s, %s, 'PRIMARY', tstzrange(now(), NULL))", (k("gd2"), k("P_GD")))
    sync(work, flowable)
    assert assignee(flowable, pr_id) == ids(conn, k("gd2"))[k("gd2")]


def test_gop_buoc(flowable, conn, work, org):
    k = org
    conn.execute("SELECT test.end_assignment(%s, %s)", (k("gd"), k("P_GD")))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 600_000_000)
    sync(work, flowable)
    assert assignee(flowable, pr_id) == ids(conn, "tgd")["tgd"]
    approve(conn, pr_id, "tgd")
    sync(work, flowable)
    proc = process(flowable, pr_id)
    assert proc["endActivityId"] == "approved", "Flowable đi qua cả hai vòng của bước đã gộp"


def test_huy_khi_het_hop_dong(flowable, conn, work, org):
    k = org
    conn.execute(f"""
        SELECT test.position('TDX', '{k("P_HD")}', '{k("PHONG")}', 'Hợp đồng', false, '{k("P_TP")}');
        SELECT test.assign('TDX', 'a', '{k("P_HD")}', 'CONTRACT',
                           tstzrange(now() - interval '1 month', now() + interval '1 day'), 'HD-{k("x")}');
    """)
    pr_id = pr(conn, k("pr"), "a", k("P_HD"), 10_000_000)
    sync(work, flowable)
    assert process(flowable, pr_id)["endTime"] is None
    conn.execute("SELECT wf.refresh_all(now() + interval '2 days')")
    sync(work, flowable)
    proc = process(flowable, pr_id)
    assert proc["endTime"] is not None and proc["deleteReason"] == "Chứng từ bị hủy trong CSDL"
