# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Không gian H (ADR #65): nhắn tin cá nhân/nhóm/phòng ban và lịch công tác qua GraphQL."""

import datetime as dt

from app import work_calendar
from conftest import ids

CONV = "id kind title display_name unread last_preview"


def test_doc_thoi_gian_khong_mui_gio_la_gio_viet_nam():
    t = work_calendar.parse_time("2026-11-10T09:00", "x")
    assert t.utcoffset() == dt.timedelta(hours=7)
    assert work_calendar.parse_time("2026-11-10T02:00:00Z", "x") == t


def test_tin_rieng_chi_hai_nguoi_doc_va_gui(hasura, conn, org):
    i = ids(conn, org("nv"), org("tp"), org("gd"), "TDX")
    nv, tp, gd, tenant = i[org("nv")], i[org("tp")], i[org("gd")], i["TDX"]

    opened = hasura(
        "mutation($p: uuid!) { chat_open_direct(person_id: $p) { conversation_id created } }",
        {"p": tp},
        person=nv,
        tenant=tenant,
    )["data"]["chat_open_direct"]
    assert opened["created"] is True
    again = hasura(
        "mutation($p: uuid!) { chat_open_direct(person_id: $p) { conversation_id created } }",
        {"p": nv},
        person=tp,
        tenant=tenant,
    )["data"]["chat_open_direct"]
    assert again == {"conversation_id": opened["conversation_id"], "created": False}, "mỗi cặp một cuộc"

    conv = opened["conversation_id"]
    send = "mutation($o: chat_message_insert_input!) { insert_chat_message_one(object: $o) { id sender_id body } }"
    sent = hasura(send, {"o": {"conversation_id": conv, "body": "Anh xem giúp đề nghị"}}, person=nv, tenant=tenant)
    msg = sent["data"]["insert_chat_message_one"]
    assert msg["sender_id"] == nv, sent

    mention = hasura(
        "mutation($o: chat_message_insert_input!) { insert_chat_message_one(object: $o) { id mentions } }",
        {"o": {"conversation_id": conv, "body": "@Trưởng phòng", "mentions": f"{{{tp},{gd}}}"}},
        person=nv,
        tenant=tenant,
    )
    assert mention["data"]["insert_chat_message_one"]["mentions"] in ([tp], f"{{{tp}}}"), mention

    forged = hasura(send, {"o": {"conversation_id": conv, "body": "x", "sender_id": tp}}, person=nv, tenant=tenant)
    assert "errors" in forged, "không gửi thay người khác"
    outsider = hasura(send, {"o": {"conversation_id": conv, "body": "x"}}, person=gd, tenant=tenant)
    assert "errors" in outsider, "người ngoài cuộc không gửi được"
    peek = hasura(
        "query($c: uuid!) { chat_message(where: {conversation_id: {_eq: $c}}) { id } }",
        {"c": conv},
        person=gd,
        tenant=tenant,
    )
    assert peek["data"]["chat_message"] == [], "người ngoài cuộc không đọc được"

    mine = hasura(
        f"query($c: uuid!) {{ chat_conversation_by_pk(id: $c) {{ {CONV} }} }}", {"c": conv}, person=tp, tenant=tenant
    )["data"]["chat_conversation_by_pk"]
    assert mine["unread"] == 2 and mine["display_name"].startswith("Chuyên viên"), mine
    read = hasura(
        """mutation($c: uuid!, $p: uuid!, $id: bigint!) {
             update_chat_member_by_pk(pk_columns: {conversation_id: $c, person_id: $p}, _set: {last_read_id: $id}) {
               last_read_id } }""",
        {"c": conv, "p": tp, "id": mention["data"]["insert_chat_message_one"]["id"]},
        person=tp,
        tenant=tenant,
    )
    assert read["data"]["update_chat_member_by_pk"]["last_read_id"] > msg["id"], read
    assert (
        hasura(
            f"query($c: uuid!) {{ chat_conversation_by_pk(id: $c) {{ {CONV} }} }}",
            {"c": conv},
            person=tp,
            tenant=tenant,
        )["data"]["chat_conversation_by_pk"]["unread"]
        == 0
    )

    edit = "mutation($id: bigint!, $s: chat_message_set_input!) { update_chat_message_by_pk(pk_columns: {id: $id}, _set: $s) { body edited_at deleted_at } }"
    by_other = hasura(edit, {"id": msg["id"], "s": {"body": "sửa trộm"}}, person=tp, tenant=tenant)
    assert by_other["data"]["update_chat_message_by_pk"] is None, "không sửa tin của người khác"
    edited = hasura(edit, {"id": msg["id"], "s": {"body": "Anh xem giúp đề nghị số 12"}}, person=nv, tenant=tenant)
    assert edited["data"]["update_chat_message_by_pk"]["edited_at"], edited
    recalled = hasura(edit, {"id": msg["id"], "s": {"deleted_at": "now()"}}, person=nv, tenant=tenant)
    assert recalled["data"]["update_chat_message_by_pk"]["body"] == "", "thu hồi xóa nội dung"


def test_nhom_chu_nhom_va_kenh_phong_ban(hasura, conn, org):
    i = ids(conn, org("nv"), org("tp"), org("gd"), org("PHONG"), "TDX")
    nv, tp, gd, tenant = i[org("nv")], i[org("tp")], i[org("gd")], i["TDX"]

    group = hasura(
        'mutation($m: [uuid!]!) { chat_create_group(title: "Dự án ERP", member_ids: $m) { conversation_id } }',
        {"m": [nv]},
        person=tp,
        tenant=tenant,
    )["data"]["chat_create_group"]["conversation_id"]
    update = """mutation($c: uuid!, $a: [uuid!], $r: [uuid!]) {
                  chat_update_group(conversation_id: $c, add_ids: $a, remove_ids: $r) { added removed members } }"""
    denied = hasura(update, {"c": group, "a": [gd]}, person=nv, tenant=tenant)
    assert denied["errors"][0]["extensions"]["code"] == "forbidden", "thành viên thường không thêm người"
    added = hasura(update, {"c": group, "a": [gd]}, person=tp, tenant=tenant)["data"]["chat_update_group"]
    assert added == {"added": 1, "removed": 0, "members": 3}

    left = hasura(
        "mutation($c: uuid!) { chat_leave(conversation_id: $c) { left } }", {"c": group}, person=tp, tenant=tenant
    )
    assert left["data"]["chat_leave"]["left"] is True
    owner = conn.execute(
        "SELECT person_id::text FROM chat.member WHERE conversation_id = %s AND role = 'OWNER' AND left_at IS NULL",
        (group,),
    ).fetchone()
    assert owner["person_id"] in (nv, gd), "chủ nhóm rời thì có người khác làm chủ nhóm"

    unit = hasura(
        "query($u: uuid!) { chat_conversation(where: {org_unit_id: {_eq: $u}}) { id kind display_name } }",
        {"u": i[org("PHONG")]},
        person=nv,
        tenant=tenant,
    )["data"]["chat_conversation"]
    assert len(unit) == 1 and unit[0]["kind"] == "UNIT" and unit[0]["display_name"].startswith("Phòng"), unit
    no_leave = hasura(
        "mutation($c: uuid!) { chat_leave(conversation_id: $c) { left } }",
        {"c": unit[0]["id"]},
        person=nv,
        tenant=tenant,
    )
    assert "errors" in no_leave, "không tự rời kênh phòng ban"


def _save(hasura, event, person, tenant):
    return hasura(
        "mutation($e: jsonb!) { calendar_save(event: $e) { id created invited conflicts } }",
        {"e": event},
        person=person,
        tenant=tenant,
    )


def test_lich_moi_trung_gio_lap_va_lich_don_vi(hasura, conn, org):
    i = ids(conn, org("nv"), org("tp"), org("gd"), org("PHONG"), "TDX", "a")
    nv, tp, gd, tenant, outsider = i[org("nv")], i[org("tp")], i[org("gd")], i["TDX"], i["a"]
    day = (dt.datetime.now(work_calendar.TZ) + dt.timedelta(days=3)).replace(hour=9, minute=0, second=0, microsecond=0)

    first = _save(
        hasura,
        {
            "title": "Giao ban phòng",
            "starts_at": day.isoformat(),
            "ends_at": (day + dt.timedelta(hours=1)).isoformat(),
            "attendee_ids": [nv],
            "recurrence": "WEEKLY",
            "recur_until": (day + dt.timedelta(days=21)).date().isoformat(),
            "reminder_minutes": 15,
        },
        tp,
        tenant,
    )["data"]["calendar_save"]
    assert first["created"] and first["invited"] == 1 and first["conflicts"] == []
    invite = conn.execute(
        "SELECT title FROM collab.notification WHERE recipient_id = %s AND kind = 'CALENDAR_INVITE' AND entity_id = %s",
        (nv, first["id"]),
    ).fetchone()
    assert invite and invite["title"] == "Mời tham dự: Giao ban phòng"

    clash = _save(
        hasura,
        {
            "title": "Gặp khách",
            "starts_at": (day + dt.timedelta(days=7, minutes=30)).isoformat(),
            "ends_at": (day + dt.timedelta(days=7, hours=2)).isoformat(),
        },
        nv,
        tenant,
    )["data"]["calendar_save"]
    assert [c["title"] for c in clash["conflicts"]] == ["Giao ban phòng"], "trùng lần lặp tuần thứ hai"

    q = """query($f: String!, $t: String!, $v: String, $u: uuid) {
             calendar_events(from: $f, to: $t, view: $v, unit_id: $u) { events } }"""
    window = {"f": day.isoformat(), "t": (day + dt.timedelta(days=30)).isoformat()}
    events = hasura(q, window, person=nv, tenant=tenant)["data"]["calendar_events"]["events"]
    weekly = [e for e in events if e["id"] == first["id"]]
    assert len(weekly) == 4 and weekly[0]["my_response"] == "PENDING" and weekly[0]["can_edit"] is False
    assert hasura(q, window, person=outsider, tenant=tenant)["data"]["calendar_events"]["events"] == []

    responded = hasura(
        'mutation($id: uuid!) { calendar_respond(id: $id, response: "DECLINED") { response } }',
        {"id": first["id"]},
        person=nv,
        tenant=tenant,
    )
    assert responded["data"]["calendar_respond"]["response"] == "DECLINED"
    mine = hasura(q, {**window, "v": "mine"}, person=nv, tenant=tenant)["data"]["calendar_events"]["events"]
    assert {e["title"] for e in mine} == {"Gặp khách"}, "đã từ chối thì không hiện ở lịch của tôi"

    unit_event = {
        "title": "Lịch công tác tuần của phòng",
        "starts_at": (day + dt.timedelta(days=1)).isoformat(),
        "ends_at": (day + dt.timedelta(days=1, hours=8)).isoformat(),
        "scope": "UNIT",
        "org_unit_id": i[org("PHONG")],
    }
    denied = _save(hasura, unit_event, nv, tenant)
    assert denied["errors"][0]["extensions"]["code"] == "forbidden", "chuyên viên không đặt lịch đơn vị"
    by_head = _save(hasura, unit_event, gd, tenant)["data"]["calendar_save"]
    seen = hasura(q, {**window, "v": "unit", "u": i[org("PHONG")]}, person=nv, tenant=tenant)
    assert [e["id"] for e in seen["data"]["calendar_events"]["events"]] == [by_head["id"]], (
        "giám đốc công ty đặt lịch cho phòng con, người trong phòng thấy"
    )

    moved = _save(
        hasura,
        {
            **{k: v for k, v in unit_event.items()},
            "id": first["id"],
            "title": "Giao ban phòng",
            "scope": "PERSONAL",
            "org_unit_id": None,
            "attendee_ids": [nv],
            "starts_at": (day + dt.timedelta(hours=2)).isoformat(),
            "ends_at": (day + dt.timedelta(hours=3)).isoformat(),
        },
        tp,
        tenant,
    )["data"]["calendar_save"]
    assert moved["created"] is False
    after = conn.execute("SELECT response FROM cal.attendee WHERE event_id = %s", (first["id"],)).fetchone()
    assert after["response"] == "PENDING", "đổi giờ thì người được mời trả lời lại"

    cancelled = hasura(
        "mutation($id: uuid!) { calendar_cancel(id: $id) { cancelled notified } }",
        {"id": first["id"]},
        person=nv,
        tenant=tenant,
    )
    assert cancelled["errors"][0]["extensions"]["code"] == "forbidden", "người được mời không hủy được"
    ok = hasura(
        "mutation($id: uuid!) { calendar_cancel(id: $id) { cancelled notified } }",
        {"id": first["id"]},
        person=tp,
        tenant=tenant,
    )["data"]["calendar_cancel"]
    assert ok == {"cancelled": True, "notified": 1}
