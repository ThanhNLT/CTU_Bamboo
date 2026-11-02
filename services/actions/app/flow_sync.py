# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import json
import logging
import os
import time

import psycopg
from psycopg.rows import dict_row

from bamboo_common.flowable import FlowableClient
from bamboo_common.pii import PiiCipher

from . import anchoring, attachments, config, delivery, hr_account, obs, process_automation
from .keycloak_sync import PROVISIONER_ID

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


def reconcile(
    conn: psycopg.Connection,
    flowable: FlowableClient,
    entity_type: str,
    entity_id,
    round_no: int,
    process_id: str | None,
) -> tuple[str | None, bool]:
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
            process_id = flowable.start_process(
                PROCESS_KEY,
                business_key(entity_id, round_no),
                {
                    "entityType": entity_type,
                    "entityId": str(entity_id),
                    "round": round_no,
                    "stepCount": len(steps),
                    "stepIndex": 0,
                    "positions": json.dumps([str(s["position_id"]) for s in steps]),
                },
            )

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
            flowable.complete(
                task["id"],
                {
                    "decision": "APPROVE",
                    "stepIndex": index + 1,
                    "actedBy": str(step["acted_by"]),
                    "onBehalfOf": str(step["on_behalf_of"]) if step["on_behalf_of"] else "",
                    "note": step["note"] or "",
                },
            )
        elif status in ("REJECTED", "RETURNED"):
            flowable.complete(
                task["id"],
                {
                    "decision": "REJECT" if status == "REJECTED" else "RETURN",
                    "actedBy": str(step["acted_by"]),
                    "onBehalfOf": str(step["on_behalf_of"]) if step["on_behalf_of"] else "",
                    "note": step["note"] or "",
                },
            )
        elif status == "CANCELLED":
            flowable.delete_process(process_id, "Chứng từ bị hủy trong CSDL")
            return process_id, True
        elif status == "ACTIVE":
            desired = str(step["open_assignee_id"]) if step["open_assignee_id"] else None
            if task.get("assignee") != desired:
                flowable.set_assignee(task["id"], desired)
            return process_id, False
        else:
            return process_id, False
    return process_id, not flowable.process_running(process_id)


def run_once(conn: psycopg.Connection, flowable: FlowableClient, limit: int = 50) -> int:
    rows = conn.execute(
        """SELECT entity_type, entity_id, round, process_instance_id, updated_at
           FROM wf.flow_sync WHERE dirty AND attempts < %s
           ORDER BY updated_at LIMIT %s""",
        (MAX_ATTEMPTS, limit),
    ).fetchall()
    conn.commit()
    done = 0
    for row in rows:
        key = (row["entity_type"], row["entity_id"], row["round"])
        try:
            process_id, finished = reconcile(conn, flowable, *key, row["process_instance_id"])
            conn.rollback()
            conn.execute(
                """UPDATE wf.flow_sync
                   SET process_instance_id = %s, finished = %s, attempts = 0, last_error = NULL,
                       synced_at = now(), dirty = (updated_at <> %s)
                   WHERE entity_type = %s AND entity_id = %s AND round = %s""",
                (process_id, finished, row["updated_at"], *key),
            )
            conn.commit()
            done += 1
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("flow-sync %s lỗi: %s", key, exc)
            conn.execute(
                """UPDATE wf.flow_sync SET attempts = attempts + 1, last_error = %s
                   WHERE entity_type = %s AND entity_id = %s AND round = %s""",
                (str(exc)[:1000], *key),
            )
            conn.commit()
    return done


def _account_service(settings: config.Settings):
    addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
    if not settings.keycloak_provisioner_secret or not addr or not approle:
        log.warning("chưa cấu hình client %s hoặc OpenBao: không tạo tài khoản nhân viên mới", PROVISIONER_ID)
        return None
    users = hr_account.KeycloakUsers(settings.keycloak_url, PROVISIONER_ID, settings.keycloak_provisioner_secret)
    return users, PiiCipher(addr, approle)


def run_forever(settings: config.Settings, idle_seconds: float = 30.0, refresh_seconds: float = 60.0) -> None:
    flowable = FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password)
    listen = psycopg.connect(settings.database_url, autocommit=True)
    listen.execute("LISTEN wf_flow_sync")
    listen.execute("LISTEN hr_account")
    work = psycopg.connect(settings.database_url, row_factory=dict_row)
    accounts = _account_service(settings)
    account_conn = psycopg.connect(settings.database_url) if accounts else None
    last_refresh = 0.0
    otp_checked: set[str] = set()
    log.info("flow-sync đang chạy")
    process_automation.start_background(settings)
    attachments.start_rescan(settings)
    delivery.start_background(settings)
    anchoring.start_background(settings)
    if settings.obs_enabled:
        obs.install("flow-sync", settings.database_url)
        obs.purge_forever(settings.database_url)
    while True:
        if time.monotonic() - last_refresh >= refresh_seconds:
            work.execute("SELECT wf.refresh_all()")
            work.execute("SELECT kpi.refresh()")
            work.execute("SELECT kpi.freeze()")
            work.commit()
            last_refresh = time.monotonic()
        while run_once(work, flowable):
            pass
        if accounts:
            try:
                hr_account.run_once(account_conn, *accounts)
            except Exception as exc:  # noqa: BLE001
                account_conn.rollback()
                log.warning("tạo tài khoản nhân viên lỗi: %s", exc)
            try:
                hr_account.enforce_admin_otp(account_conn, accounts[0], otp_checked)
            except Exception as exc:  # noqa: BLE001
                account_conn.rollback()
                log.warning("kiểm đăng nhập hai lớp của quản trị viên lỗi: %s", exc)
        for _ in listen.notifies(timeout=idle_seconds, stop_after=1):
            pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    run_forever(config.load())
