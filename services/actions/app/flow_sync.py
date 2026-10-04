# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Đối chiếu luồng duyệt CSDL → Flowable (ADR #31).

CSDL là nguồn sự thật. Mỗi lần gửi duyệt (entity, round) có một tiến trình
`purchaseRequestApproval`; mỗi vòng user task ứng với một bước của chuỗi duyệt.
Đối chiếu theo trạng thái nên chạy lại bao nhiêu lần cũng cho cùng kết quả:

    bước hiện tại trong Flowable = biến stepIndex
    bước đó trong CSDL
      APPROVED            → hoàn thành task (APPROVE, stepIndex + 1), xét tiếp
      REJECTED / RETURNED → hoàn thành task với quyết định đó (tiến trình kết thúc)
      CANCELLED           → xóa tiến trình
      ACTIVE              → đặt người nhận theo việc duyệt đang mở, dừng
"""

import json
import logging
import time

import psycopg
from psycopg.rows import dict_row

from . import config
from .flowable import FlowableClient

PROCESS_KEY = "purchaseRequestApproval"
MAX_ATTEMPTS = 20
log = logging.getLogger("flow_sync")


def business_key(entity_id, round_no) -> str:
    return f"{entity_id}:{round_no}"


def _steps(conn: psycopg.Connection, entity_type: str, entity_id, round_no: int) -> list[dict]:
    return conn.execute(
        """SELECT step_order, step_status, position_id, acted_by, on_behalf_of, note, open_assignee_id
           FROM wf.v_flow_state WHERE entity_type = %s AND entity_id = %s AND round = %s
           ORDER BY step_order""",
        (entity_type, entity_id, round_no),
    ).fetchall()


def reconcile(conn: psycopg.Connection, flowable: FlowableClient, entity_type: str, entity_id, round_no: int,
              process_id: str | None) -> tuple[str | None, bool]:
    """Đưa tiến trình Flowable về đúng trạng thái CSDL. Trả về (process_id, đã kết thúc)."""
    steps = _steps(conn, entity_type, entity_id, round_no)
    if not steps:
        return process_id, True

    if process_id is None:
        existing = flowable.find_process(PROCESS_KEY, business_key(entity_id, round_no))
        if existing:
            process_id = existing["id"]
        elif steps[0]["step_status"] == "CANCELLED":
            return None, True
        else:
            process_id = flowable.start_process(PROCESS_KEY, business_key(entity_id, round_no), {
                "entityType": entity_type,
                "entityId": str(entity_id),
                "round": round_no,
                "stepCount": len(steps),
                "stepIndex": 0,
                "positions": json.dumps([str(s["position_id"]) for s in steps]),
            })

    for _ in range(len(steps) + 1):
        if not flowable.process_running(process_id):
            return process_id, True
        tasks = flowable.tasks(process_id)
        if not tasks:
            return process_id, False
        task = tasks[0]
        index = int(flowable.variable(process_id, "stepIndex"))
        step = steps[index]
        status = step["step_status"]
        if status == "APPROVED":
            flowable.complete(task["id"], {
                "decision": "APPROVE",
                "stepIndex": index + 1,
                "actedBy": str(step["acted_by"]),
                "onBehalfOf": str(step["on_behalf_of"]) if step["on_behalf_of"] else "",
                "note": step["note"] or "",
            })
        elif status in ("REJECTED", "RETURNED"):
            flowable.complete(task["id"], {
                "decision": "REJECT" if status == "REJECTED" else "RETURN",
                "actedBy": str(step["acted_by"]),
                "onBehalfOf": str(step["on_behalf_of"]) if step["on_behalf_of"] else "",
                "note": step["note"] or "",
            })
        elif status == "CANCELLED":
            flowable.delete_process(process_id, "Chứng từ bị hủy trong CSDL")
            return process_id, True
        elif status == "ACTIVE":
            desired = str(step["open_assignee_id"]) if step["open_assignee_id"] else None
            if task.get("assignee") != desired:
                flowable.set_assignee(task["id"], desired)
            return process_id, False
        else:  # WAITING: CSDL chưa tới bước này
            return process_id, False
    return process_id, not flowable.process_running(process_id)


def run_once(conn: psycopg.Connection, flowable: FlowableClient, limit: int = 50) -> int:
    """Đối chiếu các lần gửi duyệt đang được đánh dấu. Trả về số dòng đã xử lý."""
    rows = conn.execute(
        """SELECT entity_type, entity_id, round, process_instance_id, updated_at
           FROM wf.flow_sync WHERE dirty AND attempts < %s
           ORDER BY updated_at LIMIT %s""",
        (MAX_ATTEMPTS, limit),
    ).fetchall()
    conn.commit()
    for row in rows:
        key = (row["entity_type"], row["entity_id"], row["round"])
        try:
            process_id, finished = reconcile(conn, flowable, *key, row["process_instance_id"])
            conn.rollback()
            # Chỉ xóa cờ khi không có thay đổi mới trong lúc đối chiếu.
            conn.execute(
                """UPDATE wf.flow_sync
                   SET process_instance_id = %s, finished = %s, attempts = 0, last_error = NULL,
                       synced_at = now(), dirty = (updated_at <> %s)
                   WHERE entity_type = %s AND entity_id = %s AND round = %s""",
                (process_id, finished, row["updated_at"], *key),
            )
            conn.commit()
        except Exception as exc:  # noqa: BLE001 - ghi lỗi, thử lại ở lần sau
            conn.rollback()
            log.warning("flow-sync %s lỗi: %s", key, exc)
            conn.execute(
                """UPDATE wf.flow_sync SET attempts = attempts + 1, last_error = %s
                   WHERE entity_type = %s AND entity_id = %s AND round = %s""",
                (str(exc)[:1000], *key),
            )
            conn.commit()
    return len(rows)


def run_forever(settings: config.Settings, idle_seconds: float = 30.0, refresh_seconds: float = 60.0) -> None:
    """Nghe kênh wf_flow_sync; định kỳ chạy wf.refresh_all() cho bổ nhiệm hết hạn theo lịch."""
    flowable = FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password)
    listen = psycopg.connect(settings.database_url, autocommit=True)
    listen.execute("LISTEN wf_flow_sync")
    work = psycopg.connect(settings.database_url, row_factory=dict_row)
    last_refresh = 0.0
    log.info("flow-sync đang chạy")
    while True:
        if time.monotonic() - last_refresh >= refresh_seconds:
            work.execute("SELECT wf.refresh_all()")
            work.commit()
            last_refresh = time.monotonic()
        while run_once(work, flowable):
            pass
        for _ in listen.notifies(timeout=idle_seconds, stop_after=1):
            pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    run_forever(config.load())
