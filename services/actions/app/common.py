import json
from dataclasses import dataclass
from typing import TYPE_CHECKING

import psycopg

from bamboo_common.flowable import FlowableClient

from .storage import Storage

if TYPE_CHECKING:
    from bamboo_common.ollama import Ollama
    from bamboo_common.pii import PiiCipher

    from .hr_account import KeycloakUsers
    from .mqtt_admin import Dynsec
    from .receipts import Signer
    from .search import Meili
    from .trino import Trino


@dataclass
class Context:
    flowable: FlowableClient | None = None
    storage: Storage | None = None
    clamav_host: str = ""
    clamav_port: int = 3310
    require_clamav: bool = False
    search: "Meili | None" = None
    search_index: str = "documents"
    gotenberg_url: str = ""
    tika_url: str = ""
    pii: "PiiCipher | None" = None
    users: "KeycloakUsers | None" = None
    lakehouse: "Trino | None" = None
    ai: "Ollama | None" = None
    channels: tuple[str, ...] = ()
    signer: "Signer | None" = None
    anchor_signer: "Signer | None" = None
    anchor_url: str = ""
    sleeper_url: str = ""
    signature_trust_dir: str = ""
    signature_online: bool = True
    actions_secret: str = ""
    mqtt: "Dynsec | None" = None


class ActionError(Exception):
    def __init__(self, message: str, code: str = "bad-request", status: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def session_identity(session: dict, tenant_id) -> str:
    person = session.get("x-hasura-user-id")
    tenant = session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    if tenant_id is None or str(tenant_id) != tenant:
        raise ActionError("Không tìm thấy chứng từ", "not-found", 404)
    return person


def bind_session(conn: psycopg.Connection, session: dict) -> None:
    conn.execute("SELECT set_config('hasura.user', %s, true)", (json.dumps(session),))


def require_read(conn: psycopg.Connection, entity_type: str, entity_id, person: str) -> None:
    if not conn.execute("SELECT wf.entity_can_read(%s, %s, %s)", (entity_type, entity_id, person)).fetchone()[0]:
        raise ActionError("Không tìm thấy chứng từ", "not-found", 404)
