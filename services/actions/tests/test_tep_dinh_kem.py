# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

import hashlib
import io
import socket
import struct
import threading

import boto3
import httpx
import pytest
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from test_quet_tep import DOCX, MZ, ooxml, png

from app import attachments, config, main, storage
from app.common import Context
from bamboo_common import scanner
from conftest import SETTINGS, ids, pr


def _pdf() -> bytes:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(595, 842)
    writer.add_metadata({"/Title": "Báo giá Q4"})
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


PDF = _pdf()

UPLOAD = """mutation($id: uuid!, $name: String!, $type: String!, $size: Int!,
                    $entity: String! = "proc.purchase_request") {
  get_upload_url(entity_type: $entity, entity_id: $id, file_name: $name,
                 content_type: $type, size_bytes: $size) { attachment_id upload_url method content_type } }"""
CONFIRM = """mutation($a: uuid!) { confirm_upload(attachment_id: $a) {
  status scan_result attachment { status sha256 file_name } } }"""
DOWNLOAD = """query($a: uuid!) { get_download_url(attachment_id: $a) { url } }"""


def upload(
    hasura,
    i,
    pr_id,
    content: bytes,
    *,
    name="bao-gia.pdf",
    ctype="application/pdf",
    size=None,
    person="c",
    entity="proc.purchase_request",
):
    data = hasura(
        UPLOAD,
        {"id": pr_id, "name": name, "type": ctype, "size": size or len(content), "entity": entity},
        person=i[person],
        tenant=i["TDX"],
    )
    assert "errors" not in data, data
    ticket = data["data"]["get_upload_url"]
    resp = httpx.put(ticket["upload_url"], content=content, headers={"Content-Type": ticket["content_type"]})
    assert resp.status_code == 200, resp.text
    return ticket["attachment_id"]


def test_kiem_tra_noi_dung():
    assert storage.content_matches("application/pdf", PDF)
    assert not storage.content_matches("application/pdf", b"MZ\x90\x00 day la file exe")
    assert storage.content_matches("text/plain", "Báo giá".encode())
    assert not storage.content_matches("text/plain", b"\x7fELF\x00\x00")
    assert not storage.content_matches("application/x-msdownload", b"MZ")
    assert (
        storage.content_disposition('Báo giá "Q4".pdf')
        == "attachment; filename=\"B_o gi_ Q4.pdf\"; filename*=UTF-8''B%C3%A1o%20gi%C3%A1%20%22Q4%22.pdf"
    )


@pytest.fixture
def fake_clamd():
    server = socket.create_server(("127.0.0.1", 0))
    received = []

    def serve():
        while True:
            try:
                conn, _ = server.accept()
            except OSError:
                return
            with conn:
                command = conn.recv(10)
                if command.startswith(b"zVERSION"):
                    conn.sendall(b"ClamAV 1.4.99/27000/Sun Oct 25 2026\0")
                    continue
                assert command == b"zINSTREAM\0"
                data = b""
                while True:
                    size = struct.unpack("!L", conn.recv(4, socket.MSG_WAITALL))[0]
                    if size == 0:
                        break
                    data += conn.recv(size, socket.MSG_WAITALL)
                received.append(data)
                found = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE" in data
                conn.sendall(b"stream: Eicar-Test-Signature FOUND\0" if found else b"stream: OK\0")

    threading.Thread(target=serve, daemon=True).start()
    yield server.getsockname()[1], received
    server.close()


def test_clamd_instream(fake_clamd):
    port, received = fake_clamd
    assert storage.scan(PDF, "127.0.0.1", port) == ("CLEAN", "stream: OK")
    assert storage.scan(b"X5O!P%@AP EICAR-STANDARD-ANTIVIRUS-TEST-FILE!", "127.0.0.1", port)[0] == "INFECTED"
    assert received[0] == PDF


def test_tai_len_quet_tai_ve(hasura, conn, s3):
    i = ids(conn, "TDX", "c", "d", "tp_mh_dt", "a")
    pr_id = pr(conn, "tep_hasura", "c", "P_NV_MH_DT", 10_000_000)

    data = hasura(CONFIRM, {"a": "00000000-0000-0000-0000-000000000000"}, person=i["c"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-found"

    att = upload(hasura, i, pr_id, PDF, name="../../Báo giá Q4.pdf")
    data = hasura(CONFIRM, {"a": att}, person=i["tp_mh_dt"], tenant=i["TDX"])
    assert "Chỉ người tải lên" in data["errors"][0]["message"], data
    result = hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]
    assert result["status"] == "CLEAN" and result["scan_result"].startswith("Đã quét xong"), result
    row = conn.execute("SELECT scan_engines, scan_report FROM core.attachment WHERE id = %s", (att,)).fetchone()
    assert row["scan_engines"] and row["scan_engines"][0].startswith("Bamboo Scan"), "ghi rõ công cụ đã quét"
    assert row["scan_report"]["verdict"] == "CLEAN" and row["scan_report"]["checked"], row
    assert result["attachment"]["file_name"] == "Báo giá Q4.pdf"
    assert len(result["attachment"]["sha256"]) == 64
    assert s3.read_quarantine(f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}") is None, "đã rời bucket cách ly"

    url = hasura(DOWNLOAD, {"a": att}, person=i["tp_mh_dt"], tenant=i["TDX"])["data"]["get_download_url"]["url"]
    resp = httpx.get(url)
    assert resp.content.startswith(b"%PDF-") and "filename*=UTF-8''B%C3%A1o" in resp.headers["content-disposition"]
    assert hashlib.sha256(resp.content).hexdigest() == result["attachment"]["sha256"], "mã băm là của bản đã dựng lại"
    cdr_report = conn.execute("SELECT scan_report->'cdr' AS cdr FROM core.attachment WHERE id = %s", (att,)).fetchone()[
        "cdr"
    ]
    assert cdr_report["original_sha256"] == hashlib.sha256(PDF).hexdigest() and cdr_report["actions"], cdr_report
    data = hasura(DOWNLOAD, {"a": att}, person=i["a"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-found"
    q = """query($id: uuid!) { proc_purchase_request_by_pk(id: $id) { attachments { id status } } }"""
    assert hasura(q, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["proc_purchase_request_by_pk"][
        "attachments"
    ] == [{"id": att, "status": "CLEAN"}]

    delete = """mutation($a: uuid!) { delete_attachment(attachment_id: $a) { status } }"""
    assert "Chỉ người tải lên" in hasura(delete, {"a": att}, person=i["d"], tenant=i["TDX"])["errors"][0]["message"]
    assert (
        hasura(delete, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["delete_attachment"]["status"] == "DELETED"
    )
    assert (
        hasura(q, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["proc_purchase_request_by_pk"]["attachments"]
        == []
    )
    assert httpx.get(url).status_code == 404


def test_tu_choi_tep_sai(hasura, conn, s3):
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tep_sai_hasura", "c", "P_NV_MH_DT", 10_000_000)

    data = hasura(
        UPLOAD,
        {"id": pr_id, "name": "virus.exe", "type": "application/x-msdownload", "size": 10},
        person=i["c"],
        tenant=i["TDX"],
    )
    assert data["errors"][0]["extensions"]["code"] == "file-type"
    data = hasura(
        UPLOAD,
        {"id": pr_id, "name": "to.pdf", "type": "application/pdf", "size": 26 * 1024 * 1024},
        person=i["c"],
        tenant=i["TDX"],
    )
    assert data["errors"][0]["extensions"]["code"] == "file-size"

    data = hasura(
        UPLOAD,
        {"id": pr_id, "name": "a.pdf", "type": "application/pdf", "size": len(PDF)},
        person=i["c"],
        tenant=i["TDX"],
    )
    att = data["data"]["get_upload_url"]["attachment_id"]
    assert (
        hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["errors"][0]["extensions"]["code"] == "not-uploaded"
    )

    att = upload(hasura, i, pr_id, b"MZ\x90\x00" + b"\x00" * 100)
    result = hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]
    assert result["status"] == "REJECTED" and "không khớp loại tệp" in result["scan_result"], result
    assert s3.read_quarantine(f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}") is None
    data = hasura(DOWNLOAD, {"a": att}, person=i["c"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-clean"

    att = upload(hasura, i, pr_id, PDF, size=100)
    result = hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]
    assert result["status"] == "REJECTED" and "khác khai báo" in result["scan_result"], result


def test_quet_virus_tim_thay(conn, database, s3, fake_clamd, hasura):
    port, _ = fake_clamd
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tep_virus", "c", "P_NV_MH_DT", 10_000_000)
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database})
    ctx = Context(storage=s3, clamav_host="127.0.0.1", clamav_port=port)
    session = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}

    with TestClient(main.create_app(settings, ctx=ctx)) as client:

        def call(name, args):
            return client.post(
                f"/actions/{name}",
                json={"input": args, "session_variables": session},
                headers={"x-actions-secret": SETTINGS.actions_secret},
            ).json()

        for content, expected in [
            (b"%PDF-1.4 X5O!P%@AP EICAR-STANDARD-ANTIVIRUS-TEST-FILE!", "INFECTED"),
            (PDF, "CLEAN"),
        ]:
            ticket = call(
                "get_upload_url",
                {
                    "entity_type": "proc.purchase_request",
                    "entity_id": pr_id,
                    "file_name": "f.pdf",
                    "content_type": "application/pdf",
                    "size_bytes": len(content),
                },
            )
            httpx.put(ticket["upload_url"], content=content, headers={"Content-Type": "application/pdf"})
            result = call("confirm_upload", {"attachment_id": ticket["attachment_id"]})
            assert result.get("status") == expected, result
        assert (
            "Eicar-Test-Signature"
            in conn.execute(
                "SELECT scan_result FROM core.attachment WHERE status = 'INFECTED' AND entity_id = %s", (pr_id,)
            ).fetchone()["scan_result"]
        )


def test_bo_quet_noi_bo_luon_chay_truoc_khi_xac_nhan_sach(hasura, conn, s3):
    """Không cần ClamAV: tệp độc hại vẫn bị chặn, tệp sạch được ghi rõ công cụ đã quét."""
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tep_quet_noi_bo", "c", "P_NV_MH_DT", 10_000_000)
    js_pdf = b"%PDF-1.7\n1 0 obj\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n%%EOF\n"
    cases = [
        (scanner.EICAR, "text/plain", "eicar.txt", "INFECTED"),
        (js_pdf, "application/pdf", "bao-gia.pdf", "REJECTED"),
        (ooxml("docx", {"word/vbaProject.bin": b"\xd0\xcf\x11\xe0"}), DOCX, "macro.docx", "REJECTED"),
        (png(trailing=MZ), "image/png", "anh.png", "INFECTED"),
        ("Báo giá linh kiện".encode(), "text/plain", "ghi-chu.txt", "CLEAN"),
        (ooxml("docx"), DOCX, "hop-dong.docx", "CLEAN"),
    ]
    for content, ctype, name, expected in cases:
        att = upload(hasura, i, pr_id, content, name=name, ctype=ctype)
        result = hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]
        assert result["status"] == expected, (name, result)
        row = conn.execute("SELECT scan_engines, scan_report FROM core.attachment WHERE id = %s", (att,)).fetchone()
        assert row["scan_report"]["checked"], "báo cáo ghi các kiểm tra đã chạy"
        assert s3.read_quarantine(f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}") is None
        download = hasura(DOWNLOAD, {"a": att}, person=i["c"], tenant=i["TDX"])
        if expected == "CLEAN":
            assert row["scan_engines"] and result["scan_result"].startswith("Đã quét xong"), result
            assert "url" in download["data"]["get_download_url"]
        else:
            assert download["errors"][0]["extensions"]["code"] == "not-clean", "tệp không sạch không tải về được"
            assert not s3.document_exists(f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}")


def test_bat_buoc_clamav_khong_co_thi_khong_xac_nhan_sach(conn, database, s3):
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tep_bat_buoc_clam", "c", "P_NV_MH_DT", 10_000_000)
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database})
    ctx = Context(storage=s3, require_clamav=True)
    session = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}
    with TestClient(main.create_app(settings, ctx=ctx)) as client:

        def call(name, args):
            return client.post(
                f"/actions/{name}",
                json={"input": args, "session_variables": session},
                headers={"x-actions-secret": SETTINGS.actions_secret},
            )

        ticket = call(
            "get_upload_url",
            {
                "entity_type": "proc.purchase_request",
                "entity_id": pr_id,
                "file_name": "a.pdf",
                "content_type": "application/pdf",
                "size_bytes": len(PDF),
            },
        ).json()
        httpx.put(ticket["upload_url"], content=PDF, headers={"Content-Type": "application/pdf"})
        response = call("confirm_upload", {"attachment_id": ticket["attachment_id"]})
        assert response.status_code == 503 and "ClamAV" in response.json()["message"], response.text
        status = conn.execute("SELECT status FROM core.attachment WHERE id = %s", (ticket["attachment_id"],)).fetchone()
        assert status["status"] == "PENDING", "chưa quét được thì vẫn chờ, không bị coi là sạch"


def test_quet_lai_tep_cu_chua_tung_quet(conn, database, s3, hasura):
    import hashlib

    import psycopg

    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tep_quet_lai", "c", "P_NV_MH_DT", 10_000_000)
    made = {}
    for label, content in (("sach", PDF), ("doc", scanner.EICAR), ("doi", PDF)):
        key = f"{i['TDX']}/proc.purchase_request/{pr_id}/{label}"
        ctype = "application/pdf" if label != "doc" else "text/plain"
        s3.put_document(key, content if label != "doi" else PDF + b"da bi sua", ctype)
        made[label] = conn.execute(
            """INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes,
                                            storage_key, status, sha256, scan_engines, uploaded_by)
               VALUES (test.id('TDX'), 'proc.purchase_request', %s, %s, %s, %s, %s, 'CLEAN', %s, ARRAY['unscanned'], %s)
               RETURNING id""",
            (pr_id, f"{label}.pdf", ctype, len(content), key, hashlib.sha256(content).hexdigest(), i["c"]),
        ).fetchone()["id"]

    data = hasura(DOWNLOAD, {"a": str(made["sach"])}, person=i["c"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-scanned", data

    with psycopg.connect(database) as worker:
        assert attachments.rescan_unscanned(worker, s3, limit=50) >= 3
    rows = {
        k: conn.execute("SELECT status, scan_engines, scan_result FROM core.attachment WHERE id = %s", (v,)).fetchone()
        for k, v in made.items()
    }
    assert rows["sach"]["status"] == "CLEAN" and rows["sach"]["scan_engines"][0].startswith("Bamboo Scan"), rows["sach"]
    assert rows["doc"]["status"] == "INFECTED" and "Eicar" in rows["doc"]["scan_result"], rows["doc"]
    assert rows["doi"]["status"] == "REJECTED" and "mã băm" in rows["doi"]["scan_result"], rows["doi"]
    assert not s3.document_exists(f"{i['TDX']}/proc.purchase_request/{pr_id}/doc"), "tệp nhiễm bị gỡ khỏi kho"
    assert (
        "url" in hasura(DOWNLOAD, {"a": str(made["sach"])}, person=i["c"], tenant=i["TDX"])["data"]["get_download_url"]
    )


def test_khoa_ung_dung_dac_quyen_toi_thieu(s3):
    app = boto3.client(
        "s3",
        endpoint_url=SETTINGS.s3_endpoint,
        aws_access_key_id=SETTINGS.s3_access_key,
        aws_secret_access_key=SETTINGS.s3_secret_key,
        region_name=SETTINGS.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    with pytest.raises(ClientError):
        app.create_bucket(Bucket="bms-khong-duoc-tao")
    with pytest.raises(ClientError):
        app.delete_bucket(Bucket=SETTINGS.s3_documents_bucket)


def test_han_muc_dung_luong(hasura, conn, s3):
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tep_han_muc", "c", "P_NV_MH_DT", 10_000_000)
    usage = """query { drive_usage { quota_bytes used_bytes available_bytes by_type { content_type bytes files } } }"""
    before = hasura(usage, person=i["c"], tenant=i["TDX"])["data"]["drive_usage"]
    assert before["quota_bytes"] == before["used_bytes"] + before["available_bytes"]

    conn.execute(
        "UPDATE core.tenant SET storage_quota_bytes = core.storage_used(id) + %s WHERE id = %s", (len(PDF), i["TDX"])
    )
    try:
        att = upload(hasura, i, pr_id, PDF)
        assert (
            hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]["status"] == "CLEAN"
        )
        data = hasura(
            UPLOAD,
            {"id": pr_id, "name": "them.pdf", "type": "application/pdf", "size": 10},
            person=i["c"],
            tenant=i["TDX"],
        )
        assert data["errors"][0]["extensions"]["code"] == "file-quota", data
        after = hasura(usage, person=i["c"], tenant=i["TDX"])["data"]["drive_usage"]
        assert after["available_bytes"] == 0
        assert any(t["content_type"] == "application/pdf" and t["files"] >= 1 for t in after["by_type"])
    finally:
        conn.execute("UPDATE core.tenant SET storage_quota_bytes = DEFAULT WHERE id = %s", (i["TDX"],))


@pytest.mark.parametrize(
    ("doc_status", "code"), [("APPROVED", "locked"), ("CANCELLED", "locked"), ("DRAFT", "unavailable")]
)
def test_chi_xoa_tep_khi_chung_tu_chua_ket_thuc(conn, database, org, doc_status, code):
    import psycopg

    from app import attachments
    from app.common import ActionError

    k = org
    i = ids(conn, k("nv"), "TDX")
    pr_id = pr(conn, k("PR"), k("nv"), k("P_NV"), 1000, submit=False)
    att = conn.execute(
        """INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes,
                                        storage_key, status, sha256, scan_engines, uploaded_by)
           VALUES (test.id('TDX'), 'proc.purchase_request', %s, 'nham.pdf', 'application/pdf', 10, %s, 'CLEAN',
                   repeat('0', 64), ARRAY['test'], %s)
           RETURNING id""",
        (pr_id, f"thu/{pr_id}/nham.pdf", i[k("nv")]),
    ).fetchone()["id"]
    conn.execute("ALTER TABLE proc.purchase_request DISABLE TRIGGER USER")
    try:
        conn.execute("UPDATE proc.purchase_request SET status = %s WHERE id = %s", (doc_status, pr_id))
    finally:
        conn.execute("ALTER TABLE proc.purchase_request ENABLE TRIGGER USER")
    session = {"x-hasura-role": "user", "x-hasura-user-id": i[k("nv")], "x-hasura-tenant-id": i["TDX"]}
    with psycopg.connect(database) as plain, pytest.raises(ActionError) as err:
        attachments.delete_attachment(plain, session, {"attachment_id": str(att)}, Context())
    assert err.value.code == code, err.value.message
