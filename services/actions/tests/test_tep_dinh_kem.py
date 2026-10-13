# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Tệp đính kèm (ADR #26): tải lên qua link có chữ ký, kiểm tra, quét virus, tải về, phân quyền."""

# ===== Thư viện chuẩn =====
import socket
import struct
import threading

# ===== Thư viện bên ngoài =====
import boto3  # boto3
import httpx  # HTTPX
import pytest  # pytest
from botocore.config import Config  # botocore
from botocore.exceptions import ClientError  # botocore
from fastapi.testclient import TestClient  # FastAPI

# ===== Module nội bộ =====
from app import config, main, storage
from app.common import Context
from conftest import SETTINGS, ids, pr

# ===== Hằng số & cấu hình =====
PDF = b"%PDF-1.7\n" + b"x" * 2000 + b"\n%%EOF\n"

UPLOAD = """mutation($id: uuid!, $name: String!, $type: String!, $size: Int!) {
  get_upload_url(entity_type: "proc.purchase_request", entity_id: $id, file_name: $name,
                 content_type: $type, size_bytes: $size) { attachment_id upload_url method content_type } }"""
CONFIRM = """mutation($a: uuid!) { confirm_upload(attachment_id: $a) {
  status scan_result attachment { status sha256 file_name } } }"""
DOWNLOAD = """query($a: uuid!) { get_download_url(attachment_id: $a) { url } }"""


# ===== Hàm hỗ trợ kiểm thử =====
def upload(hasura, i, pr_id, content: bytes, *, name="bao-gia.pdf", ctype="application/pdf", size=None, person="c"):
    data = hasura(
        UPLOAD,
        {"id": pr_id, "name": name, "type": ctype, "size": size or len(content)},
        person=i[person],
        tenant=i["TDX"],
    )
    assert "errors" not in data, data
    ticket = data["data"]["get_upload_url"]
    resp = httpx.put(ticket["upload_url"], content=content, headers={"Content-Type": ticket["content_type"]})
    assert resp.status_code == 200, resp.text
    return ticket["attachment_id"]


# ===== Không cần dịch vụ ngoài =====


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
    """clamd giả: trả FOUND khi nội dung chứa chuỗi kiểm thử EICAR, ngược lại OK."""
    server = socket.create_server(("127.0.0.1", 0))
    received = []

    def serve():
        while True:
            try:
                conn, _ = server.accept()
            except OSError:
                return
            with conn:
                assert conn.recv(10) == b"zINSTREAM\0"
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


# ===== SeaweedFS + Hasura thật =====


def test_tai_len_quet_tai_ve(hasura, conn, s3):
    i = ids(conn, "TDX", "c", "d", "tp_mh_dt", "a")
    pr_id = pr(conn, "tep_hasura", "c", "P_NV_MH_DT", 10_000_000)

    data = hasura(CONFIRM, {"a": "00000000-0000-0000-0000-000000000000"}, person=i["c"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-found"

    att = upload(hasura, i, pr_id, PDF, name="../../Báo giá Q4.pdf")
    data = hasura(CONFIRM, {"a": att}, person=i["tp_mh_dt"], tenant=i["TDX"])
    assert "Chỉ người tải lên" in data["errors"][0]["message"], data
    result = hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]
    assert result["status"] == "CLEAN" and result["scan_result"].startswith("bỏ qua"), result
    assert result["attachment"]["file_name"] == "Báo giá Q4.pdf"
    assert len(result["attachment"]["sha256"]) == 64
    assert s3.read_quarantine(f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}") is None, "đã rời bucket cách ly"

    # Người duyệt tải về được; người không xem được chứng từ thì không thấy tệp.
    url = hasura(DOWNLOAD, {"a": att}, person=i["tp_mh_dt"], tenant=i["TDX"])["data"]["get_download_url"]["url"]
    resp = httpx.get(url)
    assert resp.content == PDF and "filename*=UTF-8''B%C3%A1o" in resp.headers["content-disposition"]
    data = hasura(DOWNLOAD, {"a": att}, person=i["a"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-found"
    q = """query($id: uuid!) { proc_purchase_request_by_pk(id: $id) { attachments { id status } } }"""
    assert hasura(q, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["proc_purchase_request_by_pk"][
        "attachments"
    ] == [{"id": att, "status": "CLEAN"}]

    # Chỉ người tải lên xóa được; xóa xong không còn thấy.
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

    # Chưa tải lên mà xác nhận: báo lỗi, giữ PENDING để thử lại.
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

    # Khai báo PDF nhưng là tệp thực thi: bị loại và xóa khỏi bucket cách ly.
    att = upload(hasura, i, pr_id, b"MZ\x90\x00" + b"\x00" * 100)
    result = hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]
    assert result["status"] == "REJECTED" and "không khớp loại tệp" in result["scan_result"], result
    assert s3.read_quarantine(f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}") is None
    data = hasura(DOWNLOAD, {"a": att}, person=i["c"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-clean"

    # Khai báo nhỏ hơn thực tế.
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
        att = upload(hasura, i, pr_id, PDF)  # vừa đủ hạn mức
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
