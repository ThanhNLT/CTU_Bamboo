"""Tín hiệu thay đổi thời gian thực và hiện diện (ADR #64)."""

import uuid

from conftest import ids

LATEST = (
    """query($t: [String!]) { live_event(where: {topic: {_in: $t}}, order_by: {id: desc}, limit: 1) { id topic } }"""
)


def test_ghi_bang_theo_doi_sinh_tin_hieu_theo_cong_ty(conn):
    i = ids(conn, "TDX", "BVX")
    before = conn.execute("SELECT coalesce(max(id), 0) AS m FROM live.event").fetchone()["m"]
    conn.execute("UPDATE core.org_unit SET name = name WHERE tenant_id IN (%s, %s)", (i["TDX"], i["BVX"]))
    rows = conn.execute("SELECT tenant_id::text, topic FROM live.event WHERE id > %s ORDER BY id", (before,)).fetchall()
    touched = {
        str(r["tenant_id"])
        for r in conn.execute(
            "SELECT DISTINCT tenant_id FROM core.org_unit WHERE tenant_id IN (%s, %s)", (i["TDX"], i["BVX"])
        )
    }
    assert i["TDX"] in touched
    assert {(r["tenant_id"], r["topic"]) for r in rows} == {(t, "org") for t in touched}
    assert len(rows) == len(touched), "một câu lệnh sửa nhiều dòng chỉ sinh một tín hiệu cho mỗi công ty"
    assert not conn.execute(
        "SELECT 1 FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND schemaname IN ('live', 'api')"
    ).fetchone(), "tín hiệu và khóa API không đi vào CDC"


def test_hasura_tin_hieu_va_hien_dien_theo_cong_ty(hasura, conn):
    i = ids(conn, "TDX", "BVX", "c", "a")
    conn.execute("UPDATE core.org_unit SET name = name WHERE tenant_id = %s", (i["TDX"],))
    mine = hasura(LATEST, {"t": ["org"]}, person=i["c"], tenant=i["TDX"])["data"]["live_event"]
    assert mine and mine[0]["topic"] == "org"
    latest = conn.execute(
        "SELECT max(id) AS m FROM live.event WHERE tenant_id = %s AND topic = 'org'", (i["TDX"],)
    ).fetchone()["m"]
    assert mine[0]["id"] == latest, "chỉ thấy tín hiệu của công ty trong phiên"

    device = uuid.uuid4().hex
    beat = """mutation($d: String!, $p: String!) {
      insert_live_presence_one(object: {device: $d, path: $p},
        on_conflict: {constraint: presence_pkey, update_columns: [path]}) { device } }"""
    for path in ("/d/ops", "/i/bi"):
        r = hasura(beat, {"d": device, "p": path}, person=i["c"], tenant=i["TDX"])
        assert "errors" not in r, r
    row = conn.execute("SELECT * FROM live.presence WHERE device = %s", (device,)).fetchone()
    assert str(row["person_id"]) == i["c"] and row["path"] == "/i/bi"

    online = "query { live_v_online { person_id full_name path } }"
    seen = hasura(online, person=i["a"], tenant=i["TDX"])["data"]["live_v_online"]
    assert any(p["person_id"] == i["c"] and p["path"] == "/i/bi" for p in seen), (
        "đồng nghiệp thấy người đang trực tuyến"
    )
    other = hasura(online, person=i["a"], tenant=i["BVX"])["data"]["live_v_online"]
    assert all(p["person_id"] != i["c"] for p in other), "công ty khác không thấy"

    bad = hasura(beat, {"d": device, "p": "/x?token=1"}, person=i["c"], tenant=i["TDX"])
    assert "errors" in bad, "không lưu chuỗi truy vấn của đường dẫn"
    conn.execute("DELETE FROM live.presence WHERE device = %s", (device,))
