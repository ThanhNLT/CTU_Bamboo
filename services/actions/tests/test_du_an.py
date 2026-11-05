# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Quản lý dự án (ADR #66): lập lịch theo phụ thuộc, WBS, đường găng, quyền, báo cáo tiến độ, mô-đun `project`."""

import datetime as dt

from app import projects
from conftest import ids

D = dt.date


def _t(tid, start, end, parent=None, seq=0, progress=0, milestone=False):
    return {
        "id": tid,
        "parent_id": parent,
        "seq": seq,
        "name": tid,
        "start_date": start,
        "end_date": end,
        "milestone": milestone,
        "progress": progress,
        "baseline_end": None,
    }


def test_lap_lich_doi_viec_sau_va_ca_cay_con():
    tasks = {
        "a": _t("a", D(2026, 11, 2), D(2026, 11, 6), seq=1),
        "b": _t("b", D(2026, 11, 4), D(2026, 11, 5), seq=2),  # phải bắt đầu sau a: dời 5 ngày
        "p": _t("p", D(2026, 11, 1), D(2026, 11, 1), seq=3),  # tổng hợp, phụ thuộc b
        "p1": _t("p1", D(2026, 11, 3), D(2026, 11, 4), parent="p", seq=1),
        "p2": _t("p2", D(2026, 11, 5), D(2026, 11, 5), parent="p", seq=2, milestone=True),
    }
    deps = [
        {"predecessor_id": "a", "successor_id": "b", "lag_days": 0},
        {"predecessor_id": "b", "successor_id": "p", "lag_days": 2},
    ]
    moved = projects.schedule(tasks, deps)
    assert (tasks["b"]["start_date"], tasks["b"]["end_date"]) == (D(2026, 11, 7), D(2026, 11, 8)), "giữ thời lượng"
    # p phải bắt đầu ≥ 8/11 + 1 + 2 = 11/11; p bắt đầu theo con sớm nhất (3/11) nên cả cây dời 8 ngày
    assert tasks["p1"]["start_date"] == D(2026, 11, 11) and tasks["p2"]["start_date"] == D(2026, 11, 13)
    assert (tasks["p"]["start_date"], tasks["p"]["end_date"]) == (D(2026, 11, 11), D(2026, 11, 13)), "cha phủ các con"
    assert moved == {"b", "p", "p1", "p2"}
    assert projects.schedule(tasks, deps) == set(), "đã thỏa thì không dời nữa"


def test_wbs_duong_gang_va_tien_do_tong_hop():
    tasks = {
        "a": _t("a", D(2026, 11, 2), D(2026, 11, 8), seq=1, progress=100),
        "b": _t("b", D(2026, 11, 9), D(2026, 11, 18), seq=2, progress=50),
        "c": _t("c", D(2026, 11, 9), D(2026, 11, 10), seq=3),  # nhánh song song, còn dư thời gian
        "g": _t("g", D(2026, 11, 1), D(2026, 11, 1), seq=4),
        "g1": _t("g1", D(2026, 11, 19), D(2026, 11, 19), parent="g", seq=1, milestone=True),
    }
    deps = [
        {"predecessor_id": "a", "successor_id": "b", "lag_days": 0},
        {"predecessor_id": "a", "successor_id": "c", "lag_days": 0},
        {"predecessor_id": "b", "successor_id": "g1", "lag_days": 0},
    ]
    projects.rollup(tasks)
    projects.analyze(tasks, deps, D(2026, 11, 12))
    assert [tasks[k]["wbs"] for k in ("a", "b", "c", "g", "g1")] == ["1", "2", "3", "4", "4.1"]
    assert tasks["g"]["has_children"] and tasks["g1"]["level"] == 1
    assert {k for k, t in tasks.items() if t["critical"]} == {"a", "b", "g", "g1"}
    assert tasks["c"]["slack_days"] == 9 and not tasks["c"]["critical"]
    assert tasks["c"]["late"] and not tasks["b"]["late"], "quá hạn chưa xong là trễ"
    assert projects.suggest_health({"spi": 0.9, "late_tasks": 1}) == "AMBER"
    assert projects.suggest_health({"spi": 0.7, "late_tasks": 0}) == "RED"
    assert projects.suggest_health({"spi": 1.0, "late_tasks": 0}) == "GREEN"


Q_DETAIL = """query($id: uuid!) { pm_project_detail(id: $id) {
  project members tasks dependencies stats reports can_manage my_role warnings } }"""


def test_du_an_quyen_lap_lich_bao_cao(hasura, conn, org):
    i = ids(conn, org("nv"), org("tp"), org("gd"), org("PHONG"), "TDX", "a")
    nv, tp, tenant, outsider = i[org("nv")], i[org("tp")], i["TDX"], i["a"]
    code = f"DA-{org('x')[-6:].upper()}"

    def run(q, v, who=tp):
        return hasura(q, v, person=who, tenant=tenant)

    saved = run(
        "mutation($p: jsonb!) { pm_project_save(project: $p) { id created } }",
        {
            "p": {
                "code": code,
                "name": "Chuyển đổi số phòng",
                "org_unit_id": i[org("PHONG")],
                "start_date": "2026-11-02",
                "end_date": "2026-12-31",
                "objective": "Số hóa 100% hồ sơ",
                "budget": 500000000,
            }
        },
    )["data"]["pm_project_save"]
    pid = saved["id"]
    assert saved["created"]
    members = run(
        "mutation($p: uuid!, $m: jsonb!) { pm_members_set(project_id: $p, members: $m) { members } }",
        {"p": pid, "m": [{"person_id": nv, "role": "MEMBER"}]},
    )
    assert members["data"]["pm_members_set"]["members"] == 2
    chat = conn.execute(
        """SELECT count(*) AS n FROM chat.member m JOIN pm.project j ON j.conversation_id = m.conversation_id
           WHERE j.id = %s AND m.left_at IS NULL""",
        (pid,),
    ).fetchone()
    assert chat["n"] == 2, "nhóm nhắn tin của dự án có đủ thành viên"

    save = "mutation($t: jsonb!) { pm_task_save(task: $t) { id shifted } }"
    a = run(save, {"t": {"project_id": pid, "name": "Khảo sát", "start_date": "2026-11-02", "end_date": "2026-11-06"}})
    a = a["data"]["pm_task_save"]["id"]
    b = run(
        save,
        {
            "t": {
                "project_id": pid,
                "name": "Số hóa hồ sơ",
                "start_date": "2026-11-03",
                "end_date": "2026-11-12",
                "assignee_id": nv,
                "predecessors": [{"id": a, "lag_days": 0}],
            }
        },
    )["data"]["pm_task_save"]
    assert b["shifted"] == 1, "việc sau tự dời khi chưa thỏa phụ thuộc"
    row = conn.execute("SELECT start_date, end_date FROM pm.task WHERE id = %s", (b["id"],)).fetchone()
    assert (row["start_date"], row["end_date"]) == (D(2026, 11, 7), D(2026, 11, 16))
    assert conn.execute(
        "SELECT 1 FROM collab.notification WHERE recipient_id = %s AND kind = 'PROJECT_TASK' AND title LIKE 'Việc mới%%'",
        (nv,),
    ).fetchone(), "người phụ trách nhận thông báo"

    # Dời việc trước thì việc sau dời theo
    moved = run(save, {"t": {"id": a, "end_date": "2026-11-09"}})["data"]["pm_task_save"]
    assert moved["shifted"] == 1

    # Người phụ trách chỉ cập nhật % của việc mình
    ok = run(save, {"t": {"id": b["id"], "progress": 40}}, who=nv)
    assert ok["data"]["pm_task_save"]["id"] == b["id"], ok
    denied = run(save, {"t": {"id": b["id"], "name": "đổi tên"}}, who=nv)
    assert denied["errors"][0]["extensions"]["code"] == "forbidden"
    denied = run(save, {"t": {"id": a, "progress": 100}}, who=nv)
    assert denied["errors"][0]["extensions"]["code"] == "forbidden", "không cập nhật việc của người khác"

    detail = run(Q_DETAIL, {"id": pid}, who=nv)["data"]["pm_project_detail"]
    assert detail["can_manage"] is False and detail["my_role"] == "MEMBER"
    assert [t["wbs"] for t in detail["tasks"]] == ["1", "2"] and all(t["critical"] for t in detail["tasks"])
    assert detail["stats"]["total_tasks"] == 2
    assert run(Q_DETAIL, {"id": pid}, who=outsider)["errors"][0]["extensions"]["code"] == "not-found"
    listed = run("query { pm_project { code stats can_manage } }", {}, who=nv)["data"]["pm_project"]
    assert [p["code"] for p in listed] == [code] and listed[0]["can_manage"] is False
    assert listed[0]["stats"]["total_tasks"] == 2, "số liệu tiến độ trong một computed field"
    assert run("query { pm_project { code } }", {}, who=outsider)["data"]["pm_project"] == []
    tasks_seen = run("query($p: uuid!) { pm_task(where: {project_id: {_eq: $p}}) { id } }", {"p": pid}, who=outsider)[
        "data"
    ]["pm_task"]
    assert tasks_seen == [], "người ngoài không đọc công việc qua GraphQL"

    # Vòng phụ thuộc bị chặn
    loop = run(save, {"t": {"id": a, "predecessors": [{"id": b["id"], "lag_days": 0}]}})
    assert "vòng lặp" in loop["errors"][0]["message"]

    baseline = run("mutation($p: uuid!) { pm_baseline_set(project_id: $p) { tasks } }", {"p": pid})
    assert baseline["data"]["pm_baseline_set"]["tasks"] == 2

    report = run(
        "mutation($r: jsonb!) { pm_report_create(report: $r) { id health actual_pct planned_pct } }",
        {"r": {"project_id": pid, "period_from": "2026-11-02", "period_to": "2026-11-13", "summary": "Đang số hóa"}},
    )["data"]["pm_report_create"]
    assert report["health"] in ("GREEN", "AMBER", "RED") and report["actual_pct"] is not None
    snap = conn.execute("SELECT snapshot FROM pm.report WHERE id = %s", (report["id"],)).fetchone()["snapshot"]
    assert [t["wbs"] for t in snap] == ["1", "2"], "báo cáo chụp bảng công việc lúc lập"

    gone = run("mutation($id: uuid!) { pm_task_delete(id: $id) { deleted } }", {"id": a}, who=nv)
    assert gone["errors"][0]["extensions"]["code"] == "forbidden"
    assert run("mutation($id: uuid!) { pm_task_delete(id: $id) { deleted } }", {"id": a})["data"]["pm_task_delete"] == {
        "deleted": 1
    }

    # Tắt mô-đun: Action trả module-disabled, bảng không đọc được
    conn.execute("DELETE FROM core.tenant_module WHERE tenant_id = %s AND module = 'project'", (tenant,))
    try:
        off = run(Q_DETAIL, {"id": pid})
        assert off["errors"][0]["extensions"]["code"] == "module-disabled"
        assert run("query { pm_project { code } }", {})["data"]["pm_project"] == []
    finally:
        conn.execute("INSERT INTO core.tenant_module (tenant_id, module) VALUES (%s, 'project')", (tenant,))


class _Store:
    """Kho tài liệu giả: giữ PDF trong bộ nhớ (máy thử không cần SeaweedFS)."""

    def __init__(self):
        self.docs = {}

    def document_exists(self, key):
        return key in self.docs

    def put_document(self, key, data, content_type):
        self.docs[key] = data

    def download_url(self, key, file_name, content_type):
        return f"https://kho.test/{key}?name={file_name}"


def test_van_ban_ke_hoach_va_bao_cao_pdf(conn, org, monkeypatch, database):
    import psycopg

    from app import forms
    from app.common import Context

    html_seen = []
    monkeypatch.setattr(forms, "html_to_pdf", lambda url, html, footer: html_seen.append(html) or b"%PDF-1.7")
    i = ids(conn, org("tp"), org("PHONG"), "TDX")
    session = {"x-hasura-user-id": i[org("tp")], "x-hasura-tenant-id": i["TDX"], "x-hasura-role": "user"}
    ctx = Context(storage=_Store(), gotenberg_url="http://gotenberg.test")
    with psycopg.connect(database) as c:
        pid = projects.pm_project_save(
            c,
            session,
            {
                "project": {
                    "code": f"KH-{org('y')[-6:].upper()}",
                    "name": "Kế hoạch <thử> & in",
                    "org_unit_id": i[org("PHONG")],
                    "start_date": "2026-11-02",
                    "end_date": "2027-01-31",
                    "risks": "Thiếu người\nChậm phê duyệt",
                }
            },
            ctx,
        )["id"]
        a = projects.pm_task_save(
            c,
            session,
            {"task": {"project_id": pid, "name": "Giai đoạn 1", "start_date": "2026-11-02", "end_date": "2026-11-30"}},
            ctx,
        )["id"]
        projects.pm_task_save(
            c,
            session,
            {
                "task": {
                    "project_id": pid,
                    "parent_id": a,
                    "name": "Mốc nghiệm thu",
                    "start_date": "2026-11-30",
                    "milestone": True,
                }
            },
            ctx,
        )
        plan = projects.pm_plan_pdf(c, session, {"project_id": pid}, ctx)
        rid = projects.pm_report_create(
            c,
            session,
            {"report": {"project_id": pid, "period_from": "2026-11-02", "period_to": "2026-11-15", "summary": "Ổn"}},
            ctx,
        )["id"]
        rep = projects.pm_report_pdf(c, session, {"report_id": rid}, ctx)
        again = projects.pm_plan_pdf(c, session, {"project_id": pid}, ctx)
        c.rollback()
    plan_html, report_html = html_seen[0], html_seen[1]
    assert plan["file_name"].startswith("ke-hoach-kh-") and again["cached"] is True, "nội dung không đổi thì dùng lại"
    assert "Kế hoạch &lt;thử&gt; &amp; in" in plan_html, "giá trị được escape"
    assert "Sơ đồ Gantt" in plan_html and "Các mốc chính" in plan_html and "Rủi ro và biện pháp" in plan_html
    assert "Cộng hòa" not in plan_html, "văn bản nội bộ không quốc hiệu"
    assert rep["file_name"].startswith("bao-cao-tien-do-") and "Báo cáo tiến độ dự án" in report_html
