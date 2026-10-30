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
BAMBOO = "http://bamboo.local/bpmn"
AUTOMATION_ACTIONS = {"notify", "http", "setvar"}
AUTOMATION_AUDIENCES = {"INITIATOR", "UNIT", "COMPANY", "GROUP"}
AUTOMATION_VARIABLE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")
AUTOMATION_URL = re.compile(r"^https://[A-Za-z0-9.-]+(:\d{1,5})?(/\S*)?$")


def action_params(el: ET.Element) -> tuple[dict, list[str]]:
    """Tham số và lỗi của một tác vụ dịch vụ có `bamboo:action`; dùng chung cho kiểm tra thiết kế và bật chạy tự động."""
    attr = lambda name: (el.get(f"{{{BAMBOO}}}{name}") or "").strip()  # noqa: E731
    action, problems = attr("action"), []
    params: dict = {"action": action}
    if action not in AUTOMATION_ACTIONS:
        return params, [f"Hành động tự động “{action}” không hợp lệ"]
    if action == "notify":
        params["audience"] = attr("audience") or "INITIATOR"
        params["message"] = attr("message")
        if params["audience"] not in AUTOMATION_AUDIENCES:
            problems.append(f"Người nhận “{params['audience']}” không hợp lệ")
        if not 1 <= len(params["message"]) <= 500:
            problems.append("Nội dung thông báo phải từ 1 đến 500 ký tự")
    elif action == "http":
        params["url"], params["method"], params["body"] = attr("url"), (attr("method") or "POST").upper(), attr("body")
        host_part = params["url"].split("://", 1)[-1].split("/", 1)[0]
        if not AUTOMATION_URL.match(params["url"]) or "{" in host_part:
            problems.append("Địa chỉ gọi API phải là https với tên miền cố định (chỉ phần đường dẫn dùng được {biến})")
        if params["method"] not in ("GET", "POST"):
            problems.append("Phương thức chỉ nhận GET hoặc POST")
        if len(params["body"]) > 2000:
            problems.append("Nội dung gửi tối đa 2000 ký tự")
    else:
        params["name"], params["value"] = attr("name"), attr("value")
        if not AUTOMATION_VARIABLE.match(params["name"]) or params["name"] in ("initiator", "sandbox", "event"):
            problems.append(f"Tên biến “{params['name']}” không hợp lệ hoặc là tên dành riêng")
        if len(params["value"]) > 200:
            problems.append("Giá trị biến tối đa 200 ký tự")
    return params, problems


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
MAX_SANDBOX_VARIABLES = 20
VARIABLE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")
RESERVED = {"initiator", "sandbox", "stepIndex", "stepCount"}
DECISIONS = {"APPROVE", "REJECT", "RETURN"}
DEFAULT_VARIABLES = {"decision": "APPROVE", "amount": 10_000_000, "stepIndex": 0, "stepCount": 1}

ET.register_namespace("", BPMN)
ET.register_namespace("flowable", FLOWABLE)
ET.register_namespace("bamboo", BAMBOO)
ET.register_namespace("bpmndi", "http://www.omg.org/spec/BPMN/20100524/DI")
ET.register_namespace("dc", "http://www.omg.org/spec/DD/20100524/DC")
ET.register_namespace("di", "http://www.omg.org/spec/DD/20100524/DI")
ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")


_KEYWORDS = r"(?:and|or|not|empty|div|mod|eq|ne|lt|gt|le|ge|true|false|null)"
_CALL = re.compile(rf"(?<![\w.])(?!{_KEYWORDS}\b)[A-Za-z_]\w*\s*\(")
_ALLOWED = re.compile(r"^[\sA-Za-z0-9_+\-*/%<>=!&|?:()]*$")
_SEGMENT = re.compile(r"[$#]\{(.*?)\}", re.S)


def unsafe_expression(expr: str | None) -> str | None:
    """Biểu thức điều kiện chỉ được gồm biến, số, chuỗi và phép toán; chặn gọi phương thức, truy cập thuộc tính.

    JUEL của Flowable gọi được phương thức Java trên đối tượng trong ngữ cảnh (execution, task), nên biểu thức do người
    dùng viết là đường thực thi mã nếu không giới hạn.
    """
    if not expr or ("${" not in expr and "#{" not in expr):
        return None
    for inner in _SEGMENT.findall(expr):
        text = re.sub(r"'[^'\\]*'|\"[^\"\\]*\"", "0", inner)
        text = re.sub(r"\d+\.\d+", "0", text)
        if not _ALLOWED.match(text):
            return "chứa ký tự không được phép (chỉ dùng biến, số, chuỗi và phép so sánh, số học, logic)"
        if _CALL.search(text):
            return "không được gọi hàm hoặc phương thức"
    if _SEGMENT.sub("", expr).count("{") or _SEGMENT.sub("", expr).count("}"):
        return "dấu ngoặc nhọn không cân"
    return None


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

    for el in proc.iter():
        kind = _local(el.tag)
        if kind in ("executionListener", "taskListener", "eventListener"):
            owner = el.get("id") or "tiến trình"
            issues.append(_issue("error", f"Bộ lắng nghe (listener) không được dùng trong quy trình thiết kế ({owner})"))
        if kind == "conditionExpression":
            reason = unsafe_expression(el.text)
            if reason:
                issues.append(_issue("error", f"Điều kiện “{(el.text or '').strip()[:60]}” {reason}", None))
        if kind in ("timeCycle", "timeDate", "timeDuration"):
            reason = unsafe_expression(el.text)
            if reason:
                issues.append(_issue("error", f"Biểu thức hẹn giờ {reason}", None))
    for flow in flows:
        cond = flow.find(f"{{{BPMN}}}conditionExpression")
        reason = unsafe_expression(cond.text) if cond is not None else None
        if reason:
            issues.append(_issue("error", f"Điều kiện của luồng “{_label(flow)}” {reason}", flow.get("id")))

    form_keys = {f.get("key") for f in forms or []}
    for nid, el in nodes.items():
        kind = _local(el.tag)
        if kind == "boundaryEvent":
            continue
        if kind == "startEvent" and incoming[nid]:
            issues.append(_issue("error", f"Sự kiện bắt đầu “{_label(el)}” không được có luồng vào", nid))
        if kind == "endEvent" and outgoing[nid]:
            issues.append(_issue("error", f"Sự kiện kết thúc “{_label(el)}” không được có luồng ra", nid))
        if kind != "startEvent" and not incoming[nid]:
            issues.append(_issue("error", f"“{_label(el)}” không có luồng vào", nid))
        if kind != "endEvent" and not outgoing[nid]:
            issues.append(_issue("error", f"“{_label(el)}” không có luồng ra", nid))
        if kind in TASKS and not el.get("name"):
            issues.append(_issue("warning", f"Tác vụ “{nid}” chưa có tên", nid))
        if kind == "userTask":
            if not any(el.get(f"{{{FLOWABLE}}}{a}") for a in ("assignee", "candidateUsers", "candidateGroups")):
                issues.append(_issue("warning", f"Tác vụ “{_label(el)}” chưa có người nhận (assignee / nhóm)", nid))
            for attr in ("assignee", "candidateUsers", "candidateGroups", "dueDate", "formKey"):
                reason = unsafe_expression(el.get(f"{{{FLOWABLE}}}{attr}"))
                if reason:
                    issues.append(_issue("error", f"Thuộc tính {attr} của “{_label(el)}” {reason}", nid))
            due = el.get(f"{{{FLOWABLE}}}dueDate")
            if due and not due.startswith("$") and not DURATION.match(due):
                issues.append(
                    _issue("error", f"Hạn xử lý “{due}” của “{_label(el)}” không phải dạng ISO-8601 (PT48H)", nid)
                )
            form = el.get(f"{{{FLOWABLE}}}formKey")
            if form and form not in form_keys:
                issues.append(_issue("warning", f"Biểu mẫu “{form}” của “{_label(el)}” chưa được định nghĩa", nid))
        if kind == "serviceTask":
            if el.get(f"{{{BAMBOO}}}action"):
                for problem in action_params(el)[1]:
                    issues.append(_issue("error", f"{problem} (tác vụ “{_label(el)}”)", nid))
            elif not any(el.get(f"{{{FLOWABLE}}}{a}") for a in ("class", "delegateExpression", "expression", "type")):
                issues.append(_issue("error", f"Tác vụ dịch vụ “{_label(el)}” chưa có cách thực thi", nid))
        if kind in GATEWAYS and len(incoming[nid]) == 1 and len(outgoing[nid]) == 1:
            issues.append(_issue("warning", f"Cổng “{_label(el)}” chỉ có một luồng vào và ra, không cần thiết", nid))
        if kind in ("exclusiveGateway", "inclusiveGateway") and len(outgoing[nid]) > 1:
            default = el.get("default")
            if kind == "exclusiveGateway" and not default:
                issues.append(
                    _issue("warning", f"Cổng “{_label(el)}” chưa có nhánh mặc định: không nhánh nào thỏa thì lỗi", nid)
                )
            if default and default not in {f.get("id") for f in outgoing[nid]}:
                issues.append(_issue("error", f"Nhánh mặc định của “{_label(el)}” không phải luồng ra của cổng", nid))
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
    forks = sum(len(outgoing[n]) > 1 for n, e in nodes.items() if _local(e.tag) == "parallelGateway")
    joins = sum(len(incoming[n]) > 1 for n, e in nodes.items() if _local(e.tag) == "parallelGateway")
    if forks != joins:
        issues.append(_issue("warning", f"Cổng song song: {forks} chỗ tách, {joins} chỗ gộp, có thể treo tiến trình"))
    if not proc.get("isExecutable") == "true":
        issues.append(_issue("warning", "Tiến trình chưa đánh dấu isExecutable=true (đã bật khi chạy thử)"))
    return issues


def with_process_id(xml: str, process_id: str, name: str | None = None) -> str:
    root = ET.fromstring(xml)
    proc = root.find(f"{{{BPMN}}}process")
    old = proc.get("id")
    if not root.get("targetNamespace"):
        root.set("targetNamespace", "http://bamboo.local/process")  # Flowable bắt buộc có
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


LISTENERS = {"executionListener", "taskListener", "eventListener"}


def strip_listeners(root: ET.Element) -> None:
    for parent in root.iter():
        for child in list(parent):
            if _local(child.tag) in LISTENERS:
                parent.remove(child)


def sandbox_xml(xml: str, process_id: str) -> str:
    root = ET.fromstring(with_process_id(xml, process_id))
    strip_listeners(root)
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


def _who(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    return person, tenant


def _root(conn: psycopg.Connection, tenant: str) -> str | None:
    row = conn.execute("SELECT wf.root_unit(%s)", (tenant,)).fetchone()
    return str(row[0]) if row and row[0] else None


def _can_design(conn: psycopg.Connection, person: str, tenant: str, unit: str | None) -> bool:
    """Quyền thiết kế tại đơn vị sở hữu (NULL = toàn tenant, tính tại đơn vị gốc)."""
    target = unit or _root(conn, tenant)
    if target is None:
        return False
    row = conn.execute("SELECT core.has_permission(%s, %s, %s)", (person, PERMISSION, target)).fetchone()
    return bool(row and row[0])


def _access(conn: psycopg.Connection, person: str, model_id: str) -> str | None:
    """design | review | view, hoặc None nếu người gọi không thấy quy trình này."""
    row = conn.execute("SELECT wf.process_access(%s, %s)", (person, model_id)).fetchone()
    return row[0] if row else None


def _need_design(conn: psycopg.Connection, session: dict, model_id: str) -> tuple[str, str, dict]:
    person, tenant = _who(conn, session)
    model = _model(conn, tenant, model_id, lock=True)
    if _access(conn, person, model_id) != "design":
        raise ActionError("Bạn không có quyền thiết kế quy trình của đơn vị này", "forbidden", 403)
    return person, tenant, model


def _latest(conn: psycopg.Connection, model_id: str) -> dict | None:
    return (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT version, bpmn_xml, forms, audience FROM wf.process_version
               WHERE model_id = %s ORDER BY version DESC LIMIT 1""",
            (model_id,),
        )
        .fetchone()
    )


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
    person, tenant = _who(conn, session)
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT * FROM (
                 SELECT m.id, m.process_key, m.name, m.description, m.owner_unit_id, u.name AS owner_unit,
                    to_char(m.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS updated_at,
                    (SELECT max(v.version) FROM wf.process_version v WHERE v.model_id = m.id) AS published_version,
                    (SELECT v.audience FROM wf.process_version v WHERE v.model_id = m.id
                     ORDER BY v.version DESC LIMIT 1) AS audience,
                    (SELECT r.status FROM wf.sandbox_run r WHERE r.model_id = m.id
                     ORDER BY r.started_at DESC LIMIT 1) AS last_run_status,
                    (SELECT count(*) FROM wf.sandbox_run r WHERE r.model_id = m.id)::int AS runs,
                    wf.process_access(%s, m.id) AS access
                 FROM wf.process_model m LEFT JOIN core.org_unit u ON u.id = m.owner_unit_id
                 WHERE m.tenant_id = %s) q
               WHERE access IS NOT NULL ORDER BY name""",
            (person, tenant),
        )
        .fetchall()
    )
    units = conn.execute(
        """SELECT u.id, u.name, u.path::text FROM core.org_unit u
           WHERE u.tenant_id = %s AND u.valid_period @> now() AND core.has_permission(%s, %s, u.id)
           ORDER BY u.path LIMIT 500""",
        (tenant, person, PERMISSION),
    ).fetchall()
    return {
        "can_design": bool(units),
        "design_units": [{"id": str(i), "name": n, "path": pa} for i, n, pa in units],
        "models": [
            {**r, "id": str(r["id"]), "owner_unit_id": str(r["owner_unit_id"]) if r["owner_unit_id"] else None}
            for r in rows
        ],
    }


def _change_requests(conn: psycopg.Connection, model_id: str, only: str | None) -> list[dict]:
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT c.id, c.version, c.message, c.status, c.resolution_note, p.full_name AS requested_by,
                      to_char(c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS requested_at,
                      r.full_name AS resolved_by,
                      to_char(c.resolved_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS resolved_at
               FROM wf.process_change_request c
               JOIN core.person p ON p.id = c.requested_by LEFT JOIN core.person r ON r.id = c.resolved_by
               WHERE c.model_id = %s AND (%s::uuid IS NULL OR c.requested_by = %s::uuid)
               ORDER BY c.created_at DESC LIMIT 50""",
            (model_id, only, only),
        )
        .fetchall()
    )
    return [{**r, "id": str(r["id"])} for r in rows]


def _automation(conn: psycopg.Connection, model_id: str) -> dict | None:
    from .process_automation import automation_overview  # nhập muộn: mô-đun kia nhập lại mô-đun này

    return automation_overview(conn, model_id)


def _regulations(conn: psycopg.Connection, model_id: str) -> list[dict]:
    from .process_regulation import regulations  # nhập muộn: mô-đun kia nhập lại mô-đun này

    return regulations(conn, model_id)


def process_model_get(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    m = _model(conn, tenant, args["id"])
    access = _access(conn, person, args["id"])
    if access is None:
        raise ActionError("Không tìm thấy quy trình", "not-found", 404)
    cur = conn.cursor(row_factory=dict_row)
    latest = _latest(conn, args["id"])
    unit = conn.execute("SELECT name FROM core.org_unit WHERE id = %s", (m["owner_unit_id"],)).fetchone()
    base = {
        "id": str(m["id"]),
        "process_key": m["process_key"],
        "name": m["name"],
        "description": m["description"],
        "access": access,
        "owner_unit": unit[0] if unit else None,
        "audience": latest["audience"] if latest else None,
        "viewing_version": None,
        "versions": [],
        "runs": [],
        "change_requests": [],
        "forms": [],
        "issues": [],
        "automation": None,
        "regulations": [],
    }
    if access == "view":
        # Nhân viên chỉ xem sơ đồ của phiên bản đang áp dụng
        return {**base, "bpmn_xml": latest["bpmn_xml"], "viewing_version": latest["version"]}

    versions = cur.execute(
        """SELECT v.version, v.sha256, v.note, v.audience, p.full_name AS published_by,
                  to_char(v.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS published_at
           FROM wf.process_version v JOIN core.person p ON p.id = v.published_by
           WHERE v.model_id = %s ORDER BY v.version DESC""",
        (m["id"],),
    ).fetchall()
    runs = cur.execute(
        """SELECT r.id, r.status, r.steps, r.variables, r.error, r.version, p.full_name AS started_by,
                  to_char(r.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS started_at
           FROM wf.sandbox_run r JOIN core.person p ON p.id = r.started_by
           WHERE r.model_id = %s ORDER BY r.started_at DESC LIMIT 10""",
        (m["id"],),
    ).fetchall()
    runs = [{**r, "id": str(r["id"])} for r in runs]
    if access == "review":
        return {
            **base,
            "bpmn_xml": latest["bpmn_xml"],
            "forms": latest["forms"],
            "viewing_version": latest["version"],
            "versions": versions,
            "runs": [r for r in runs if r["version"] is not None],
            "change_requests": _change_requests(conn, args["id"], person),
            "automation": _automation(conn, args["id"]),
            "regulations": _regulations(conn, args["id"]),
        }
    return {
        **base,
        "bpmn_xml": m["bpmn_xml"],
        "forms": m["forms"],
        "issues": lint(m["bpmn_xml"], m["forms"]),
        "versions": versions,
        "runs": runs,
        "change_requests": _change_requests(conn, args["id"], None),
        "automation": _automation(conn, args["id"]),
        "regulations": _regulations(conn, args["id"]),
    }


def process_model_validate(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> list[dict]:
    _who(conn, session)
    return lint(args["bpmn_xml"], _forms(args.get("forms") or []))


def process_model_save(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
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
        person, tenant, _ = _need_design(conn, session, args["id"])
        conn.execute(
            """UPDATE wf.process_model SET process_key = %s, name = %s, description = %s, bpmn_xml = %s,
                      forms = %s::jsonb, updated_by = %s, updated_at = now() WHERE id = %s""",
            (key, name, args.get("description"), xml, json.dumps(forms, ensure_ascii=False), person, args["id"]),
        )
        model_id = args["id"]
    else:
        person, tenant = _who(conn, session)
        unit = args.get("owner_unit_id")
        if unit and not conn.execute(
            "SELECT 1 FROM core.org_unit WHERE id = %s AND tenant_id = %s AND valid_period @> now()", (unit, tenant)
        ).fetchone():
            raise ActionError("Không tìm thấy đơn vị sở hữu quy trình", "not-found", 404)
        if not _can_design(conn, person, tenant, unit):
            raise ActionError(f"Cần quyền {PERMISSION} tại đơn vị này để tạo quy trình", "forbidden", 403)
        model_id = conn.execute(
            """INSERT INTO wf.process_model (tenant_id, process_key, name, description, bpmn_xml, forms, created_by,
                                             updated_by, owner_unit_id)
               VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s) RETURNING id""",
            (tenant, key, name, args.get("description"), xml, json.dumps(forms, ensure_ascii=False), person, person,
             unit),
        ).fetchone()[0]
    return {"id": str(model_id), "issues": lint(xml, forms)}


AUDIENCES = {"UNIT", "COMPANY", "GROUP"}


def process_model_publish(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant, m = _need_design(conn, session, args["id"])
    audience = str(args.get("audience") or ("UNIT" if m["owner_unit_id"] else "GROUP")).upper()
    if audience not in AUDIENCES:
        raise ActionError("Đối tượng nhận chỉ gồm UNIT (đơn vị), COMPANY (công ty) hoặc GROUP (toàn tập đoàn)")
    errors = [i for i in lint(m["bpmn_xml"], m["forms"]) if i["level"] == "error"]
    if errors:
        raise ActionError(f"Còn {len(errors)} lỗi: {errors[0]['message']}", "rejected")
    sha = hashlib.sha256(m["bpmn_xml"].encode()).hexdigest()
    last = conn.execute(
        "SELECT version, sha256, audience FROM wf.process_version WHERE model_id = %s ORDER BY version DESC LIMIT 1",
        (m["id"],),
    ).fetchone()
    if last and last[1] == sha and last[2] == audience:
        raise ActionError(f"Bản nháp giống hệt phiên bản v{last[0]} đã phát hành", "rejected")
    version = (last[0] if last else 0) + 1
    note = (args.get("note") or "").strip() or None
    conn.execute(
        """INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, note, published_by,
                                           audience)
           VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)""",
        (tenant, m["id"], version, m["bpmn_xml"], json.dumps(m["forms"], ensure_ascii=False), sha, note, person,
         audience),
    )
    notified = conn.execute(
        "SELECT wf.notify_process_published(%s, %s, %s, %s)", (m["id"], version, person, note)
    ).fetchone()[0]
    return {"id": str(m["id"]), "version": version, "sha256": sha, "audience": audience, "notified": notified}


def process_model_delete(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    _, _, m = _need_design(conn, session, args["id"])
    if conn.execute("SELECT 1 FROM wf.process_version WHERE model_id = %s LIMIT 1", (m["id"],)).fetchone():
        raise ActionError("Quy trình đã phát hành phiên bản nên không xóa được (phiên bản bất biến)", "rejected")
    conn.execute("DELETE FROM wf.process_model WHERE id = %s", (m["id"],))
    return {"id": str(m["id"])}


def process_version_get(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    m = _model(conn, tenant, args["id"])
    if _access(conn, person, args["id"]) not in ("design", "review"):
        raise ActionError("Không tìm thấy quy trình", "not-found", 404)
    row = conn.execute(
        "SELECT version, bpmn_xml, forms FROM wf.process_version WHERE model_id = %s AND version = %s",
        (m["id"], args["version"]),
    ).fetchone()
    if row is None:
        raise ActionError("Không tìm thấy phiên bản", "not-found", 404)
    return {"id": str(m["id"]), "version": row[0], "bpmn_xml": row[1], "forms": row[2]}


def process_change_request_create(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    m = _model(conn, tenant, args["id"])
    if _access(conn, person, args["id"]) not in ("review", "design"):
        raise ActionError("Chỉ người giám sát (quản lý, giám đốc) được yêu cầu sửa chữa quy trình", "forbidden", 403)
    latest = _latest(conn, args["id"])
    if latest is None:
        raise ActionError("Quy trình chưa phát hành nên chưa có gì để yêu cầu sửa", "rejected")
    message = str(args.get("message") or "").strip()
    if not 3 <= len(message) <= 2000:
        raise ActionError("Nội dung yêu cầu sửa chữa từ 3 đến 2000 ký tự")
    request_id = conn.execute(
        """INSERT INTO wf.process_change_request (tenant_id, model_id, version, requested_by, message)
           VALUES (%s, %s, %s, %s, %s) RETURNING id""",
        (tenant, m["id"], latest["version"], person, message),
    ).fetchone()[0]
    who = conn.execute("SELECT full_name FROM core.person WHERE id = %s", (person,)).fetchone()[0]
    for designer in conn.execute(
        "SELECT x FROM wf.people_with(%s, %s, %s) x", (tenant, PERMISSION, m["owner_unit_id"])
    ).fetchall():
        conn.execute(
            "SELECT collab.notify(%s, %s, 'PROCESS_CHANGE_REQUESTED', 'wf.process_model', %s, %s, %s, %s)",
            (tenant, designer[0], m["id"], f"{who} yêu cầu sửa quy trình “{m['name']}” (v{latest['version']})",
             message, person),
        )
    return {"id": str(request_id)}


def process_change_request_resolve(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    row = conn.execute(
        """SELECT model_id, requested_by, status FROM wf.process_change_request
           WHERE id = %s AND tenant_id = %s FOR UPDATE""",
        (args["id"], tenant),
    ).fetchone()
    if row is None:
        raise ActionError("Không tìm thấy yêu cầu sửa chữa", "not-found", 404)
    model_id, requester, status = row
    if _access(conn, person, str(model_id)) != "design":
        raise ActionError("Chỉ người thiết kế quy trình xử lý yêu cầu sửa chữa", "forbidden", 403)
    if status != "OPEN":
        raise ActionError("Yêu cầu này đã được xử lý", "rejected")
    outcome = "DECLINED" if str(args.get("outcome") or "RESOLVED").upper() == "DECLINED" else "RESOLVED"
    note = (args.get("note") or "").strip() or None
    conn.execute(
        """UPDATE wf.process_change_request SET status = %s, resolution_note = %s, resolved_by = %s, resolved_at = now()
           WHERE id = %s""",
        (outcome, note, person, args["id"]),
    )
    name = conn.execute("SELECT name FROM wf.process_model WHERE id = %s", (model_id,)).fetchone()[0]
    conn.execute(
        "SELECT collab.notify(%s, %s, 'PROCESS_CHANGE_RESOLVED', 'wf.process_model', %s, %s, %s, %s)",
        (tenant, requester, model_id,
         f"Yêu cầu sửa quy trình “{name}” đã được {'xử lý' if outcome == 'RESOLVED' else 'từ chối'}", note, person),
    )
    return {"id": str(args["id"])}


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


def _sandbox_inputs(raw) -> tuple[dict, dict[str, str]]:
    """Biến khởi tạo và quyết định riêng cho từng tác vụ (khóa `task_decisions`: mã tác vụ → quyết định)."""
    raw = dict(raw or {})
    per_task = raw.pop("task_decisions", None) or {}
    if not isinstance(per_task, dict) or any(str(v) not in DECISIONS for v in per_task.values()):
        raise ActionError("Quyết định theo tác vụ chỉ nhận APPROVE, REJECT hoặc RETURN")
    if len(raw) > MAX_SANDBOX_VARIABLES:
        raise ActionError(f"Tối đa {MAX_SANDBOX_VARIABLES} biến chạy thử")
    for key, value in raw.items():
        if not VARIABLE.match(key) or key in RESERVED:
            raise ActionError(f"Tên biến “{key}” không hợp lệ hoặc là tên dành riêng")
        if not isinstance(value, str | int | float | bool) or (isinstance(value, str) and len(value) > 500):
            raise ActionError(f"Biến “{key}” chỉ nhận chuỗi (≤ 500 ký tự), số hoặc đúng/sai")
    variables = {**DEFAULT_VARIABLES, **raw}
    if str(variables["decision"]) not in DECISIONS:
        raise ActionError("Quyết định mặc định chỉ nhận APPROVE, REJECT hoặc RETURN")
    return variables, {str(k): str(v) for k, v in per_task.items()}


def process_sandbox_run(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    if ctx.flowable is None:
        raise ActionError("Chưa cấu hình Flowable", "unavailable", 503)
    m = _model(conn, tenant, args["id"])
    access = _access(conn, person, args["id"])
    if access not in ("design", "review"):
        raise ActionError("Chỉ người thiết kế hoặc giám sát được chạy demo quy trình", "forbidden", 403)
    version = None
    if access == "review":
        # Người giám sát chạy demo đúng phiên bản đang áp dụng, không đụng tới bản nháp
        latest = _latest(conn, args["id"])
        if latest is None:
            raise ActionError("Quy trình chưa phát hành nên chưa chạy demo được", "rejected")
        m = {**m, "bpmn_xml": latest["bpmn_xml"], "forms": latest["forms"]}
        version = latest["version"]
    else:
        errors = [i for i in lint(m["bpmn_xml"], m["forms"]) if i["level"] == "error"]
        if errors:
            raise ActionError(f"Còn {len(errors)} lỗi — sửa trước khi chạy thử: {errors[0]['message']}", "rejected")
    variables, per_task = _sandbox_inputs(args.get("variables"))
    decision = str(variables["decision"])
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
                chosen = per_task.get(task.get("taskDefinitionKey") or "", decision)
                decisions[task["id"]] = chosen
                ctx.flowable.complete(task["id"], {"decision": chosen, "stepIndex": completed})
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
                                       started_by, finished_at, version)
           VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, now(), %s)""",
        (
            tenant,
            run_id,
            m["id"],
            hashlib.sha256(m["bpmn_xml"].encode()).hexdigest(),
            status,
            json.dumps(steps, ensure_ascii=False),
            json.dumps({**variables, **({"task_decisions": per_task} if per_task else {})}, ensure_ascii=False),
            error,
            person,
            version,
        ),
    )
    return {"id": str(run_id), "status": status, "error": error, "steps": steps}


HANDLERS = {
    "process_models": process_models,
    "process_model_get": process_model_get,
    "process_model_validate": process_model_validate,
    "process_model_save": process_model_save,
    "process_model_publish": process_model_publish,
    "process_model_delete": process_model_delete,
    "process_change_request_create": process_change_request_create,
    "process_change_request_resolve": process_change_request_resolve,
    "process_version_get": process_version_get,
    "process_sandbox_run": process_sandbox_run,
}
