# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

"""Văn bản quy định quy trình ⇄ sơ đồ BPMN.

Một mẫu văn bản chung cho hai chiều: đọc văn bản trong thư viện tri thức để dựng sơ đồ (`parse` → `build_bpmn`) và đọc
sơ đồ để lập văn bản quy định (`spec_from_bpmn` → `render_text`). Mẫu là văn bản thuần, người viết tay được:

    QUY TRÌNH: Phê duyệt đề nghị mua sắm
    Mã quy trình: phe_duyet_mua_sam
    Mục đích: ...
    Phạm vi áp dụng: ...

    CÁC BƯỚC THỰC HIỆN
    Bước 1. Lập đề nghị
      Người thực hiện: Nhân viên mua hàng
      Thời hạn: 2 ngày
      Mô tả: ...
      Tiếp theo: Bước 2
    Bước 2. Trưởng phòng duyệt [Phê duyệt]
      Người thực hiện: Trưởng phòng
      Nếu đồng ý: chuyển Bước 3
      Nếu từ chối: kết thúc (Từ chối)
      Nếu cần bổ sung: quay lại Bước 1
    Bước 3. Đặt hàng
      Tiếp theo: kết thúc (Hoàn thành)

Chấp nhận cả dạng gọn một dòng (`Bước 1. Lập đề nghị — Người thực hiện: Nhân viên — Thời hạn: 2 ngày`) và viết không dấu.
Không dùng mô hình học máy: chỉ đọc theo mẫu và báo cảnh báo ở chỗ không hiểu.
"""

import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from xml.sax.saxutils import escape, quoteattr

from . import bpmn_layout as lay

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
FLOWABLE_NS = "http://flowable.org/bpmn"
MAX_STEPS = 60
DEFAULT_END = "Hoàn thành"
REJECT_END = "Từ chối"


def fold(text: str) -> str:
    """Bỏ dấu, hạ chữ thường nhưng giữ nguyên độ dài để vị trí khớp với chuỗi gốc."""
    out = []
    for c in unicodedata.normalize("NFC", text).lower():
        out.append("d" if c == "đ" else unicodedata.normalize("NFD", c)[0])
    return "".join(out)


def slug(text: str, sep: str = "_", upper: bool = False, limit: int = 48) -> str:
    s = re.sub(r"[^a-z0-9]+", sep, fold(text)).strip(sep)[:limit].strip(sep)
    return s.upper() if upper else s


@dataclass
class Branch:
    label: str
    kind: str
    target: int | None
    end_name: str = ""


@dataclass
class Step:
    no: int
    name: str
    role: str = ""
    due: str = ""
    note: str = ""
    approval: bool = False
    branches: list[Branch] = field(default_factory=list)
    next: int | None = -1
    end_name: str = ""


@dataclass
class ProcessSpec:
    name: str
    key: str = ""
    purpose: str = ""
    scope: str = ""
    steps: list[Step] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


_ISO = re.compile(r"^P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?)?$")


def parse_due(text: str) -> str:
    t = fold(text).strip()
    if _ISO.match(text.strip().upper()) and text.strip().upper() not in ("P", "PT"):
        return text.strip().upper()
    m = re.search(r"(\d+)\s*(gio|h\b|tieng)", t)
    if m:
        return f"PT{int(m.group(1))}H"
    m = re.search(r"(\d+)\s*(ngay|d\b)", t)
    if m:
        return f"P{int(m.group(1))}D"
    m = re.search(r"(\d+)\s*(tuan)", t)
    if m:
        return f"P{int(m.group(1)) * 7}D"
    m = re.search(r"(\d+)\s*(phut)", t)
    if m:
        return f"PT{int(m.group(1))}M"
    return ""


def due_text(iso: str) -> str:
    m = re.match(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$", iso or "")
    if not m:
        return iso or ""
    d, h, mi = m.groups()
    parts = [f"{int(d)} ngày" if d else "", f"{int(h)} giờ" if h else "", f"{int(mi)} phút" if mi else ""]
    return " ".join(p for p in parts if p)


_STEP = re.compile(r"^\s*(?:buoc|step)\s*(\d{1,3})\s*[.):\-]\s*(\S.*)$")
_BULLET_STEP = re.compile(r"^\s*(\d{1,3})\s*[.)](?!\d)\s*(\S.*)$")
_SECTION = re.compile(
    r"^\s*(?:[ivx]+\.|\d+\.)?\s*(?:cac buoc|trinh tu|noi dung quy trinh|quy trinh thuc hien|dien giai|cac buoc thuc hien)\b"
)
_ROLE = re.compile(
    r"^(?:nguoi thuc hien|vai tro|phu trach|bo phan thuc hien|don vi thuc hien|bo phan|chuc danh)\s*:\s*(.+)$"
)
_DUE = re.compile(r"^(?:thoi han|han xu ly|thoi gian xu ly|thoi gian)\s*:\s*(.+)$")
_NOTE = re.compile(r"^(?:mo ta|noi dung|dien giai|ghi chu)\s*:\s*(.+)$")
_TYPE = re.compile(r"^(?:loai|phe duyet)\s*:\s*(.+)$")
_NEXT = re.compile(r"^(?:tiep theo|buoc ke tiep|chuyen)\s*:?\s*(.+)$")
_IF = re.compile(r"^(?:neu|khi|truong hop)\s+(.+?)\s*[:,]\s*(\S.*)$")
_ELSE = re.compile(r"^(?:(?:nguoc lai|truong hop con lai|truong hop khac)\s*[:,]?|neu khong\s*[:,])\s*(\S.*)$")
_GOTO = re.compile(r"buoc\s*(\d{1,3})")
_END = re.compile(r"\b(ket thuc|hoan tat|hoan thanh|dung lai|huy bo)\b")
_APPROVAL_NAME = re.compile(
    r"^(?:\[?phe duyet\]?|duyet|xet duyet|kiem duyet|tham dinh|ky duyet|phe chuan|kiem tra|xac nhan|thong qua)\b"
)
_META = {
    "name": re.compile(r"^(?:quy trinh|ten quy trinh)\s*:\s*(.+)$"),
    "key": re.compile(r"^(?:ma quy trinh|ma)\s*:\s*([A-Za-z_][A-Za-z0-9_-]{1,63})\s*$"),
    "purpose": re.compile(r"^(?:muc dich|muc tieu)\s*:\s*(.+)$"),
    "scope": re.compile(r"^(?:pham vi ap dung|pham vi|doi tuong ap dung)\s*:\s*(.+)$"),
}
_SPLIT = re.compile(
    r"\s+[—–|]\s+|\s+-\s+(?=(?:nguoi thuc hien|vai tro|phu trach|bo phan|don vi thuc hien|chuc danh|thoi han|"
    r"han xu ly|thoi gian|mo ta|noi dung|ghi chu|loai|phe duyet)\s*:)"
)


def classify(label: str) -> str:
    f = fold(label)
    if re.search(r"\b(tu choi|khong (dong y|duyet|dat|hop le|chap thuan|thong qua)|bac bo|loai)\b", f):
        return "reject"
    if re.search(r"\b(bo sung|tra lai|tra ve|chinh sua|sua lai|yeu cau lam lai)\b", f):
        return "return"
    if re.search(r"\b(dong y|duyet|chap thuan|dat yeu cau|dat chuan|hop le|thong qua|phe chuan)\b", f):
        return "approve"
    return "other"


def _target(action: str, label: str) -> tuple[int | None, str]:
    """(số bước, tên điểm kết thúc) của vế hành động; số bước None = kết thúc."""
    f = fold(action)
    m = _GOTO.search(f)
    if m:
        return int(m.group(1)), ""
    if _END.search(f):
        m = re.search(r"\(([^)]+)\)", action)
        name = (m.group(1).strip() if m else "") or (REJECT_END if classify(label) == "reject" else DEFAULT_END)
        return None, name[:60]
    return -1, ""


def _clean_name(text: str) -> tuple[str, bool]:
    approval = False
    m = re.search(r"\[\s*(phê duyệt|phe duyet|duyệt|duyet)\s*\]", text, re.IGNORECASE)
    if m:
        approval = True
        text = (text[: m.start()] + text[m.end() :]).strip()
    return text.strip(" .:;-—–"), approval


def parse(text: str, title: str = "") -> ProcessSpec:
    lines = [ln.rstrip() for ln in unicodedata.normalize("NFC", text).replace("\r", "").split("\n")]
    spec = ProcessSpec(name="")
    folded = [fold(ln) for ln in lines]

    explicit = [i for i, f in enumerate(folded) if re.match(r"^\s*(?:buoc|step)\s*\d{1,3}\s*[.):]\s*\S", f)]
    start_at = 0
    use_bullets = False
    if not explicit:
        for i, f in enumerate(folded):
            if _SECTION.match(f):
                start_at = i + 1
                break
        use_bullets = True

    current: Step | None = None
    ended = False
    in_steps = not use_bullets
    pending_note: list[str] = []
    for i, (ln, f) in enumerate(zip(lines, folded, strict=True)):
        line, fl = ln.strip(), f.strip()
        if not line:
            continue
        if ended:
            continue
        if explicit and spec.steps and re.match(r"^(?:[ivx]{1,4}\.|phu luc|bieu mau|ho so|tai lieu|can cu)\b", fl):
            ended = True
            continue
        if use_bullets and i < start_at:
            _meta(spec, line, fl)
            continue
        if use_bullets and i == start_at:
            in_steps = True
        step_match = (_BULLET_STEP if use_bullets else _STEP).match(f)
        if step_match and in_steps:
            if len(spec.steps) >= MAX_STEPS:
                spec.warnings.append(f"Chỉ đọc tối đa {MAX_STEPS} bước, phần còn lại bị bỏ qua")
                break
            no = int(step_match.group(1))
            head = ln[step_match.start(2) :].strip()
            current = _new_step(spec, no, head)
            continue
        if current is None:
            _meta(spec, line, fl)
            continue
        if _SECTION.match(fl) and use_bullets:
            continue
        _step_line(spec, current, line, fl, pending_note)
    if not spec.name and title.strip():
        spec.name = title.strip()
    if not spec.name:
        for ln in lines:
            if ln.strip():
                spec.name = re.sub(r"^(?i:quy\s*trình)\s*:?\s*", "", ln.strip()).strip() or ln.strip()
                break
    _finish(spec)
    return spec


def _meta(spec: ProcessSpec, line: str, fl: str) -> None:
    for field_name, rx in _META.items():
        m = rx.match(fl)
        if m:
            value = line[m.start(1) : m.end(1)].strip()
            if field_name == "name" and not spec.name:
                spec.name = value
            elif field_name == "key":
                spec.key = value
            elif field_name in ("purpose", "scope") and not getattr(spec, field_name):
                setattr(spec, field_name, value[:2000])
            return


def _new_step(spec: ProcessSpec, no: int, head: str) -> Step:
    cuts, last, pieces = [m for m in _SPLIT.finditer(fold(head))], 0, []
    for m in cuts:
        pieces.append(head[last : m.start()])
        last = m.end()
    pieces.append(head[last:])
    name, approval = _clean_name(pieces[0])
    step = Step(no=no, name=name[:200] or f"Bước {no}", approval=approval)
    for piece in pieces[1:]:
        _step_line(spec, step, piece.strip(), fold(piece).strip(), [])
    if _APPROVAL_NAME.match(fold(step.name)):
        step.approval = True
    spec.steps.append(step)
    return step


def _step_line(spec: ProcessSpec, step: Step, line: str, fl: str, _pending: list[str]) -> None:
    for rx, apply in (
        (_ROLE, lambda v: setattr(step, "role", v[:120])),
        (_DUE, lambda v: setattr(step, "due", parse_due(v))),
        (_NOTE, lambda v: setattr(step, "note", (step.note + " " + v).strip()[:1500])),
    ):
        m = rx.match(fl)
        if m:
            apply(line[m.start(1) : m.end(1)].strip())
            return
    m = _TYPE.match(fl)
    if m:
        if re.search(r"\b(co|yes|duyet|phe duyet)\b", m.group(1)):
            step.approval = True
        return
    m = _ELSE.match(fl)
    if m:
        action = line[m.start(1) : m.end(1)]
        target, end = _target(action, "")
        step.branches.append(Branch("Trường hợp còn lại", "default", target, end))
        return
    m = _IF.match(fl)
    if m:
        label = line[m.start(1) : m.end(1)].strip()
        target, end = _target(line[m.start(2) :], label)
        kind = classify(label)
        step.branches.append(Branch(label[:80], kind, target, end))
        return
    m = _NEXT.match(fl)
    if m:
        target, end = _target(line[m.start(1) :], "")
        step.next, step.end_name = target, end
        return
    if re.match(r"^(dong thoi|song song)", fl):
        spec.warnings.append(f"Bước {step.no}: chưa hỗ trợ bước song song, đọc theo thứ tự")
        return
    step.note = (step.note + " " + line).strip()[:1500]


def _finish(spec: ProcessSpec) -> None:
    seen: dict[int, int] = {}
    for st in spec.steps:
        if st.no in seen:
            spec.warnings.append(f"Trùng số bước {st.no}: giữ bước đầu tiên")
        seen.setdefault(st.no, 1)
    uniq, ids = [], set()
    for st in spec.steps:
        if st.no not in ids:
            ids.add(st.no)
            uniq.append(st)
    spec.steps = uniq
    for st in spec.steps:
        for br in st.branches:
            if br.target not in (None, -1) and br.target not in ids:
                spec.warnings.append(f"Bước {st.no}: nhánh “{br.label}” trỏ tới Bước {br.target} không tồn tại")
                br.target = -1
        if st.next not in (None, -1) and st.next not in ids:
            spec.warnings.append(f"Bước {st.no}: “Tiếp theo” trỏ tới Bước {st.next} không tồn tại")
            st.next = -1
        if st.approval and not st.branches:
            st.branches = []
        if len(st.branches) == 1 and st.branches[0].kind != "default":
            spec.warnings.append(f"Bước {st.no}: chỉ có một nhánh điều kiện, thêm nhánh còn lại để rẽ được")
    if not spec.steps:
        spec.warnings.append("Không tìm thấy bước nào: ghi mỗi bước một dòng “Bước 1. Tên bước”")
        return
    reach, queue = {spec.steps[0].no}, [0]
    while queue:
        i = queue.pop()
        st = spec.steps[i]
        nxt = [b.target for b in st.branches] if st.branches else [st.next]
        if st.approval and not st.branches:
            nxt = [-1]
        for t in nxt:
            no = spec.steps[i + 1].no if t == -1 and i + 1 < len(spec.steps) else t
            if no in ids and no not in reach:
                reach.add(no)
                queue.append(next(k for k, x in enumerate(spec.steps) if x.no == no))
    for st in spec.steps:
        if st.no not in reach:
            spec.warnings.append(f"Bước {st.no} không có bước nào dẫn tới nên sơ đồ để rời")


@dataclass
class _Built:
    nodes: list[lay.Node]
    edges: list[lay.Edge]
    tags: dict[str, dict]
    flows: dict[str, dict]


def _index_after(steps: list[Step], i: int) -> int | None:
    return steps[i + 1].no if i + 1 < len(steps) else None


def _graph(spec: ProcessSpec) -> _Built:
    steps = spec.steps
    if any(s.role for s in steps):
        for s in steps:
            s.role = s.role or "Chưa xác định"
    nodes: list[lay.Node] = []
    edges: list[lay.Edge] = []
    tags: dict[str, dict] = {}
    flows: dict[str, dict] = {}
    ends: dict[str, str] = {}
    counter = {"f": 0}

    first_lane = (steps[0].role or None) if steps else None
    nodes.append(lay.Node("start", "start", "Bắt đầu", first_lane))
    tags["start"] = {"tag": "startEvent"}

    def node_id(no: int) -> str:
        return f"buoc{no}"

    def add_flow(src: str, tgt: str, name: str = "", cond: str | None = None, default: bool = False) -> None:
        counter["f"] += 1
        fid = f"f{counter['f']}"
        edges.append(lay.Edge(fid, src, tgt, name))
        flows[fid] = {"cond": cond, "default": default, "src": src}

    def end_node(name: str, lane: str | None) -> str:
        """Mỗi nơi kết thúc một sự kiện riêng đặt sát nguồn: dùng chung một điểm kết thúc sẽ dồn đường nối về một chỗ."""
        base = "end_" + (slug(name, limit=30) or "ketthuc")
        eid, k = base, 1
        while eid in ends:
            k += 1
            eid = f"{base}_{k}"
        ends[eid] = name
        nodes.append(lay.Node(eid, "end", name, lane))
        tags[eid] = {"tag": "endEvent"}
        return eid

    def resolve(target: int | None, st: Step, i: int, end_name: str) -> str:
        if target == -1:
            target = _index_after(steps, i)
        if target is None:
            return end_node(end_name or DEFAULT_END, st.role or None)
        return node_id(target)

    for st in steps:
        nodes.append(lay.Node(node_id(st.no), "task", st.name, st.role or None))
        tags[node_id(st.no)] = {"tag": "userTask", "step": st}
    if steps:
        add_flow("start", node_id(steps[0].no))
    else:
        end = end_node(DEFAULT_END, None)
        add_flow("start", end)

    for i, st in enumerate(steps):
        me = node_id(st.no)
        branches = list(st.branches)
        if st.approval and not branches:
            prev = steps[i - 1].no if i > 0 else None
            branches = [Branch("Đồng ý", "approve", -1), Branch("Từ chối", "reject", None, REJECT_END)]
            if prev is not None:
                branches.append(Branch("Cần bổ sung", "return", prev))
        if not branches:
            add_flow(me, resolve(st.next, st, i, st.end_name))
            continue
        gid = f"g_{me}"
        nodes.append(lay.Node(gid, "gateway", "Quyết định?" if st.approval else "Rẽ nhánh?", st.role or None))
        tags[gid] = {"tag": "exclusiveGateway", "step": st}
        add_flow(me, gid)
        kinds = {b.kind for b in branches}
        decision_mode = kinds <= {"approve", "reject", "return", "default"} and kinds != {"default"}
        default_idx = next((k for k, b in enumerate(branches) if b.kind == "default"), None)
        if default_idx is None:
            default_idx = next((k for k, b in enumerate(branches) if b.kind == "return"), len(branches) - 1)
        used_values: set[str] = set()
        for k, br in enumerate(branches):
            tgt = resolve(br.target, st, i, br.end_name)
            if k == default_idx:
                add_flow(gid, tgt, br.label, None, True)
                continue
            if decision_mode and br.kind in ("approve", "reject", "return") and br.kind not in used_values:
                used_values.add(br.kind)
                add_flow(gid, tgt, br.label, f"${{decision == '{br.kind.upper()}'}}")
            else:
                add_flow(gid, tgt, br.label, f"${{ketQuaBuoc{st.no} == 'n{k + 1}'}}")
    order = ["start"]
    rest = {n.id: n for n in nodes if n.id != "start"}
    placed = {"start"}
    queue = ["start"]
    outs: dict[str, list[str]] = {}
    for e in edges:
        outs.setdefault(e.src, []).append(e.tgt)
    while queue:
        u = queue.pop(0)
        for v in outs.get(u, []):
            if v not in placed:
                placed.add(v)
                order.append(v)
                queue.append(v)
    order += [n for n in rest if n not in placed]
    ordered = [next(n for n in nodes if n.id == i) for i in order]
    return _Built(ordered, edges, tags, flows)


def _node_xml(n: lay.Node, tags: dict[str, dict]) -> str:
    meta = tags[n.id]
    tag = meta["tag"]
    name = f" name={quoteattr(n.name)}" if n.name else ""
    if tag == "userTask":
        st: Step = meta["step"]
        group = slug(st.role, upper=True) if st.role else "NGUOI_THUC_HIEN"
        extra = f' flowable:candidateGroups="{group}"'
        if st.due and _ISO.match(st.due):
            extra += f' flowable:dueDate="{st.due}"'
        doc = f"<documentation>{escape(st.note)}</documentation>" if st.note else ""
        return (
            f'<userTask id="{n.id}"{name}{extra}>{doc}</userTask>' if doc else f'<userTask id="{n.id}"{name}{extra}/>'
        )
    if tag == "exclusiveGateway":
        return f'<exclusiveGateway id="{n.id}"{name} default="{{DEFAULT:{n.id}}}"/>'
    return f'<{tag} id="{n.id}"{name}/>'


def build_bpmn(spec: ProcessSpec, key: str, name: str | None = None) -> tuple[str, lay.Layout]:
    """Dựng XML BPMN 2.0 (kèm bố cục, làn theo người thực hiện) từ bản đọc được của văn bản."""
    graph = _graph(spec)
    result = lay.layout(graph.nodes, graph.edges, "start")
    pname = name or spec.name or key
    lanes = [ln for ln, _, _ in result.lanes]
    default_of: dict[str, str] = {}
    for fid, meta in graph.flows.items():
        if meta["default"]:
            default_of[meta["src"]] = fid

    body: list[str] = []
    if lanes:
        refs = []
        for k, (lname, _, _) in enumerate(result.lanes):
            members = "".join(f"<flowNodeRef>{n.id}</flowNodeRef>" for n in graph.nodes if (n.lane or "") == lname)
            refs.append(f'<lane id="lane_{k + 1}" name={quoteattr(lname)}>{members}</lane>')
        body.append('<laneSet id="laneSet_1">' + "".join(refs) + "</laneSet>")
    for n in graph.nodes:
        xml = _node_xml(n, graph.tags)
        body.append(xml.replace("{DEFAULT:" + n.id + "}", default_of.get(n.id, "")))
    for e in graph.edges:
        meta = graph.flows[e.id]
        nm = f" name={quoteattr(e.name)}" if e.name else ""
        if meta["cond"]:
            cond = f'<conditionExpression xsi:type="tFormalExpression">{escape(meta["cond"])}</conditionExpression>'
            body.append(f'<sequenceFlow id="{e.id}" sourceRef="{e.src}" targetRef="{e.tgt}"{nm}>{cond}</sequenceFlow>')
        else:
            body.append(f'<sequenceFlow id="{e.id}" sourceRef="{e.src}" targetRef="{e.tgt}"{nm}/>')
    body = [b.replace(' default=""', "") for b in body]

    doc = f"<documentation>{escape(spec.purpose)}</documentation>" if spec.purpose else ""
    root_el = "pool" if lanes else key
    di: list[str] = []
    if lanes:
        di.append(
            f'<bpmndi:BPMNShape id="pool_di" bpmnElement="pool" isHorizontal="true">'
            f'<dc:Bounds x="{lay.POOL_X}" y="{lay.LANE_Y0}" width="{result.width - lay.POOL_X}" '
            f'height="{result.height - 2 * lay.LANE_Y0}"/></bpmndi:BPMNShape>'
        )
        for k, (_, ly, lh) in enumerate(result.lanes):
            di.append(
                f'<bpmndi:BPMNShape id="lane_{k + 1}_di" bpmnElement="lane_{k + 1}" isHorizontal="true">'
                f'<dc:Bounds x="{lay.POOL_X + lay.LABEL_W}" y="{ly}" width="{result.width - lay.POOL_X - lay.LABEL_W}" '
                f'height="{lh}"/></bpmndi:BPMNShape>'
            )
    for n in graph.nodes:
        x, y, w, h = result.shapes[n.id]
        marker = ' isMarkerVisible="true"' if n.kind == "gateway" else ""
        label = ""
        if n.id in result.node_labels:
            lx, ly2, lw, lh = result.node_labels[n.id]
            label = f'<bpmndi:BPMNLabel><dc:Bounds x="{lx}" y="{ly2}" width="{lw}" height="{lh}"/></bpmndi:BPMNLabel>'
        di.append(
            f'<bpmndi:BPMNShape id="{n.id}_di" bpmnElement="{n.id}"{marker}>'
            f'<dc:Bounds x="{x}" y="{y}" width="{w}" height="{h}"/>{label}</bpmndi:BPMNShape>'
        )
    for e in graph.edges:
        pts = "".join(f'<di:waypoint x="{x}" y="{y}"/>' for x, y in result.routes[e.id])
        label = ""
        if e.id in result.edge_labels:
            lx, ly2, lw, lh = result.edge_labels[e.id]
            label = f'<bpmndi:BPMNLabel><dc:Bounds x="{lx}" y="{ly2}" width="{lw}" height="{lh}"/></bpmndi:BPMNLabel>'
        di.append(f'<bpmndi:BPMNEdge id="{e.id}_di" bpmnElement="{e.id}">{pts}{label}</bpmndi:BPMNEdge>')

    collab = (
        f'<collaboration id="pool_collab"><participant id="pool" name={quoteattr(pname)} processRef="{key}"/></collaboration>'
        if lanes
        else ""
    )
    if lanes:
        root_el = "pool_collab"
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<definitions xmlns="{BPMN_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        f'xmlns:flowable="{FLOWABLE_NS}" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
        'targetNamespace="https://github.com/ThanhNLT/Bamboo/bpmn">'
        f"{collab}"
        f'<process id="{key}" name={quoteattr(pname)} isExecutable="true">{doc}{"".join(body)}</process>'
        f'<bpmndi:BPMNDiagram id="diagram"><bpmndi:BPMNPlane id="plane" bpmnElement="{root_el}">{"".join(di)}'
        "</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></definitions>"
    )
    return xml, result


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


TASK_KINDS = {
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
    "intermediateCatchEvent",
    "intermediateThrowEvent",
}
DECISION_LABEL = {"APPROVE": "đồng ý", "REJECT": "từ chối", "RETURN": "cần bổ sung"}


def _condition_label(flow: ET.Element, default: bool) -> tuple[str, str]:
    name = (flow.get("name") or "").strip()
    cond = flow.find(f"{{{BPMN_NS}}}conditionExpression")
    expr = (cond.text or "").strip() if cond is not None else ""
    m = re.search(r"decision\s*==\s*'(APPROVE|REJECT|RETURN)'", expr)
    if m:
        return name or DECISION_LABEL[m.group(1)], m.group(1).lower()
    if default:
        kind = classify(name) if name else "other"
        return name or "Trường hợp còn lại", kind if kind != "other" else "default"
    if name:
        return name, classify(name)
    return (re.sub(r"[${}]", "", expr).strip() or "điều kiện khác"), "other"


def _positions(root: ET.Element) -> dict[str, tuple[float, float]]:
    """Tâm (x, y) của từng phần tử theo phần vẽ BPMN DI, nếu có."""
    out: dict[str, tuple[float, float]] = {}
    for shape in root.iter("{http://www.omg.org/spec/BPMN/20100524/DI}BPMNShape"):
        b = shape.find("{http://www.omg.org/spec/DD/20100524/DC}Bounds")
        if b is not None and shape.get("bpmnElement"):
            try:
                out[shape.get("bpmnElement")] = (
                    float(b.get("x")) + float(b.get("width")) / 2,
                    float(b.get("y")) + float(b.get("height")) / 2,
                )
            except (TypeError, ValueError):
                continue
    return out


def spec_from_bpmn(xml: str, name: str = "", key: str = "", description: str = "") -> ProcessSpec:
    root = ET.fromstring(xml)
    proc = root.find(f"{{{BPMN_NS}}}process")
    if proc is None:
        raise ValueError("Không có tiến trình trong tệp BPMN")
    nodes = {el.get("id"): el for el in proc if el.get("id") and _local(el.tag) not in ("sequenceFlow", "laneSet")}
    flows = [el for el in proc if _local(el.tag) == "sequenceFlow"]
    out: dict[str, list[ET.Element]] = {}
    for f in flows:
        out.setdefault(f.get("sourceRef"), []).append(f)
    lane_of: dict[str, str] = {}
    for lane in proc.iter(f"{{{BPMN_NS}}}lane"):
        for ref in lane.findall(f"{{{BPMN_NS}}}flowNodeRef"):
            lane_of[(ref.text or "").strip()] = (lane.get("name") or "").strip()

    spec = ProcessSpec(
        name=name or proc.get("name") or proc.get("id") or "",
        key=key or proc.get("id") or "",
        purpose=description or "",
    )
    doc = proc.find(f"{{{BPMN_NS}}}documentation")
    if doc is not None and (doc.text or "").strip() and not spec.purpose:
        spec.purpose = doc.text.strip()

    starts = [i for i, el in nodes.items() if _local(el.tag) == "startEvent"]
    numbering: dict[str, int] = {}
    order: list[str] = []

    def advance(fid_target: str, seen: set[str]) -> list[str]:
        """Đi qua các cổng để ra danh sách phần tử đích (nhiệm vụ/kết thúc)."""
        el = nodes.get(fid_target)
        if el is None:
            return []
        if _local(el.tag) in TASK_KINDS or _local(el.tag) == "endEvent":
            return [fid_target]
        if fid_target in seen:
            return []
        seen = seen | {fid_target}
        res: list[str] = []
        for f in out.get(fid_target, []):
            res += advance(f.get("targetRef"), seen)
        return res

    queue: list[str] = []
    for s in starts:
        for f in out.get(s, []):
            queue += advance(f.get("targetRef"), set())
    seen_nodes: set[str] = set()
    reached: list[str] = []
    while queue:
        nid = queue.pop(0)
        if nid in seen_nodes:
            continue
        seen_nodes.add(nid)
        el = nodes[nid]
        if _local(el.tag) == "endEvent":
            continue
        reached.append(nid)
        for f in out.get(nid, []):
            queue += advance(f.get("targetRef"), set())
    pos = _positions(root)
    if reached and all(n in pos for n in reached):
        rank = {n: i for i, n in enumerate(reached)}
        reached.sort(key=lambda n: (round(pos[n][0] / 130), pos[n][1], rank[n]))
    for nid in reached:
        order.append(nid)
        numbering[nid] = len(order)
    if not order:
        spec.warnings.append("Sơ đồ chưa có bước nào sau sự kiện bắt đầu")

    def end_name(nid: str) -> str:
        return (nodes[nid].get("name") or "").strip() or DEFAULT_END

    for nid in order:
        el = nodes[nid]
        kind = _local(el.tag)
        st = Step(no=numbering[nid], name=(el.get("name") or nid).strip())
        st.role = (
            lane_of.get(nid)
            or (el.get(f"{{{FLOWABLE_NS}}}candidateGroups") or el.get(f"{{{FLOWABLE_NS}}}assignee") or "").strip()
        )
        st.due = (el.get(f"{{{FLOWABLE_NS}}}dueDate") or "").strip()
        if st.due and not _ISO.match(st.due):
            st.due = ""
        d = el.find(f"{{{BPMN_NS}}}documentation")
        if d is not None and (d.text or "").strip():
            st.note = d.text.strip()
        if kind in ("serviceTask", "scriptTask", "sendTask", "businessRuleTask") and not st.role:
            st.role = "Hệ thống (tự động)"
        outs = out.get(nid, [])
        first_hops = [(f, nodes.get(f.get("targetRef"))) for f in outs]
        gate = None
        if (
            len(first_hops) == 1
            and first_hops[0][1] is not None
            and _local(first_hops[0][1].tag)
            in (
                "exclusiveGateway",
                "inclusiveGateway",
            )
        ):
            gate = first_hops[0][1]
        if gate is not None:
            gflows = out.get(gate.get("id"), [])
            if len(gflows) > 1:
                default = gate.get("default")
                for gf in gflows:
                    label, bkind = _condition_label(gf, gf.get("id") == default)
                    tgts = advance(gf.get("targetRef"), set())
                    tgt = tgts[0] if tgts else None
                    if tgt is None:
                        br = Branch(label, bkind, None, DEFAULT_END)
                    elif _local(nodes[tgt].tag) == "endEvent":
                        br = Branch(label, bkind, None, end_name(tgt))
                    else:
                        br = Branch(label, bkind, numbering.get(tgt))
                    st.branches.append(br)
                st.approval = any(b.kind in ("approve", "reject", "return") for b in st.branches) or kind == "userTask"
                spec.steps.append(st)
                continue
        targets = []
        for f in outs:
            targets += advance(f.get("targetRef"), set())
        if len(outs) > 1 and any(
            _local(nodes[f.get("targetRef")].tag) == "parallelGateway" for f in outs if f.get("targetRef") in nodes
        ):
            spec.warnings.append(f"Bước {st.no}: có cổng song song, văn bản ghi tuần tự theo thứ tự đọc")
        if not targets:
            st.next, st.end_name = None, DEFAULT_END
        else:
            t = targets[0]
            if _local(nodes[t].tag) == "endEvent":
                st.next, st.end_name = None, end_name(t)
            else:
                st.next = numbering.get(t)
        spec.steps.append(st)
    for nid, el in nodes.items():
        if _local(el.tag) in TASK_KINDS and nid not in numbering:
            spec.warnings.append(
                f"“{el.get('name') or nid}” không đi tới được từ sự kiện bắt đầu nên không ghi vào văn bản"
            )
    return spec


def _target_text(no: int | None, end_name: str, steps: dict[int, Step], action: str = "chuyển") -> str:
    if no is None:
        return f"kết thúc ({end_name or DEFAULT_END})"
    return f"{action} Bước {no}"


def render_text(spec: ProcessSpec) -> str:
    """Văn bản mẫu, đọc lại được bằng `parse` (mỗi bước ghi rõ bước kế tiếp)."""
    steps = {s.no: s for s in spec.steps}
    lines = [f"QUY TRÌNH: {spec.name}"]
    if spec.key:
        lines.append(f"Mã quy trình: {spec.key}")
    if spec.purpose:
        lines.append(f"Mục đích: {spec.purpose}")
    if spec.scope:
        lines.append(f"Phạm vi áp dụng: {spec.scope}")
    lines += ["", "CÁC BƯỚC THỰC HIỆN", ""]
    for i, s in enumerate(spec.steps):
        lines.append(f"Bước {s.no}. {s.name}" + (" [Phê duyệt]" if s.approval else ""))
        if s.role:
            lines.append(f"  Người thực hiện: {s.role}")
        if s.due:
            lines.append(f"  Thời hạn: {due_text(s.due)}")
        if s.note:
            lines.append(f"  Mô tả: {s.note}")
        if s.branches:
            for b in s.branches:
                tgt = b.target
                if tgt == -1:
                    tgt = spec.steps[i + 1].no if i + 1 < len(spec.steps) else None
                action = _target_text(
                    tgt,
                    b.end_name,
                    steps,
                    "quay lại" if b.kind == "return" and tgt is not None and tgt <= s.no else "chuyển",
                )
                if b.kind == "default":
                    lines.append(f"  Nếu không: {action}")
                else:
                    lines.append(f"  Nếu {b.label}: {action}")
        else:
            nxt = s.next
            if nxt == -1:
                nxt = spec.steps[i + 1].no if i + 1 < len(spec.steps) else None
            lines.append(f"  Tiếp theo: {f'Bước {nxt}' if nxt is not None else _target_text(None, s.end_name, steps)}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _wrap(text: str, width: int, lines: int) -> list[str]:
    out: list[str] = []
    cur = ""
    for word in text.split():
        if cur and len(cur) + 1 + len(word) > width:
            out.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        out.append(cur)
    if len(out) > lines:
        out = out[:lines]
        out[-1] = out[-1][: max(0, width - 1)] + "…"
    return out


def render_svg(spec: ProcessSpec) -> str:
    """Sơ đồ dạng SVG (cùng bố cục với BPMN dựng từ văn bản) để nhúng vào văn bản quy định."""
    graph = _graph(spec)
    res = lay.layout(graph.nodes, graph.edges, "start")
    out = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {res.width} {res.height}" role="img" '
            'font-family="DejaVu Sans, Arial, sans-serif" font-size="12">'
        ),
        (
            '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            'orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#222"/></marker></defs>'
        ),
    ]
    if res.lanes:
        out.append(
            f'<rect x="{lay.POOL_X}" y="{lay.LANE_Y0}" width="{res.width - lay.POOL_X - 10}" '
            f'height="{res.height - 2 * lay.LANE_Y0}" fill="none" stroke="#777"/>'
        )
        for name, y, h in res.lanes:
            out.append(
                f'<rect x="{lay.POOL_X}" y="{y}" width="{res.width - lay.POOL_X - 10}" height="{h}" fill="none" stroke="#777"/>'
                f'<rect x="{lay.POOL_X}" y="{y}" width="{lay.LABEL_W}" height="{h}" fill="#f1f3f5" stroke="#777"/>'
                f'<text transform="translate({lay.POOL_X + 19},{y + h / 2}) rotate(-90)" text-anchor="middle">{escape(name)}</text>'
            )
    for e in graph.edges:
        pts = " ".join(f"{x},{y}" for x, y in res.routes[e.id])
        out.append(f'<polyline points="{pts}" fill="none" stroke="#222" stroke-width="1.4" marker-end="url(#arr)"/>')
    for n in graph.nodes:
        x, y, w, h = res.shapes[n.id]
        if n.kind == "task":
            out.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="#eef4ff" stroke="#1a56db" stroke-width="1.6"/>'
            )
            rows = _wrap(n.name, 24, 4)
            top = y + h / 2 - (len(rows) - 1) * 7.5
            out.append(
                f'<text x="{x + w / 2}" y="{top}" text-anchor="middle" dominant-baseline="middle">'
                + "".join(
                    f'<tspan x="{x + w / 2}" dy="{0 if i == 0 else 15}">{escape(r)}</tspan>' for i, r in enumerate(rows)
                )
                + "</text>"
            )
        elif n.kind == "gateway":
            out.append(
                f'<polygon points="{x + w / 2},{y} {x + w},{y + h / 2} {x + w / 2},{y + h} {x},{y + h / 2}" '
                'fill="#fff7d6" stroke="#b7791f" stroke-width="1.6"/>'
                f'<path d="M{x + 17},{y + 17}L{x + 33},{y + 33}M{x + 33},{y + 17}L{x + 17},{y + 33}" stroke="#b7791f" stroke-width="2"/>'
            )
        else:
            fill, width = ("#d1fae5", 1.6) if n.kind == "start" else ("#fee2e2", 3.2)
            out.append(
                f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="{w / 2}" fill="{fill}" stroke="#222" stroke-width="{width}"/>'
            )
        if n.id in res.node_labels:
            lx, ly, lw, _ = res.node_labels[n.id]
            out.append(
                f'<text x="{lx + lw / 2}" y="{ly + 11}" text-anchor="middle" font-size="11">{escape(n.name)}</text>'
            )
    for e in graph.edges:
        if e.id in res.edge_labels:
            lx, ly, lw, _lh = res.edge_labels[e.id]
            out.append(f'<text x="{lx}" y="{ly + 12}" font-size="11" fill="#0b5cad">{escape(e.name)}</text>')
    out.append("</svg>")
    return "".join(out)
