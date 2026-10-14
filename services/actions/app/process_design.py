# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import hashlib
import json
import re
import uuid
import xml.etree.ElementTree as ET
from collections import deque

import psycopg
from psycopg.rows import dict_row

from .common import ActionError, Context, bind_session, session_identity

PERMISSION = "wf.process.design"
BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
FLOWABLE = "http://flowable.org/bpmn"
KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]{1,63}$")
DURATION = re.compile(r"^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$")
EVENTS = {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent"}
TASKS = {
    "task",
    "userTask",
    "serviceTask",
    "scriptTask",
    "manualTask",
    "sendTask",
    "receiveTask",
    "businessRuleTask",
    "callActivity",
    "subProcess",
}
GATEWAYS = {"exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway"}
NODES = EVENTS | TASKS | GATEWAYS
MAX_SANDBOX_STEPS = 50
DEFAULT_VARIABLES = {"decision": "APPROVE", "amount": 10_000_000, "stepIndex": 0, "stepCount": 1}

ET.register_namespace("", BPMN)
ET.register_namespace("flowable", FLOWABLE)
ET.register_namespace("bpmndi", "http://www.omg.org/spec/BPMN/20100524/DI")
ET.register_namespace("dc", "http://www.omg.org/spec/DD/20100524/DC")
ET.register_namespace("di", "http://www.omg.org/spec/DD/20100524/DI")
ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _issue(level: str, message: str, element: str | None = None) -> dict:
    return {"level": level, "message": message, "element_id": element}


def _label(el: ET.Element) -> str:
    return el.get("name") or el.get("id") or _local(el.tag)


def lint(xml: str, forms: list[dict] | None = None) -> list[dict]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        return [_issue("error", f"XML không hợp lệ: {exc}")]
    if _local(root.tag) != "definitions" or not root.tag.startswith(f"{{{BPMN}}}"):
        return [_issue("error", "Không phải tệp BPMN 2.0 (thiếu definitions)")]
    processes = root.findall(f"{{{BPMN}}}process")
    if not processes:
        return [_issue("error", "Không có tiến trình (process) nào")]
    issues: list[dict] = []
    if len(processes) > 1:
        issues.append(_issue("warning", "Có nhiều tiến trình: chỉ tiến trình đầu tiên được chạy thử"))
    proc = processes[0]

    ids: dict[str, int] = {}
    for el in root.iter():
        if el.get("id"):
            ids[el.get("id")] = ids.get(el.get("id"), 0) + 1
    for dup in (i for i, n in ids.items() if n > 1):
        issues.append(_issue("error", f"Trùng id phần tử “{dup}”", dup))

    nodes = {el.get("id"): el for el in proc if _local(el.tag) in NODES and el.get("id")}
    flows = [el for el in proc if _local(el.tag) == "sequenceFlow"]
    outgoing: dict[str, list[ET.Element]] = {n: [] for n in nodes}
    incoming: dict[str, list[ET.Element]] = {n: [] for n in nodes}
    for f in flows:
        src, dst = f.get("sourceRef"), f.get("targetRef")
        if src not in nodes or dst not in nodes:
            issues.append(_issue("error", f"Luồng “{_label(f)}” nối tới phần tử không tồn tại", f.get("id")))
            continue
        outgoing[src].append(f)
        incoming[dst].append(f)

    starts = [n for n, el in nodes.items() if _local(el.tag) == "startEvent"]
    ends = [n for n, el in nodes.items() if _local(el.tag) == "endEvent"]
    if not starts:
        issues.append(_issue("error", "Thiếu sự kiện bắt đầu"))
    if len(starts) > 1:
        issues.append(_issue("warning", "Có nhiều sự kiện bắt đầu: chạy thử đi từ sự kiện đầu tiên"))
    if not ends:
        issues.append(_issue("error", "Thiếu sự kiện kết thúc"))

    form_keys = {f.get("key") for f in forms or []}
    for nid, el in nodes.items():
        kind = _local(el.tag)
        if kind == "boundaryEvent":
            continue
        if kind != "startEvent" and not incoming[nid]:
            issues.append(_issue("error", f"“{_label(el)}” không có luồng vào", nid))
        if kind != "endEvent" and not outgoing[nid]:
            issues.append(_issue("error", f"“{_label(el)}” không có luồng ra", nid))
        if kind in TASKS and not el.get("name"):
            issues.append(_issue("warning", f"Tác vụ “{nid}” chưa có tên", nid))
        if kind == "userTask":
            if not any(el.get(f"{{{FLOWABLE}}}{a}") for a in ("assignee", "candidateUsers", "candidateGroups")):
                issues.append(_issue("warning", f"Tác vụ “{_label(el)}” chưa có người nhận (assignee / nhóm)", nid))
            due = el.get(f"{{{FLOWABLE}}}dueDate")
            if due and not due.startswith("$") and not DURATION.match(due):
                issues.append(
                    _issue("error", f"Hạn xử lý “{due}” của “{_label(el)}” không phải dạng ISO-8601 (PT48H)", nid)
                )
            form = el.get(f"{{{FLOWABLE}}}formKey")
            if form and form not in form_keys:
                issues.append(_issue("warning", f"Biểu mẫu “{form}” của “{_label(el)}” chưa được định nghĩa", nid))
        if kind == "serviceTask" and not any(
            el.get(f"{{{FLOWABLE}}}{a}") for a in ("class", "delegateExpression", "expression", "type")
        ):
            issues.append(_issue("error", f"Tác vụ dịch vụ “{_label(el)}” chưa có cách thực thi", nid))
        if kind in ("exclusiveGateway", "inclusiveGateway") and len(outgoing[nid]) > 1:
            default = el.get("default")
            for f in outgoing[nid]:
                if f.get("id") != default and f.find(f"{{{BPMN}}}conditionExpression") is None:
                    issues.append(
                        _issue("error", f"Nhánh “{_label(f)}” ra từ “{_label(el)}” chưa có điều kiện", f.get("id"))
                    )

    def walk(seeds: list[str], edges: dict[str, list[ET.Element]], ref: str) -> set[str]:
        seen, queue = set(seeds), deque(seeds)
        while queue:
            for f in edges.get(queue.popleft(), []):
                nxt = f.get(ref)
                if nxt in nodes and nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        return seen

    if starts and ends:
        reached = walk(starts, outgoing, "targetRef")
        finishing = walk(ends, incoming, "sourceRef")
        for nid, el in nodes.items():
            if _local(el.tag) == "boundaryEvent":
                continue
            if nid not in reached:
                issues.append(_issue("warning", f"“{_label(el)}” không đi tới được từ điểm bắt đầu", nid))
            elif nid not in finishing:
                issues.append(_issue("error", f"Từ “{_label(el)}” không đi tới được điểm kết thúc", nid))
    if not proc.get("isExecutable") == "true":
        issues.append(_issue("warning", "Tiến trình chưa đánh dấu isExecutable=true (đã bật khi chạy thử)"))
    return issues


def with_process_id(xml: str, process_id: str, name: str | None = None) -> str:
    root = ET.fromstring(xml)
    proc = root.find(f"{{{BPMN}}}process")
    old = proc.get("id")
    proc.set("id", process_id)
    proc.set("isExecutable", "true")
    if name:
        proc.set("name", name)
    for el in root.iter():
        if el.get("bpmnElement") == old:
            el.set("bpmnElement", process_id)
        if el.get("processRef") == old:
            el.set("processRef", process_id)
    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def sandbox_xml(xml: str, process_id: str) -> str:
    root = ET.fromstring(with_process_id(xml, process_id))
    for el in root.iter():
        kind = _local(el.tag)
        if kind == "serviceTask":
            for attr in ("class", "delegateExpression", "type", "resultVariableName"):
                el.attrib.pop(f"{{{FLOWABLE}}}{attr}", None)
            el.set(f"{{{FLOWABLE}}}expression", "${true}")
            for child in list(el):
                if _local(child.tag) == "extensionElements":
                    el.remove(child)
        elif kind == "scriptTask":
            el.tag = f"{{{BPMN}}}serviceTask"
            for attr in ("scriptFormat", f"{{{FLOWABLE}}}autoStoreVariables"):
                el.attrib.pop(attr, None)
            for child in list(el):
                if _local(child.tag) == "script":
                    el.remove(child)
            el.set(f"{{{FLOWABLE}}}expression", "${true}")
    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def _caller(conn: psycopg.Connection, session: dict, *, write: bool) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    if write:
        ok = conn.execute(
            """SELECT core.has_permission(%s, %s, u.id) FROM core.org_unit u
               WHERE u.tenant_id = %s AND u.parent_id IS NULL AND u.valid_period @> now()
               ORDER BY u.created_at LIMIT 1""",
            (person, PERMISSION, tenant),
        ).fetchone()
        if not (ok and ok[0]):
            raise ActionError(f"Cần quyền {PERMISSION} để thiết kế quy trình", "forbidden", 403)
        bind_session(conn, session)
    return person, tenant


def _forms(value) -> list[dict]:
    forms = value if isinstance(value, list) else json.loads(value or "[]")
    clean = []
    for f in forms:
        key = str(f.get("key") or "").strip()
        if not KEY.match(key):
            raise ActionError(f"Mã biểu mẫu không hợp lệ: {key or '(trống)'} (chữ, số, _ hoặc -)")
        fields = [
            {
                "label": str(x.get("label") or "").strip(),
                "type": str(x.get("type") or "text"),
                "required": bool(x.get("required")),
            }
            for x in f.get("fields") or []
            if str(x.get("label") or "").strip()
        ]
        clean.append({"key": key, "name": str(f.get("name") or key).strip(), "fields": fields})
    if len({f["key"] for f in clean}) != len(clean):
        raise ActionError("Trùng mã biểu mẫu")
    return clean


def _model(conn: psycopg.Connection, tenant: str, model_id: str, lock: bool = False) -> dict:
    row = (
        conn.cursor(row_factory=dict_row)
        .execute(
            "SELECT * FROM wf.process_model WHERE id = %s AND tenant_id = %s" + (" FOR UPDATE" if lock else ""),
            (model_id, tenant),
        )
        .fetchone()
    )
    if row is None:
        raise ActionError("Không tìm thấy quy trình", "not-found", 404)
    return row


def process_models(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    person, tenant = _caller(conn, session, write=False)
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT m.id, m.process_key, m.name, m.description,
                  to_char(m.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS updated_at,
                  (SELECT max(v.version) FROM wf.process_version v WHERE v.model_id = m.id) AS published_version,
                  (SELECT r.status FROM wf.sandbox_run r WHERE r.model_id = m.id
                   ORDER BY r.started_at DESC LIMIT 1) AS last_run_status,
                  (SELECT count(*) FROM wf.sandbox_run r WHERE r.model_id = m.id)::int AS runs
           FROM wf.process_model m WHERE m.tenant_id = %s ORDER BY m.name""",
            (tenant,),
        )
        .fetchall()
    )
    can = conn.execute(
        """SELECT core.has_permission(%s, %s, u.id) FROM core.org_unit u
           WHERE u.tenant_id = %s AND u.parent_id IS NULL AND u.valid_period @> now()
           ORDER BY u.created_at LIMIT 1""",
        (person, PERMISSION, tenant),
    ).fetchone()
    return {"can_design": bool(can and can[0]), "models": [{**r, "id": str(r["id"])} for r in rows]}


def process_model_get(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    _, tenant = _caller(conn, session, write=False)
    m = _model(conn, tenant, args["id"])
    cur = conn.cursor(row_factory=dict_row)
    versions = cur.execute(
        """SELECT v.version, v.sha256, v.note, p.full_name AS published_by,
                  to_char(v.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS published_at
           FROM wf.process_version v JOIN core.person p ON p.id = v.published_by
           WHERE v.model_id = %s ORDER BY v.version DESC""",
        (m["id"],),
    ).fetchall()
    runs = cur.execute(
        """SELECT r.id, r.status, r.steps, r.variables, r.error, p.full_name AS started_by,
                  to_char(r.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS started_at
           FROM wf.sandbox_run r JOIN core.person p ON p.id = r.started_by
           WHERE r.model_id = %s ORDER BY r.started_at DESC LIMIT 10""",
        (m["id"],),
    ).fetchall()
    return {
        "id": str(m["id"]),
        "process_key": m["process_key"],
        "name": m["name"],
        "description": m["description"],
        "bpmn_xml": m["bpmn_xml"],
        "forms": m["forms"],
        "issues": lint(m["bpmn_xml"], m["forms"]),
        "versions": versions,
        "runs": [{**r, "id": str(r["id"])} for r in runs],
    }


def process_model_validate(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> list[dict]:
    _caller(conn, session, write=False)
    return lint(args["bpmn_xml"], _forms(args.get("forms") or []))


def process_model_save(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _caller(conn, session, write=True)
    key = str(args.get("process_key") or "").strip()
    name = str(args.get("name") or "").strip()
    if not KEY.match(key):
        raise ActionError("Mã quy trình chỉ gồm chữ, số, _ hoặc -, bắt đầu bằng chữ (2–64 ký tự)")
    if len(name) < 2:
        raise ActionError("Nhập tên quy trình")
    forms = _forms(args.get("forms") or [])
    try:
        xml = with_process_id(args["bpmn_xml"], key, name)
    except (ET.ParseError, AttributeError) as exc:
        raise ActionError("Tệp BPMN không hợp lệ: thiếu tiến trình hoặc sai cú pháp XML") from exc
    if args.get("id"):
        _model(conn, tenant, args["id"], lock=True)
        conn.execute(
            """UPDATE wf.process_model SET process_key = %s, name = %s, description = %s, bpmn_xml = %s,
                      forms = %s::jsonb, updated_by = %s, updated_at = now() WHERE id = %s""",
            (key, name, args.get("description"), xml, json.dumps(forms, ensure_ascii=False), person, args["id"]),
        )
        model_id = args["id"]
    else:
        model_id = conn.execute(
            """INSERT INTO wf.process_model (tenant_id, process_key, name, description, bpmn_xml, forms, created_by,
                                             updated_by)
               VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s) RETURNING id""",
            (tenant, key, name, args.get("description"), xml, json.dumps(forms, ensure_ascii=False), person, person),
        ).fetchone()[0]
    return {"id": str(model_id), "issues": lint(xml, forms)}


def process_model_publish(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _caller(conn, session, write=True)
    m = _model(conn, tenant, args["id"], lock=True)
    errors = [i for i in lint(m["bpmn_xml"], m["forms"]) if i["level"] == "error"]
    if errors:
        raise ActionError(f"Còn {len(errors)} lỗi: {errors[0]['message']}", "rejected")
    sha = hashlib.sha256(m["bpmn_xml"].encode()).hexdigest()
    last = conn.execute(
        "SELECT version, sha256 FROM wf.process_version WHERE model_id = %s ORDER BY version DESC LIMIT 1", (m["id"],)
    ).fetchone()
    if last and last[1] == sha:
        raise ActionError(f"Bản nháp giống hệt phiên bản v{last[0]} đã phát hành", "rejected")
    version = (last[0] if last else 0) + 1
    conn.execute(
        """INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, note, published_by)
           VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)""",
        (
            tenant,
            m["id"],
            version,
            m["bpmn_xml"],
            json.dumps(m["forms"], ensure_ascii=False),
            sha,
            (args.get("note") or "").strip() or None,
            person,
        ),
    )
    return {"id": str(m["id"]), "version": version, "sha256": sha}


def _steps(flowable, process_id: str, decisions: dict[str, str]) -> list[dict]:
    steps = [
        {
            "activity_id": a.get("activityId"),
            "name": a.get("activityName") or a.get("activityId"),
            "type": a.get("activityType"),
            "started_at": a.get("startTime"),
            "ended_at": a.get("endTime"),
            "decision": decisions.get(a.get("taskId") or ""),
        }
        for a in flowable.historic_activities(process_id)
        if a.get("activityType") != "sequenceFlow"
    ]
    return sorted(steps, key=lambda x: (x["started_at"] or "", x["type"] == "endEvent", x["ended_at"] or "~"))


def process_sandbox_run(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = _caller(conn, session, write=True)
    if ctx.flowable is None:
        raise ActionError("Chưa cấu hình Flowable", "unavailable", 503)
    m = _model(conn, tenant, args["id"])
    errors = [i for i in lint(m["bpmn_xml"], m["forms"]) if i["level"] == "error"]
    if errors:
        raise ActionError(f"Còn {len(errors)} lỗi — sửa trước khi chạy thử: {errors[0]['message']}", "rejected")
    variables = {**DEFAULT_VARIABLES, **(args.get("variables") or {})}
    decision = str(variables.get("decision") or "APPROVE")
    run_id = uuid.uuid4()
    process_id = f"sandbox_{m['process_key']}_{run_id.hex[:8]}"
    deployment = None
    status, error, steps, decisions, completed = "FAILED", None, [], {}, 0
    try:
        deployment = ctx.flowable.deploy(
            f"sandbox-{tenant}-{run_id.hex[:8]}",
            f"{process_id}.bpmn20.xml",
            sandbox_xml(m["bpmn_xml"], process_id).encode(),
        )
        definition = ctx.flowable.definitions_of(deployment["id"])[0]["id"]
        instance = ctx.flowable.start_definition(definition, {**variables, "initiator": person, "sandbox": True})
        for _ in range(MAX_SANDBOX_STEPS):
            if not ctx.flowable.process_running(instance):
                status = "COMPLETED"
                break
            tasks = ctx.flowable.tasks(instance)
            if not tasks:
                status = "STOPPED"
                error = "Tiến trình đang chờ sự kiện không phải tác vụ người dùng (hẹn giờ, tin nhắn...)"
                break
            for task in tasks:
                completed += 1
                decisions[task["id"]] = decision
                ctx.flowable.complete(task["id"], {"decision": decision, "stepIndex": completed})
        else:
            status, error = "STOPPED", f"Dừng sau {MAX_SANDBOX_STEPS} lượt tác vụ (có thể là vòng lặp)"
        steps = _steps(ctx.flowable, instance, decisions)
    except Exception as exc:  # noqa: BLE001
        error = str(exc)[:1000]
    finally:
        if deployment:
            try:
                ctx.flowable.delete_deployment(deployment["id"])
            except Exception:  # noqa: BLE001, S110
                pass
    conn.execute(
        """INSERT INTO wf.sandbox_run (tenant_id, id, model_id, xml_sha256, status, steps, variables, error,
                                       started_by, finished_at)
           VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, now())""",
        (
            tenant,
            run_id,
            m["id"],
            hashlib.sha256(m["bpmn_xml"].encode()).hexdigest(),
            status,
            json.dumps(steps, ensure_ascii=False),
            json.dumps(variables, ensure_ascii=False),
            error,
            person,
        ),
    )
    return {"id": str(run_id), "status": status, "error": error, "steps": steps}


HANDLERS = {
    "process_models": process_models,
    "process_model_get": process_model_get,
    "process_model_validate": process_model_validate,
    "process_model_save": process_model_save,
    "process_model_publish": process_model_publish,
    "process_sandbox_run": process_sandbox_run,
}
