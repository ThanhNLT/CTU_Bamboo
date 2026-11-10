# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Biểu đồ BI đã lưu (ADR #63): của mình thì sửa, xóa được; chia sẻ thì người cùng công ty chỉ xem."""

from conftest import ids

CHART = "id name chart_type spec shared is_mine"
SPEC = {"source": "proc_purchase_request", "metrics": ["request_count"], "dimensions": ["status"]}


def test_bieu_do_rieng_chia_se_va_quyen_sua(hasura, conn):
    i = ids(conn, "TDX", "BVX", "c", "a")
    me, other, tenant = i["c"], i["a"], i["TDX"]
    created = hasura(
        f"mutation($o: kpi_chart_insert_input!) {{ insert_kpi_chart_one(object: $o) {{ {CHART} person_id }} }}",
        {"o": {"name": "Đề nghị theo trạng thái", "chart_type": "bar", "spec": SPEC}},
        person=me,
        tenant=tenant,
    )
    chart = created["data"]["insert_kpi_chart_one"]
    assert chart["is_mine"] and chart["person_id"] == me and not chart["shared"], created

    by_pk = f"query($id: uuid!) {{ kpi_chart_by_pk(id: $id) {{ {CHART} }} }}"
    assert hasura(by_pk, {"id": chart["id"]}, person=other, tenant=tenant)["data"]["kpi_chart_by_pk"] is None

    shared = hasura(
        "mutation($id: uuid!) { update_kpi_chart_by_pk(pk_columns: {id: $id}, _set: {shared: true}) { id shared } }",
        {"id": chart["id"]},
        person=me,
        tenant=tenant,
    )
    assert shared["data"]["update_kpi_chart_by_pk"]["shared"] is True, shared
    seen = hasura(by_pk, {"id": chart["id"]}, person=other, tenant=tenant)["data"]["kpi_chart_by_pk"]
    assert seen["name"] == "Đề nghị theo trạng thái" and seen["is_mine"] is False

    renamed = hasura(
        'mutation($id: uuid!) { update_kpi_chart_by_pk(pk_columns: {id: $id}, _set: {name: "x"}) { id } }',
        {"id": chart["id"]},
        person=other,
        tenant=tenant,
    )
    assert renamed["data"]["update_kpi_chart_by_pk"] is None, "người được chia sẻ không sửa được"
    gone = hasura(
        "mutation($id: uuid!) { delete_kpi_chart_by_pk(id: $id) { id } }",
        {"id": chart["id"]},
        person=other,
        tenant=tenant,
    )
    assert gone["data"]["delete_kpi_chart_by_pk"] is None, "người được chia sẻ không xóa được"

    stolen = hasura(
        "mutation($o: kpi_chart_insert_input!) { insert_kpi_chart_one(object: $o) { id } }",
        {"o": {"name": "x", "chart_type": "bar", "spec": SPEC, "person_id": other}},
        person=me,
        tenant=tenant,
    )
    assert "errors" in stolen, "không tạo biểu đồ đứng tên người khác"

    assert hasura(by_pk, {"id": chart["id"]}, person=me, tenant=i["BVX"])["data"]["kpi_chart_by_pk"] is None, (
        "công ty khác không thấy dù đã chia sẻ"
    )
    deleted = hasura(
        "mutation($id: uuid!) { delete_kpi_chart_by_pk(id: $id) { id } }", {"id": chart["id"]}, person=me, tenant=tenant
    )
    assert deleted["data"]["delete_kpi_chart_by_pk"]["id"] == chart["id"]
