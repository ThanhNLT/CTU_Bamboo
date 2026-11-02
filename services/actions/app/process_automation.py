# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Chạy tự động quy trình đã phát hành.

Người thiết kế bật chạy tự động cho một phiên bản đã phát hành: sơ đồ được chuyển thành định nghĩa Flowable chỉ gồm
sự kiện, cổng rẽ nhánh, hẹn giờ và tác vụ tự động. Tác vụ tự động là tác vụ ngoài (external worker): Flowable giữ
trạng thái, dịch vụ này nhận việc, thực hiện trong CSDL (gửi thông báo) rồi báo hoàn thành. Quy trình bắt đầu theo hẹn
giờ do chính Flowable kích hoạt, hoặc do người có quyền khởi chạy tay.
"""

import hashlib
import json
import logging
import re
import secrets
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET

import psycopg
from psycopg.rows import dict_row

from . import config, delivery
from .common import ActionError, Context
from .flowable import FlowableClient
from .process_design import (
    AUTOMATION_ACTIONS,
    BAMBOO,
    BPMN,
    FLOWABLE,
    NODES,
    _access,
    _label,
    _latest,
    _local,
    _model,
    _need_design,
    _steps,
    _who,
    action_params,
    lint,
    strip_listeners,
    unsafe_expression,
    with_process_id,
)

log = logging.getLogger("process-automation")

EVENTS = {
    "purchase_request.pending": "Đề nghị mua sắm được gửi duyệt",
    "purchase_request.approved": "Đề nghị mua sắm được duyệt xong",
    "purchase_request.rejected": "Đề nghị mua sắm bị từ chối",
    "onboarding.pending": "Hồ sơ tiếp nhận nhân sự được gửi duyệt",
    "onboarding.approved": "Hồ sơ tiếp nhận nhân sự được duyệt",
    "onboarding.rejected": "Hồ sơ tiếp nhận nhân sự bị từ chối",
    "ic_order.confirmed": "Đơn hàng nội bộ được xác nhận",
    "ic_order.settled": "Đơn hàng nội bộ được đối trừ công nợ",
    "personnel_decision.issued": "Quyết định nhân sự được ban hành",
}
MAX_ACTIVE_PER_TENANT = 20
MIN_TIMER_SECONDS = 60
TOPIC_PREFIX = "bamboo."
ALLOWED_NODES = {
    "startEvent",
    "endEvent",
    "intermediateCatchEvent",
    "exclusiveGateway",
    "parallelGateway",
    "inclusiveGateway",
    "serviceTask",
}
VARIABLE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")
CYCLE = re.compile(
    r"^R(\d*)/P(?!$)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$"
)
DURATION_PARTS = (365 * 86400, 30 * 86400, 7 * 86400, 86400, 3600, 60, 1)
FLOWABLE_ATTRS = ("class", "delegateExpression", "expression", "type", "resultVariableName", "async", "exclusive")


def cycle_seconds(text: str) -> int | None:
    """Độ dài một chu kỳ của biểu thức lặp ISO-8601 (R/PT1H, R5/P1D); None nếu sai cú pháp."""
    m = CYCLE.match((text or "").strip())
    if not m:
        return None
    return sum(int(v or 0) * unit for v, unit in zip(m.groups()[1:], DURATION_PARTS, strict=True))


def _timer_problem(el: ET.Element, label: str) -> str | None:
    definitions = [c for c in el if _local(c.tag).endswith("EventDefinition")]
    if not definitions:
        return None
    if len(definitions) > 1 or _local(definitions[0].tag) != "timerEventDefinition":
        return f"“{label}” chỉ hỗ trợ hẹn giờ (không dùng tin nhắn, tín hiệu, lỗi...)"
    cycle = definitions[0].find(f"{{{BPMN}}}timeCycle")
    duration = definitions[0].find(f"{{{BPMN}}}timeDuration")
    if cycle is not None:
        seconds = cycle_seconds(cycle.text or "")
        if seconds is None:
            return f"Chu kỳ hẹn giờ của “{label}” phải dạng ISO-8601 như R/PT1H hoặc R5/P1D"
        if seconds < MIN_TIMER_SECONDS:
            return f"Chu kỳ hẹn giờ của “{label}” tối thiểu {MIN_TIMER_SECONDS} giây"
        return None
    if duration is not None and _local(el.tag) == "intermediateCatchEvent":
        if unsafe_expression(duration.text) or not re.match(r"^P(?!$)[\dYMWDTHS]+$", (duration.text or "").strip()):
            return f"Thời gian chờ của “{label}” phải dạng ISO-8601 như PT30M"
        return None
    return f"Hẹn giờ của “{label}” cần chu kỳ lặp (timeCycle) hoặc thời gian chờ (timeDuration)"


def automation_xml(xml: str, process_id: str) -> tuple[str, dict[str, dict], list[str]]:
    """Chuyển bản đã phát hành thành định nghĩa chạy tự động.

    Trả về (xml, tham số hành động theo mã phần tử, danh sách lý do không chạy tự động được).
    """
    root = ET.fromstring(with_process_id(xml, process_id))
    strip_listeners(root)
    proc = root.find(f"{{{BPMN}}}process")
    problems: list[str] = []
    actions: dict[str, dict] = {}
    starts = 0
    for el in proc:
        kind = _local(el.tag)
        if kind not in NODES:
            continue
        label = _label(el)
        if kind not in ALLOWED_NODES:
            problems.append(f"“{label}” ({kind}) cần người thao tác hoặc chưa hỗ trợ nên không chạy tự động được")
            continue
        if kind == "startEvent":
            starts += 1
        if kind in ("startEvent", "intermediateCatchEvent"):
            problem = _timer_problem(el, label)
            if problem:
                problems.append(problem)
            if kind == "intermediateCatchEvent" and not any(_local(c.tag) == "timerEventDefinition" for c in el):
                problems.append(f"“{label}” phải là hẹn giờ")
        if kind == "serviceTask":
            if (el.get(f"{{{BAMBOO}}}action") or "") not in AUTOMATION_ACTIONS:
                problems.append(f"Tác vụ “{label}” chưa chọn hành động tự động")
                continue
            params, bad = action_params(el)
            if bad:
                problems.extend(f"Tác vụ “{label}”: {b}" for b in bad)
                continue
            action = params["action"]
            for attr in FLOWABLE_ATTRS:
                el.attrib.pop(f"{{{FLOWABLE}}}{attr}", None)
            for child in list(el):
                if _local(child.tag) == "extensionElements":
                    el.remove(child)
            el.set(f"{{{FLOWABLE}}}type", "external-worker")
            el.set(f"{{{FLOWABLE}}}topic", f"{TOPIC_PREFIX}{action}")
            actions[el.get("id")] = params
    if starts != 1:
        problems.append("Quy trình tự động cần đúng một sự kiện bắt đầu")
    for flow in proc.findall(f"{{{BPMN}}}sequenceFlow"):
        cond = flow.find(f"{{{BPMN}}}conditionExpression")
        reason = unsafe_expression(cond.text) if cond is not None else None
        if reason:
            problems.append(f"Điều kiện của luồng “{_label(flow)}” {reason}")
    return ET.tostring(root, encoding="unicode", xml_declaration=True), actions, problems


def _variables(raw) -> dict:
    raw = dict(raw or {})
    if len(raw) > 20:
        raise ActionError("Tối đa 20 biến")
    for key, value in raw.items():
        if not VARIABLE.match(key) or key in ("initiator",):
            raise ActionError(f"Tên biến “{key}” không hợp lệ hoặc là tên dành riêng")
        if not isinstance(value, str | int | float | bool) or (isinstance(value, str) and len(value) > 500):
            raise ActionError(f"Biến “{key}” chỉ nhận chuỗi (≤ 500 ký tự), số hoặc đúng/sai")
    return raw


def _stop(conn: psycopg.Connection, flowable: FlowableClient | None, automation_id: str, deployment_id: str) -> None:
    if flowable is not None:
        try:
            flowable.delete_deployment(deployment_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("không xóa được deployment %s: %s", deployment_id, exc)
    conn.execute(
        """UPDATE wf.automation_run SET status = 'CANCELLED', ended_at = now()
           WHERE automation_id = %s AND status = 'RUNNING'""",
        (automation_id,),
    )
    conn.execute(
        "UPDATE wf.process_automation SET status = 'STOPPED', stopped_at = now() WHERE id = %s", (automation_id,)
    )


def _events(raw) -> list[str]:
    events = [str(e) for e in (raw or [])]
    unknown = [e for e in events if e not in EVENTS]
    if unknown:
        raise ActionError(f"Sự kiện không hợp lệ: {unknown[0]}")
    return sorted(set(events))


def process_automation_enable(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant, m = _need_design(conn, session, args["id"])
    if ctx.flowable is None:
        raise ActionError("Chưa cấu hình Flowable", "unavailable", 503)
    latest = _latest(conn, args["id"])
    if latest is None:
        raise ActionError("Cần phát hành quy trình trước khi bật chạy tự động", "rejected")
    errors = [i for i in lint(latest["bpmn_xml"], latest["forms"]) if i["level"] == "error"]
    if errors:
        raise ActionError(f"Phiên bản đã phát hành còn lỗi: {errors[0]['message']}", "rejected")
    previous = conn.execute(
        "SELECT id, flowable_deployment_id, events, webhook_sha256 FROM wf.process_automation "
        "WHERE model_id = %s AND status = 'ACTIVE'",
        (m["id"],),
    ).fetchone()
    # Không nêu sự kiện thì giữ đăng ký của bản đang chạy khi áp dụng phiên bản mới
    events = _events(args["events"]) if args.get("events") is not None else (list(previous[2]) if previous else [])
    definition_key = f"auto_{str(tenant)[:8]}_{m['process_key']}"
    xml, actions, problems = automation_xml(latest["bpmn_xml"], definition_key)
    if problems:
        raise ActionError("Chưa bật được chạy tự động: " + "; ".join(problems[:4]), "rejected")
    active = conn.execute(
        "SELECT count(*) FROM wf.process_automation WHERE tenant_id = %s AND status = 'ACTIVE' AND model_id <> %s",
        (tenant, m["id"]),
    ).fetchone()[0]
    if active >= MAX_ACTIVE_PER_TENANT:
        raise ActionError(f"Mỗi tenant chạy tự động tối đa {MAX_ACTIVE_PER_TENANT} quy trình cùng lúc", "rejected")
    webhook = previous[3] if previous else None
    if previous:
        _stop(conn, ctx.flowable, str(previous[0]), previous[1])
        if webhook:
            conn.execute("UPDATE wf.process_automation SET webhook_sha256 = NULL WHERE id = %s", (previous[0],))
    deployment = ctx.flowable.deploy(
        f"auto-{str(tenant)[:8]}-{m['process_key']}-v{latest['version']}", f"{definition_key}.bpmn20.xml", xml.encode()
    )
    try:
        definition = ctx.flowable.definitions_of(deployment["id"])[0]["id"]
        automation_id = conn.execute(
            """INSERT INTO wf.process_automation (tenant_id, model_id, version, flowable_deployment_id,
                                                  flowable_definition_id, definition_key, actions, activated_by,
                                                  events, webhook_sha256)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s) RETURNING id""",
            (tenant, m["id"], latest["version"], deployment["id"], definition, definition_key,
             json.dumps(actions, ensure_ascii=False), person, events, webhook),
        ).fetchone()[0]
    except Exception:
        ctx.flowable.delete_deployment(deployment["id"])
        raise
    return {"id": str(automation_id), "status": "ACTIVE", "version": latest["version"]}


def _active(conn: psycopg.Connection, model_id: str) -> tuple | None:
    return conn.execute(
        """SELECT id, flowable_deployment_id, flowable_definition_id, version
           FROM wf.process_automation WHERE model_id = %s AND status = 'ACTIVE'""",
        (model_id,),
    ).fetchone()


def process_automation_disable(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    _, _, m = _need_design(conn, session, args["id"])
    row = _active(conn, str(m["id"]))
    if row is None:
        raise ActionError("Quy trình chưa bật chạy tự động", "rejected")
    _stop(conn, ctx.flowable, str(row[0]), row[1])
    conn.execute("UPDATE wf.process_automation SET webhook_sha256 = NULL WHERE id = %s", (row[0],))
    return {"id": str(row[0]), "status": "STOPPED", "version": row[3]}


def _start(conn, flowable: FlowableClient, automation: tuple, trigger: str, started_by, variables: dict, tenant) -> str:
    """Khởi chạy một lần chạy mới và ghi lại. automation = (id, deployment, definition, version)."""
    instance = flowable.start_definition(automation[2], {**variables, **({"initiator": str(started_by)} if started_by else {})})
    row = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """INSERT INTO wf.automation_run (tenant_id, automation_id, flowable_instance_id, trigger, started_by, variables)
               VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING id""",
            (tenant, automation[0], instance, trigger, started_by, json.dumps(variables, ensure_ascii=False)),
        )
        .fetchone()
    )
    return str(row["id"])


def process_automation_start(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    m = _model(conn, tenant, args["id"])
    if _access(conn, person, args["id"]) != "design":
        raise ActionError("Chỉ người thiết kế của đơn vị sở hữu được khởi chạy quy trình tự động", "forbidden", 403)
    if ctx.flowable is None:
        raise ActionError("Chưa cấu hình Flowable", "unavailable", 503)
    row = _active(conn, str(m["id"]))
    if row is None:
        raise ActionError("Quy trình chưa bật chạy tự động", "rejected")
    run_id = _start(conn, ctx.flowable, row, "MANUAL", person, _variables(args.get("variables")), tenant)
    return {"id": run_id, "status": "RUNNING", "version": row[3]}


def process_automation_webhook(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Tạo hoặc đổi mã webhook. Mã chỉ hiện đúng một lần; CSDL chỉ giữ mã băm SHA-256."""
    _, _, m = _need_design(conn, session, args["id"])
    row = _active(conn, str(m["id"]))
    if row is None:
        raise ActionError("Bật chạy tự động trước khi tạo webhook", "rejected")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "UPDATE wf.process_automation SET webhook_sha256 = %s WHERE id = %s",
        (hashlib.sha256(token.encode()).hexdigest(), row[0]),
    )
    return {"id": str(row[0]), "token": token, "path": f"/hooks/{token}"}


def process_automation_events(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    _, _, m = _need_design(conn, session, args["id"])
    row = _active(conn, str(m["id"]))
    if row is None:
        raise ActionError("Quy trình chưa bật chạy tự động", "rejected")
    events = _events(args.get("events"))
    conn.execute("UPDATE wf.process_automation SET events = %s WHERE id = %s", (events, row[0]))
    return {"id": str(row[0]), "events": events}


def start_from_webhook(pool, flowable: FlowableClient, token: str, body: dict) -> dict:
    """Khởi chạy quy trình theo mã webhook. Trả về mã lần chạy; mã sai hoặc đã tắt thì báo không tìm thấy."""
    digest = hashlib.sha256(token.encode()).hexdigest()
    with pool.connection() as conn:
        row = conn.execute(
            """SELECT id, flowable_deployment_id, flowable_definition_id, version, tenant_id FROM wf.process_automation
               WHERE webhook_sha256 = %s AND status = 'ACTIVE'""",
            (digest,),
        ).fetchone()
        if row is None:
            raise ActionError("Không tìm thấy webhook", "not-found", 404)
        variables = _scalar_variables(body)
        run_id = _start(conn, flowable, row[:4], "WEBHOOK", None, variables, row[4])
    return {"id": run_id, "status": "RUNNING"}


def _scalar_variables(payload: dict, limit: int = 20) -> dict:
    """Chỉ lấy trường đơn giản, tên hợp lệ; bỏ phần còn lại (không tin dữ liệu từ ngoài)."""
    out = {}
    for key, value in (payload or {}).items():
        if len(out) >= limit:
            break
        if isinstance(key, str) and VARIABLE.match(key) and key not in ("initiator", "event") and (
            isinstance(value, bool | int | float) or (isinstance(value, str) and len(value) <= 500)
        ):
            out[key] = value
    return out


def automation_overview(conn: psycopg.Connection, model_id: str) -> dict | None:
    cur = conn.cursor(row_factory=dict_row)
    a = cur.execute(
        """SELECT a.id, a.status, a.version, a.actions, a.events, (a.webhook_sha256 IS NOT NULL) AS webhook,
                  to_char(a.activated_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS activated_at,
                  p.full_name AS activated_by
           FROM wf.process_automation a JOIN core.person p ON p.id = a.activated_by
           WHERE a.model_id = %s ORDER BY a.activated_at DESC LIMIT 1""",
        (model_id,),
    ).fetchone()
    if a is None:
        return None
    runs = cur.execute(
        """SELECT r.id, r.trigger, r.status, r.notified, r.error, r.steps, r.variables,
                  coalesce(p.full_name, CASE r.trigger WHEN 'TIMER' THEN 'Hẹn giờ' WHEN 'WEBHOOK' THEN 'Webhook' ELSE 'Sự kiện' END)
                      AS started_by,
                  to_char(r.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS started_at,
                  to_char(r.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS ended_at
           FROM wf.automation_run r JOIN wf.process_automation x ON x.id = r.automation_id
           LEFT JOIN core.person p ON p.id = r.started_by
           WHERE x.model_id = %s ORDER BY r.started_at DESC LIMIT 15""",
        (model_id,),
    ).fetchall()
    return {
        "id": str(a["id"]),
        "status": a["status"],
        "version": a["version"],
        "activated_at": a["activated_at"],
        "activated_by": a["activated_by"],
        "actions": len(a["actions"]),
        "events": list(a["events"]),
        "webhook": a["webhook"],
        "event_catalog": [{"code": k, "label": v} for k, v in EVENTS.items()],
        "runs": [{**r, "id": str(r["id"])} for r in runs],
    }


# --- Tiến trình nền ---------------------------------------------------------------------------------------------


def render(template: str, variables: dict, quote: bool = False) -> str:
    """Thay {tên_biến} bằng giá trị của biến quy trình; biến không có thì giữ nguyên."""

    def value(match: re.Match) -> str:
        found = variables.get(match.group(1))
        if found is None:
            return match.group(0)
        text = str(found).lower() if isinstance(found, bool) else str(found)
        return urllib.parse.quote(text, safe="") if quote else text

    return re.sub(r"\{([A-Za-z_][A-Za-z0-9_]{0,40})\}", value, template)


def _coerce(text: str):
    if text in ("true", "false"):
        return text == "true"
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        return text


def exec_notify(conn, settings, run: str, job: dict, params: dict, variables: dict) -> dict:
    message = render(params["message"], variables)[:500]
    count = conn.execute("SELECT wf.automation_notify(%s, %s, %s) AS n", (run, job["elementId"], message)).fetchone()["n"]
    conn.execute("UPDATE wf.automation_run SET notified = notified + %s WHERE id = %s", (count, run))
    return {f"notified_{job['elementId']}": count}


def exec_setvar(conn, settings, run: str, job: dict, params: dict, variables: dict) -> dict:
    return {params["name"]: _coerce(render(params["value"], variables))}


def exec_http(conn, settings, run: str, job: dict, params: dict, variables: dict) -> dict:
    url = render(params["url"], variables, quote=True)
    body = render(params["body"], variables) if params["body"] and params["method"] == "POST" else None
    payload = None
    if body:
        try:
            payload = json.loads(body)
        except ValueError as exc:
            raise delivery.DeliveryError("Nội dung gửi sau khi thay biến không phải JSON hợp lệ", permanent=True) from exc
    resp = delivery.pinned_request(params["method"], url, payload, settings.webhook_allow_private)
    element = job["elementId"]
    return {f"{element}_status": resp.status_code, f"{element}_ok": 200 <= resp.status_code < 300, f"{element}_body": resp.text[:2000]}


EXECUTORS = {"notify": exec_notify, "http": exec_http, "setvar": exec_setvar}


def _run_for_job(conn: psycopg.Connection, job: dict, automation: dict) -> str:
    row = conn.execute(
        "SELECT id FROM wf.automation_run WHERE flowable_instance_id = %s", (job["processInstanceId"],)
    ).fetchone()
    if row:
        return str(row["id"])
    variables = {v["name"]: v["value"] for v in job.get("variables") or [] if v.get("name") != "initiator"}
    return str(
        conn.execute(
            """INSERT INTO wf.automation_run (tenant_id, automation_id, flowable_instance_id, trigger, variables)
               VALUES (%s, %s, %s, 'TIMER', %s::jsonb) RETURNING id""",
            (automation["tenant_id"], automation["id"], job["processInstanceId"],
             json.dumps(variables, ensure_ascii=False)),
        ).fetchone()["id"]
    )


def handle_jobs(conn: psycopg.Connection, flowable: FlowableClient, settings: config.Settings | None = None) -> int:
    done = 0
    for action in sorted(AUTOMATION_ACTIONS):
        for job in flowable.external_acquire(f"{TOPIC_PREFIX}{action}"):
            try:
                automation = conn.execute(
                    """SELECT id, tenant_id, actions FROM wf.process_automation
                       WHERE flowable_definition_id = %s AND status = 'ACTIVE'""",
                    (job["processDefinitionId"],),
                ).fetchone()
                if automation is None:
                    raise RuntimeError("Quy trình tự động đã tắt")
                params = automation["actions"].get(job["elementId"])
                if not params or params.get("action") != action:
                    raise RuntimeError("Phần tử không có hành động tự động đã đăng ký")
                run = _run_for_job(conn, job, automation)
                variables = {v["name"]: v["value"] for v in job.get("variables") or []}
                result = EXECUTORS[action](conn, settings or config.load(), run, job, params, variables)
                conn.commit()
                flowable.external_complete(job["id"], result)
                done += 1
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                log.warning("tác vụ tự động %s lỗi: %s", job.get("id"), exc)
                permanent = isinstance(exc, delivery.DeliveryError) and exc.permanent
                retries = 0 if permanent else max(int(job.get("retries") or 1) - 1, 0)
                try:
                    flowable.external_fail(job["id"], str(exc), retries)
                    if retries == 0:
                        conn.execute(
                            "UPDATE wf.automation_run SET status = 'FAILED', error = %s, ended_at = now() "
                            "WHERE flowable_instance_id = %s AND status = 'RUNNING'",
                            (str(exc)[:500], job["processInstanceId"]),
                        )
                        conn.commit()
                except Exception as inner:  # noqa: BLE001
                    conn.rollback()
                    log.warning("không báo được lỗi cho Flowable: %s", inner)
    return done


def dispatch_events(conn: psycopg.Connection, flowable: FlowableClient) -> int:
    """Nhận sự kiện nghiệp vụ trong hàng đợi và khởi chạy các quy trình tự động đã đăng ký sự kiện đó."""
    handled = 0
    for message in conn.execute("SELECT * FROM msg.lease('event.', 'automation-events', 20)").fetchall():
        conn.commit()
        name = message["topic"].removeprefix("event.")
        try:
            targets = conn.execute(
                """SELECT id, flowable_deployment_id, flowable_definition_id, version FROM wf.process_automation
                   WHERE tenant_id = %s AND status = 'ACTIVE' AND %s = ANY (events)
                     AND wf.automation_in_scope(id, %s::jsonb)""",
                (message["tenant_id"], name, json.dumps((message["payload"] or {}).get("unit_ids") or [])),
            ).fetchall()
            variables = {**_scalar_variables(message["payload"]), "event": name}
            for target in targets:
                _start(conn, flowable, (target["id"], target["flowable_deployment_id"], target["flowable_definition_id"],
                                        target["version"]), "EVENT", None, variables, message["tenant_id"])
            conn.execute(
                "SELECT msg.complete(%s, %s::jsonb)",
                (message["id"], json.dumps({"channel": "event", "provider_id": f"started:{len(targets)}",
                                            "delivered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "alg": "none"})),
            )
            conn.commit()
            handled += 1
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("không xử lý được sự kiện %s: %s", message["id"], exc)
            conn.execute("SELECT msg.fail(%s, %s)", (message["id"], str(exc)))
            conn.commit()
    return handled


def sync_runs(conn: psycopg.Connection, flowable: FlowableClient) -> int:
    closed = 0
    for run in conn.execute(
        "SELECT id, flowable_instance_id FROM wf.automation_run WHERE status = 'RUNNING' ORDER BY started_at LIMIT 100"
    ).fetchall():
        try:
            if flowable.process_running(run["flowable_instance_id"]):
                continue
            steps = _steps(flowable, run["flowable_instance_id"], {})
            conn.execute(
                "UPDATE wf.automation_run SET status = 'COMPLETED', steps = %s::jsonb, ended_at = now() WHERE id = %s",
                (json.dumps(steps, ensure_ascii=False), run["id"]),
            )
            conn.commit()
            closed += 1
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("không đồng bộ được lần chạy %s: %s", run["id"], exc)
    return closed


def tick(conn: psycopg.Connection, flowable: FlowableClient, settings: config.Settings | None = None) -> int:
    """Một vòng: phân phối sự kiện, nhận và thực hiện tác vụ tự động, rồi chốt các lần chạy đã xong."""
    return dispatch_events(conn, flowable) + handle_jobs(conn, flowable, settings) + sync_runs(conn, flowable)


def run_forever(settings: config.Settings, interval: float = 2.0) -> None:
    flowable = FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password)
    conn = psycopg.connect(settings.database_url, row_factory=dict_row)
    log.info("quy trình tự động đang chạy")
    while True:
        try:
            tick(conn, flowable, settings)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("vòng tự động lỗi: %s", exc)
        time.sleep(interval)


def start_background(settings: config.Settings) -> threading.Thread:
    thread = threading.Thread(target=run_forever, args=(settings,), name="process-automation", daemon=True)
    thread.start()
    return thread


HANDLERS = {
    "process_automation_enable": process_automation_enable,
    "process_automation_disable": process_automation_disable,
    "process_automation_start": process_automation_start,
    "process_automation_webhook": process_automation_webhook,
    "process_automation_events": process_automation_events,
}
