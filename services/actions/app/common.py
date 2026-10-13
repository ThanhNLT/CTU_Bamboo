# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Phần dùng chung của các Hasura Action: lỗi trả về giao diện, người gọi từ phiên Hasura."""

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING

import psycopg

from .flowable import FlowableClient
from .storage import Storage

if TYPE_CHECKING:
    from .hr_account import KeycloakUsers
    from .pii import PiiCipher
    from .search import Meili
    from .trino import Trino


@dataclass
class Context:
    """Dịch vụ ngoài mà Action cần (khởi tạo một lần trong create_app)."""
    flowable: FlowableClient | None = None
    storage: Storage | None = None
    clamav_host: str = ""
    clamav_port: int = 3310
    search: "Meili | None" = None       # khóa chỉ được tìm (ADR #36)
    search_index: str = "documents"
    gotenberg_url: str = ""           # in phiếu PDF (ADR #37)
    pii: "PiiCipher | None" = None    # mã hóa dữ liệu cá nhân nhạy cảm (ADR #41)
    users: "KeycloakUsers | None" = None  # tạo tài khoản đăng nhập khi quản trị thêm người (ADR #44)
    lakehouse: "Trino | None" = None  # truy vấn tầng silver qua Trino (ADR #45)


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
