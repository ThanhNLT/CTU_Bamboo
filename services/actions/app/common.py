# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Phần dùng chung của các Hasura Action: lỗi trả về giao diện, người gọi từ phiên Hasura."""

import json
from dataclasses import dataclass

import psycopg

from .flowable import FlowableClient
from .storage import Storage


@dataclass
class Context:
    """Dịch vụ ngoài mà Action cần (khởi tạo một lần trong create_app)."""
    flowable: FlowableClient | None = None
    storage: Storage | None = None
    clamav_host: str = ""
    clamav_port: int = 3310


class ActionError(Exception):
    def __init__(self, message: str, code: str = "bad-request", status: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def session_identity(session: dict, tenant_id) -> str:
    """Trả về person.id của người gọi; chặn khi chứng từ thuộc tenant khác phiên."""
    person = session.get("x-hasura-user-id")
    tenant = session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    if tenant_id is None or str(tenant_id) != tenant:
        raise ActionError("Không tìm thấy chứng từ", "not-found", 404)
    return person


def bind_session(conn: psycopg.Connection, session: dict) -> None:
    # Cùng biến Hasura đặt cho mutation, để trigger và nhật ký biết người gọi.
    conn.execute("SELECT set_config('hasura.user', %s, true)", (json.dumps(session),))


def require_read(conn: psycopg.Connection, entity_type: str, entity_id, person: str) -> None:
    if not conn.execute("SELECT wf.entity_can_read(%s, %s, %s)", (entity_type, entity_id, person)).fetchone()[0]:
        raise ActionError("Không tìm thấy chứng từ", "not-found", 404)
