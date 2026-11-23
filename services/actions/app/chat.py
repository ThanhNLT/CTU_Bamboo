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

"""Nhắn tin cá nhân, nhóm và kênh phòng ban (ADR #65).

Đọc tin và gửi tin đi thẳng qua GraphQL (Hasura) để nhanh: trình duyệt giữ một subscription luồng tin (`chat_message_stream`)
cho cuộc đang mở và một subscription danh sách cuộc kèm số tin chưa đọc. Quyền đọc/gửi kiểm ở hai lớp: quyền Hasura (thành
viên cuộc trò chuyện) và trigger CSDL (`chat.message_before_write`). Các thao tác đổi thành viên đi qua Action ở đây:

- `chat_open_direct`: mở (hoặc tạo) cuộc hai người với một đồng nghiệp cùng công ty;
- `chat_create_group`, `chat_update_group`: nhóm tự lập, người tạo là chủ nhóm, chủ nhóm đổi tên, thêm/bớt người;
- `chat_leave`: rời nhóm (kênh đơn vị do hệ thống đồng bộ theo phân công, không tự rời được, chỉ tắt thông báo).
"""

import uuid

import psycopg
from psycopg.rows import dict_row

from .common import ActionError, Context, bind_session, session_identity

MAX_GROUP = 200


def _who(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    return person, tenant


def _uuid(value, label: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except ValueError as exc:
        raise ActionError(f"Mã {label} không hợp lệ") from exc


def _people(conn: psycopg.Connection, tenant: str, ids) -> list[str]:
    wanted = list(dict.fromkeys(_uuid(i, "người") for i in ids or []))
    if not wanted:
        return []
    found = {
        str(r[0])
        for r in conn.execute(
            "SELECT id FROM core.person WHERE tenant_id = %s AND id = ANY(%s::uuid[])", (tenant, wanted)
        )
    }
    if missing := [i for i in wanted if i not in found]:
        raise ActionError(f"Không tìm thấy {len(missing)} người trong công ty", "not-found", 404)
    return wanted


def _title(value) -> str:
    title = " ".join(str(value or "").split())
    if not 1 <= len(title) <= 120:
        raise ActionError("Tên nhóm dài 1–120 ký tự")
    return title


def _conversation(conn: psycopg.Connection, tenant: str, conversation_id, lock: bool = False) -> dict:
    row = (
        conn.cursor(row_factory=dict_row)
        .execute(
            f"SELECT * FROM chat.conversation WHERE id = %s AND tenant_id = %s{' FOR UPDATE' if lock else ''}",
            (_uuid(conversation_id, "cuộc trò chuyện"), tenant),
        )
        .fetchone()
    )
    if not row:
        raise ActionError("Không tìm thấy cuộc trò chuyện", "not-found", 404)
    return row


def _member_role(conn: psycopg.Connection, conversation_id, person: str) -> str | None:
    row = conn.execute(
        "SELECT role FROM chat.member WHERE conversation_id = %s AND person_id = %s AND left_at IS NULL",
        (conversation_id, person),
    ).fetchone()
    return row[0] if row else None


def _join(conn: psycopg.Connection, tenant: str, conversation_id, people: list[str], role: str = "MEMBER") -> int:
    if not people:
        return 0
    cur = conn.execute(
        """INSERT INTO chat.member (tenant_id, conversation_id, person_id, role)
           SELECT %s, %s, unnest(%s::uuid[]), %s
           ON CONFLICT (conversation_id, person_id) DO UPDATE SET left_at = NULL, joined_at = now(), role = EXCLUDED.role
               WHERE chat.member.left_at IS NOT NULL""",
        (tenant, conversation_id, people, role),
    )
    return cur.rowcount


def direct_key(a: str, b: str) -> str:
    return ":".join(sorted((str(a), str(b))))


def chat_open_direct(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    [other] = _people(conn, tenant, [args.get("person_id")])
    if other == person:
        raise ActionError("Không nhắn tin cho chính mình")
    key = direct_key(person, other)
    row = conn.execute(
        """INSERT INTO chat.conversation (tenant_id, kind, direct_key, created_by) VALUES (%s, 'DIRECT', %s, %s)
           ON CONFLICT (tenant_id, direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
           RETURNING id, (xmax = 0) AS created""",
        (tenant, key, person),
    ).fetchone()
    _join(conn, tenant, row[0], [person, other])
    return {"conversation_id": str(row[0]), "created": bool(row[1])}


def chat_create_group(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    title = _title(args.get("title"))
    people = [p for p in _people(conn, tenant, args.get("member_ids")) if p != person]
    if not people:
        raise ActionError("Nhóm cần ít nhất một người khác ngoài bạn")
    if len(people) + 1 > MAX_GROUP:
        raise ActionError(f"Nhóm tối đa {MAX_GROUP} người")
    conv = conn.execute(
        "INSERT INTO chat.conversation (tenant_id, kind, title, created_by) VALUES (%s, 'GROUP', %s, %s) RETURNING id",
        (tenant, title, person),
    ).fetchone()[0]
    _join(conn, tenant, conv, [person], "OWNER")
    _join(conn, tenant, conv, people)
    return {"conversation_id": str(conv), "created": True}


def chat_update_group(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    conv = _conversation(conn, tenant, args.get("conversation_id"), lock=True)
    if conv["kind"] != "GROUP":
        raise ActionError("Chỉ đổi được thành viên, tên của nhóm tự lập")
    if _member_role(conn, conv["id"], person) != "OWNER":
        raise ActionError("Chỉ chủ nhóm đổi được tên và thành viên", "forbidden", 403)
    if args.get("title") is not None:
        conn.execute("UPDATE chat.conversation SET title = %s WHERE id = %s", (_title(args["title"]), conv["id"]))
    added = _join(conn, tenant, conv["id"], _people(conn, tenant, args.get("add_ids")))
    remove = [p for p in _people(conn, tenant, args.get("remove_ids")) if p != person]
    removed = (
        conn.execute(
            """UPDATE chat.member SET left_at = now()
               WHERE conversation_id = %s AND person_id = ANY(%s::uuid[]) AND left_at IS NULL""",
            (conv["id"], remove),
        ).rowcount
        if remove
        else 0
    )
    count = conn.execute(
        "SELECT count(*) FROM chat.member WHERE conversation_id = %s AND left_at IS NULL", (conv["id"],)
    ).fetchone()[0]
    if count > MAX_GROUP:
        raise ActionError(f"Nhóm tối đa {MAX_GROUP} người")
    return {"conversation_id": str(conv["id"]), "added": added, "removed": removed, "members": count}


def chat_leave(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    conv = _conversation(conn, tenant, args.get("conversation_id"), lock=True)
    if conv["kind"] == "UNIT":
        raise ActionError("Kênh đơn vị theo phân công công tác, không tự rời được; có thể tắt thông báo")
    role = _member_role(conn, conv["id"], person)
    if role is None:
        raise ActionError("Bạn không ở trong cuộc trò chuyện này", "not-found", 404)
    conn.execute(
        "UPDATE chat.member SET left_at = now() WHERE conversation_id = %s AND person_id = %s", (conv["id"], person)
    )
    if role == "OWNER":
        conn.execute(
            """UPDATE chat.member SET role = 'OWNER'
               WHERE (conversation_id, person_id) = (
                   SELECT conversation_id, person_id FROM chat.member
                   WHERE conversation_id = %s AND left_at IS NULL ORDER BY joined_at, person_id LIMIT 1)""",
            (conv["id"],),
        )
    return {"conversation_id": str(conv["id"]), "left": True}


HANDLERS = {
    "chat_open_direct": chat_open_direct,
    "chat_create_group": chat_create_group,
    "chat_update_group": chat_update_group,
    "chat_leave": chat_leave,
}
