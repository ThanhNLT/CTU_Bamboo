import socket
import struct
import time
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from . import config

MAX_BYTES = 25 * 1024 * 1024
UPLOAD_TTL = 900
DOWNLOAD_TTL = 300
ENTITY_TYPES = {
    "proc.purchase_request",
    "hr.onboarding_request",
    "collab.kb_document",
    "chat.conversation",
    "pm.project",
}
STATUS_ENTITY_TYPES = {"proc.purchase_request", "hr.onboarding_request", "collab.kb_document"}

_ZIP = (b"PK\x03\x04",)
ALLOWED_TYPES: dict[str, tuple[bytes, ...] | None] = {
    "application/pdf": (b"%PDF-",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _ZIP,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": _ZIP,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": _ZIP,
    "text/plain": None,
    "text/csv": None,
    "text/markdown": None,
}


def content_matches(content_type: str, data: bytes) -> bool:
    magic = ALLOWED_TYPES.get(content_type)
    if magic is None:
        return content_type in ALLOWED_TYPES and b"\x00" not in data[:8192]
    return any(data.startswith(m) for m in magic)


def content_disposition(file_name: str) -> str:
    ascii_name = file_name.encode("ascii", "replace").decode().replace('"', "").replace("?", "_")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file_name)}"


def _client(endpoint: str, access_key: str, secret_key: str, region: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=30,
            retries={"max_attempts": 2},
        ),
    )


class Storage:
    def __init__(self, settings: config.Settings):
        self.quarantine = settings.s3_quarantine_bucket
        self.documents = settings.s3_documents_bucket
        self.s3 = _client(settings.s3_endpoint, settings.s3_access_key, settings.s3_secret_key, settings.s3_region)
        self.public = _client(
            settings.s3_public_endpoint, settings.s3_access_key, settings.s3_secret_key, settings.s3_region
        )

    def upload_url(self, key: str, content_type: str) -> str:
        return self.public.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.quarantine, "Key": key, "ContentType": content_type},
            ExpiresIn=UPLOAD_TTL,
        )

    def download_url(
        self, key: str, file_name: str, content_type: str, *, inline: bool = False, ttl: int = DOWNLOAD_TTL
    ) -> str:
        disposition = content_disposition(file_name)
        if inline:
            disposition = "inline" + disposition.removeprefix("attachment")
        return self.public.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.documents,
                "Key": key,
                "ResponseContentDisposition": disposition,
                "ResponseContentType": content_type,
            },
            ExpiresIn=ttl,
        )

    def read_stored(self, key: str, limit: int = MAX_BYTES + 1) -> bytes | None:
        try:
            obj = self.s3.get_object(Bucket=self.documents, Key=key, Range=f"bytes=0-{limit - 1}")
        except ClientError as exc:
            if exc.response["Error"]["Code"] in ("NoSuchKey", "404", "InvalidRange"):
                return None
            raise
        return obj["Body"].read()

    def read_quarantine(self, key: str, limit: int = MAX_BYTES + 1) -> bytes | None:
        try:
            obj = self.s3.get_object(Bucket=self.quarantine, Key=key, Range=f"bytes=0-{limit - 1}")
        except ClientError as exc:
            if exc.response["Error"]["Code"] in ("NoSuchKey", "404", "InvalidRange"):
                return None
            raise
        return obj["Body"].read()

    def promote(self, key: str, content_type: str) -> None:
        self.s3.copy_object(
            Bucket=self.documents,
            Key=key,
            CopySource={"Bucket": self.quarantine, "Key": key},
            ContentType=content_type,
            MetadataDirective="REPLACE",
        )
        self.s3.delete_object(Bucket=self.quarantine, Key=key)

    def replace_from_quarantine(self, key: str, data: bytes, content_type: str) -> None:
        """Ghi bản đã dựng lại (CDR) vào kho chính thay cho bản gốc, rồi xóa bản gốc trong bucket kiểm dịch."""
        self.s3.put_object(Bucket=self.documents, Key=key, Body=data, ContentType=content_type)
        self.s3.delete_object(Bucket=self.quarantine, Key=key)

    def document_exists(self, key: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.documents, Key=key)
        except ClientError as exc:
            if exc.response["Error"]["Code"] in ("NoSuchKey", "404", "NotFound"):
                return False
            raise
        return True

    def put_document(self, key: str, data: bytes, content_type: str) -> None:
        self.s3.put_object(Bucket=self.documents, Key=key, Body=data, ContentType=content_type)

    def delete(self, key: str) -> None:
        for bucket in (self.quarantine, self.documents):
            self.s3.delete_object(Bucket=bucket, Key=key)


def scan(data: bytes, host: str, port: int = 3310, timeout: float = 30.0) -> tuple[str, str]:
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(b"zINSTREAM\0")
        for i in range(0, len(data), 65536):
            chunk = data[i : i + 65536]
            sock.sendall(struct.pack("!L", len(chunk)) + chunk)
        sock.sendall(struct.pack("!L", 0))
        reply = b""
        while not reply.endswith(b"\0"):
            part = sock.recv(4096)
            if not part:
                break
            reply += part
    text = reply.rstrip(b"\0").decode("utf-8", "replace")
    if text.endswith("OK"):
        return "CLEAN", text
    if text.endswith("FOUND"):
        return "INFECTED", text
    raise RuntimeError(f"ClamAV trả lời không hợp lệ: {text}")


_VERSION_CACHE: dict[tuple[str, int], tuple[float, str]] = {}


def clamav_label(host: str, port: int = 3310, timeout: float = 5.0) -> str:
    """Tên và phiên bản ClamAV kèm bản cơ sở dữ liệu mẫu, ghi vào báo cáo quét; lỗi thì chỉ ghi tên."""
    now = time.monotonic()
    cached = _VERSION_CACHE.get((host, port))
    if cached and now - cached[0] < 600:
        return cached[1]
    label = "ClamAV"
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.sendall(b"zVERSION\0")
            reply = b""
            while not reply.endswith(b"\0"):
                part = sock.recv(1024)
                if not part:
                    break
                reply += part
        text = reply.rstrip(b"\0").decode("utf-8", "replace").strip()
        if text:
            label = text
    except OSError:
        pass
    _VERSION_CACHE[(host, port)] = (now, label)
    return label


def s3_identities(settings: config.Settings) -> dict:
    app_actions = [
        f"{a}:{b}"
        for b in (settings.s3_quarantine_bucket, settings.s3_documents_bucket)
        for a in ("Read", "Write", "List", "Tagging")
    ]
    return {
        "identities": [
            {
                "name": "admin",
                "credentials": [{"accessKey": settings.s3_admin_access_key, "secretKey": settings.s3_admin_secret_key}],
                "actions": ["Admin", "Read", "Write", "List", "Tagging"],
            },
            {
                "name": "bms-app",
                "credentials": [{"accessKey": settings.s3_access_key, "secretKey": settings.s3_secret_key}],
                "actions": app_actions,
            },
            {
                "name": "bms-search",
                "credentials": [
                    {"accessKey": settings.s3_search_access_key, "secretKey": settings.s3_search_secret_key}
                ],
                "actions": [f"Read:{settings.s3_documents_bucket}"],
            },
            {
                "name": "bms-lakehouse",
                "credentials": [
                    {"accessKey": settings.s3_lakehouse_access_key, "secretKey": settings.s3_lakehouse_secret_key}
                ],
                "actions": [f"{a}:{settings.s3_lakehouse_bucket}" for a in ("Read", "Write", "List", "Tagging")],
            },
        ]
    }


def read_document(settings: config.Settings, key: str, limit: int = MAX_BYTES) -> bytes | None:
    client = _client(
        settings.s3_endpoint, settings.s3_search_access_key, settings.s3_search_secret_key, settings.s3_region
    )
    try:
        obj = client.get_object(Bucket=settings.s3_documents_bucket, Key=key, Range=f"bytes=0-{limit - 1}")
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("NoSuchKey", "404", "InvalidRange"):
            return None
        raise
    return obj["Body"].read()


def ensure_buckets(settings: config.Settings) -> list[str]:
    admin = _client(
        settings.s3_endpoint, settings.s3_admin_access_key, settings.s3_admin_secret_key, settings.s3_region
    )
    existing = {b["Name"] for b in admin.list_buckets().get("Buckets", [])}
    created = []
    for bucket in (settings.s3_quarantine_bucket, settings.s3_documents_bucket, settings.s3_lakehouse_bucket):
        if bucket not in existing:
            admin.create_bucket(Bucket=bucket)
            created.append(bucket)
    return created
