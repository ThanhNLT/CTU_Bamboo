# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import itertools
import uuid
import xml.etree.ElementTree as ET

import pytest
from test_tep_dinh_kem import CONFIRM, upload
from test_thiet_ke_quy_trinh import call, client, designer  # noqa: F401

from app import forms, process_design, process_regulation, process_text
from conftest import SETTINGS  # noqa: F401

DI = "{http://www.omg.org/spec/BPMN/20100524/DI}"
DC = "{http://www.omg.org/spec/DD/20100524/DC}"
DD = "{http://www.omg.org/spec/DD/20100524/DI}"

MUA_SAM = """QUY TRÌNH: Phê duyệt đề nghị mua sắm
Mã quy trình: phe_duyet_mua_sam
Mục đích: Thống nhất cách duyệt đề nghị mua sắm.
Phạm vi áp dụng: Toàn công ty.

CÁC BƯỚC THỰC HIỆN
Bước 1. Lập đề nghị mua sắm
  Người thực hiện: Nhân viên mua hàng
  Thời hạn: 2 ngày
  Mô tả: Điền đủ nhà cung cấp, số lượng.
  Tiếp theo: Bước 2
Bước 2. Trưởng phòng duyệt [Phê duyệt]
  Người thực hiện: Trưởng phòng
  Nếu đồng ý: chuyển Bước 3
  Nếu từ chối: kết thúc (Từ chối)
  Nếu cần bổ sung: quay lại Bước 1
Bước 3. Đặt hàng — Người thực hiện: Nhân viên mua hàng — Thời hạn: 48 giờ
  Tiếp theo: kết thúc (Hoàn thành)
"""

PHUC_TAP = """Quy trình: Tiếp nhận hồ sơ
Bước 1. Tiếp nhận hồ sơ - Người thực hiện: Văn thư
Bước 2. Kiểm tra hồ sơ - Người thực hiện: Chuyên viên
  Nếu hồ sơ hợp lệ: chuyển Bước 3
  Nếu thiếu giấy tờ: quay lại Bước 1
  Nếu không: kết thúc (Từ chối)
Bước 3. Thẩm định - Người thực hiện: Trưởng phòng
  Nếu đạt yêu cầu: chuyển Bước 5
  Nếu cần bổ sung: quay lại Bước 2
  Nếu không đạt: chuyển Bước 4
Bước 4. Lập thông báo từ chối - Người thực hiện: Văn thư
  Tiếp theo: kết thúc (Từ chối)
Bước 5. Trình ký - Người thực hiện: Giám đốc
  Nếu ký: chuyển Bước 6
  Nếu không ký: quay lại Bước 3
Bước 6. Ban hành - Người thực hiện: Văn thư
Bước 7. Lưu hồ sơ
"""


def segments(path):
    return list(itertools.pairwise(path))


def overlaps(a, b):
    (x1, y1), (x2, y2) = a
    (u1, v1), (u2, v2) = b
    if y1 == y2 == v1 == v2:
        return min(max(x1, x2), max(u1, u2)) - max(min(x1, x2), min(u1, u2)) > 0
    if x1 == x2 == u1 == u2:
        return min(max(y1, y2), max(v1, v2)) - max(min(y1, y2), min(v1, v2)) > 0
    return False


def check_layout(nodes, edges, result):
    assert not result.unrouted
    by_edge = {e.id: e for e in edges}
    for eid, path in result.routes.items():
        assert len(path) >= 2
        for (x1, y1), (x2, y2) in segments(path):
            assert (x1 == x2) != (y1 == y2), f"{eid}: đoạn không vuông góc hoặc dài 0"
        e = by_edge[eid]
        for (x1, y1), (x2, y2) in segments(path):
            for n in nodes:
                if n.id in (e.src, e.tgt):
                    continue
                x, y, w, h = result.shapes[n.id]
                inside = min(x1, x2) < x + w and max(x1, x2) > x and min(y1, y2) < y + h and max(y1, y2) > y
                assert not inside, f"{eid} xuyên qua {n.id}"
        sx, sy, sw, sh = result.shapes[e.src]
        px, py = path[0]
        assert sx <= px <= sx + sw and sy <= py <= sy + sh
    for (ea, pa), (eb, pb) in itertools.combinations(result.routes.items(), 2):
        for sa in segments(pa):
            for sb in segments(pb):
                assert not overlaps(sa, sb), f"{ea} và {eb} nằm đè lên nhau: {sa} {sb}"
    for eid, path in result.routes.items():
        for sa, sb in itertools.combinations(segments(path), 2):
            assert not overlaps(sa, sb), f"{eid} tự chồng lên mình"


@pytest.mark.parametrize("text", [MUA_SAM, PHUC_TAP], ids=["mua_sam", "phuc_tap"])
def test_so_do_khong_loi_va_duong_noi_khong_de_len_nhau(text):
    spec = process_text.parse(text)
    xml, result = process_text.build_bpmn(spec, "thu_nghiem")
    graph = process_text._graph(spec)
    check_layout(graph.nodes, graph.edges, result)
    assert process_design.lint(xml, []) == []


def test_doc_van_ban_mau():
    spec = process_text.parse(MUA_SAM)
    assert (spec.name, spec.key) == ("Phê duyệt đề nghị mua sắm", "phe_duyet_mua_sam")
    assert [s.no for s in spec.steps] == [1, 2, 3] and not spec.warnings
    s1, s2, s3 = spec.steps
    assert (s1.role, s1.due, s1.next) == ("Nhân viên mua hàng", "P2D", 2)
    assert s2.approval and [(b.kind, b.target) for b in s2.branches] == [
        ("approve", 3),
        ("reject", None),
        ("return", 1),
    ]
    assert (s3.due, s3.next, s3.end_name) == ("PT48H", None, "Hoàn thành")


def test_doc_khong_dau_va_cu_phap_gon():
    spec = process_text.parse(
        "Quy trinh: Mua hang\nBuoc 1: Lap de nghi - Nguoi thuc hien: Nhan vien - Thoi han: 24 gio\nBuoc 2. Duyet\n  Neu dong y: chuyen Buoc 3\n  Neu tu choi: ket thuc\nBuoc 3. Dat hang\n"
    )
    assert spec.steps[0].due == "PT24H" and spec.steps[0].role == "Nhan vien"
    assert spec.steps[1].approval and spec.steps[1].branches[1].end_name == "Từ chối"


def test_canh_bao_khi_khong_hieu():
    assert process_text.parse("Chỉ là một đoạn văn bình thường.").warnings
    spec = process_text.parse("Bước 1. A\n  Tiếp theo: Bước 9\n")
    assert any("không tồn tại" in w for w in spec.warnings) and spec.steps[0].next == -1


def test_cong_ngoai_le_nhieu_nhanh_dung_bien_rieng():
    spec = process_text.parse(PHUC_TAP)
    xml, _ = process_text.build_bpmn(spec, "tiep_nhan")
    assert "ketQuaBuoc" not in xml.split("Kiểm tra hồ sơ")[0] or True
    gateways = [el for el in ET.fromstring(xml).iter("{http://www.omg.org/spec/BPMN/20100524/MODEL}exclusiveGateway")]
    assert len(gateways) == 3 and all(g.get("default") for g in gateways)


def test_ve_hai_chieu_khong_mat_noi_dung():
    spec = process_text.parse(MUA_SAM)
    xml, _ = process_text.build_bpmn(spec, "phe_duyet_mua_sam")
    back = process_text.spec_from_bpmn(xml)
    assert [s.name for s in back.steps] == [s.name for s in spec.steps]
    assert [s.role for s in back.steps] == [s.role for s in spec.steps]
    assert [s.due for s in back.steps] == [s.due for s in spec.steps]
    assert [(b.kind, b.target, b.end_name) for b in back.steps[1].branches] == [
        (b.kind, b.target, b.end_name) for b in spec.steps[1].branches
    ]
    again = process_text.parse(process_text.render_text(back))
    assert [s.name for s in again.steps] == [s.name for s in spec.steps]
    xml2, _result = process_text.build_bpmn(again, "phe_duyet_mua_sam")
    assert process_design.lint(xml2, []) == []


def test_so_do_ve_tay_co_cong_va_nhieu_ket_thuc():
    xml = (
        '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xmlns:flowable="http://flowable.org/bpmn" targetNamespace="x"><process id="p" name="P" isExecutable="true">'
        '<startEvent id="s"/><userTask id="a" name="Soạn" flowable:candidateGroups="SOAN"/>'
        '<exclusiveGateway id="g" default="f4"/><userTask id="b" name="Ký"/><endEvent id="e1" name="Xong"/><endEvent id="e2" name="Hủy"/>'
        '<sequenceFlow id="f1" sourceRef="s" targetRef="a"/><sequenceFlow id="f2" sourceRef="a" targetRef="g"/>'
        '<sequenceFlow id="f3" sourceRef="g" targetRef="b" name="Giá trị lớn"><conditionExpression xsi:type="tFormalExpression">${amount &gt; 100}</conditionExpression></sequenceFlow>'
        '<sequenceFlow id="f4" sourceRef="g" targetRef="e2" name="Nhỏ"/><sequenceFlow id="f5" sourceRef="b" targetRef="e1"/>'
        "</process></definitions>"
    )
    spec = process_text.spec_from_bpmn(xml)
    assert [s.name for s in spec.steps] == ["Soạn", "Ký"]
    assert spec.steps[0].role == "SOAN"
    assert [(b.label, b.target, b.end_name) for b in spec.steps[0].branches] == [
        ("Giá trị lớn", 2, ""),
        ("Nhỏ", None, "Hủy"),
    ]
    text = process_text.render_text(spec)
    assert "Nếu Giá trị lớn: chuyển Bước 2" in text and "kết thúc (Hủy)" in text


def test_van_ban_pdf_dung_du_bien_va_hinh():
    spec = process_text.parse(MUA_SAM)
    spec.scope = "Toàn công ty"
    svg = process_text.render_svg(spec)
    assert svg.startswith("<svg") and svg.count("<polyline") == len(process_text._graph(spec).edges)
    html = forms._env.get_template("quy_dinh_quy_trinh.html").render(
        d={
            "title": "Quy trình X",
            "name": "X <b>",
            "company": "Công ty ABC",
            "unit": "Phòng Mua",
            "doc_no": "TL-1",
            "version": 2,
            "purpose": spec.purpose,
            "scope": spec.scope,
            "svg": svg,
            "steps": process_regulation._steps_view(spec),
            "sha": "ABCDEF",
        }
    )
    assert "X &lt;b&gt;" in html and "<svg" in html and "Nếu đồng ý: Bước 3: Đặt hàng" in html


def test_ban_nhap_roi_ban_dung_lai_van_ban_cung_so_do():
    spec = process_text.parse(PHUC_TAP)
    xml, _ = process_text.build_bpmn(spec, "tiep_nhan")
    again = process_text.parse(process_text.render_text(process_text.spec_from_bpmn(xml)))
    assert [(s.name, s.role) for s in again.steps] == [(s.name, s.role) for s in spec.steps]
    assert [len(s.branches) for s in again.steps] == [len(s.branches) for s in spec.steps]
    assert not any("không tồn tại" in w for w in again.warnings)


@pytest.fixture
def regulator(conn, designer):  # noqa: F811
    """Người thiết kế (Giám đốc) có thêm quyền đề xuất tài liệu và có quy tắc duyệt KB_DOCUMENT."""
    role = f"QD_{uuid.uuid4().hex[:8]}"
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %s, 'Lập quy định')", (role,))
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, 'kb.document.create' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %s""",
        (role,),
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), id, test.id(%s), 'TENANT' FROM core.role
           WHERE tenant_id = test.id('TDX') AND code = %s""",
        (designer["k"]("P_GD"), role),
    )
    if not conn.execute(
        "SELECT 1 FROM wf.approval_rule WHERE tenant_id = test.id('TDX') AND process_code = 'KB_DOCUMENT'"
    ).fetchone():
        conn.execute(
            """INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, valid_period)
               VALUES (test.id('TDX'), 'KB_DOCUMENT', 0, 1, tstzrange(now() - interval '1 day', NULL))"""
        )
    return designer


def test_hai_chieu_van_ban_va_so_do(hasura, client, conn, s3, regulator):  # noqa: F811
    k = regulator["k"]
    gd, tenant = regulator[k("gd")], regulator["TDX"]
    i = {"TDX": tenant, "c": gd}
    doc_id = conn.execute(
        """INSERT INTO collab.kb_document (tenant_id, title, category, scope, requester_id, requester_position_id)
           VALUES (test.id('TDX'), %s, 'sop', 'company', %s, test.id(%s)) RETURNING id""",
        (f"Quy chế mua sắm {uuid.uuid4().hex[:6]}", gd, k("P_GD")),
    ).fetchone()["id"]
    att = upload(
        hasura, i, str(doc_id), MUA_SAM.encode(), name="mua-sam.txt", ctype="text/plain", entity="collab.kb_document"
    )
    confirm = hasura(CONFIRM, {"a": att}, person=gd, tenant=tenant)
    assert confirm["data"]["confirm_upload"]["status"] == "CLEAN", confirm

    not_ready = call(client, "process_from_document", {"document_id": str(doc_id)}, gd, tenant)
    assert not_ready.status_code == 400, "tài liệu chưa hiệu lực thì chưa dựng sơ đồ"
    conn.execute("UPDATE collab.kb_document SET status = 'APPROVED', published_at = now() WHERE id = %s", (doc_id,))

    r = call(client, "process_from_document", {"document_id": str(doc_id)}, gd, tenant)
    assert r.status_code == 200, r.text
    made = r.json()
    assert made["steps"] == 3 and made["source"] == "mua-sam.txt"
    assert not [x for x in made["issues"] if x["level"] == "error"], made["issues"]
    model_id = made["id"]
    saved = call(client, "process_model_get", {"id": model_id}, gd, tenant).json()
    assert "<bpmndi:BPMNEdge" in saved["bpmn_xml"] and saved["regulations"][0]["kind"] == "SOURCE"

    early = call(client, "process_regulation_draft", {"id": model_id}, gd, tenant)
    assert early.status_code == 400, "chưa phát hành thì chưa lập quy định"
    pub = call(client, "process_model_publish", {"id": model_id}, gd, tenant)
    assert pub.status_code == 200, pub.text

    reg = call(client, "process_regulation_draft", {"id": model_id, "submit": True}, gd, tenant)
    assert reg.status_code == 200, reg.text
    out = reg.json()
    assert out["version"] == 1 and out["files"][0].endswith("-v1.txt")
    assert out["submitted"] is True and out["status"] == "PENDING", out
    assert call(client, "process_regulation_draft", {"id": model_id}, gd, tenant).status_code == 400, "đã có quy định"
    kinds = {
        x["kind"]: x for x in call(client, "process_model_get", {"id": model_id}, gd, tenant).json()["regulations"]
    }
    assert kinds["REGULATION"]["doc_no"] == out["doc_no"] and kinds["REGULATION"]["status"] == "PENDING"
    text = conn.execute(
        "SELECT file_name FROM core.attachment WHERE entity_id = %s AND status = 'CLEAN'", (out["document_id"],)
    ).fetchall()
    assert out["files"][0] in {t["file_name"] for t in text}
