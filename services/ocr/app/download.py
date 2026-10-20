# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Job ocr-init (ADR #52): tải trọng số PaddleOCR và VietOCR vào volume lần đầu: `python -m app.download`.

Sau lần đầu dịch vụ OCR chạy không cần Internet. Nạp thử bộ mô hình trên GPU để kiểm tệp tải về dùng được.
"""

import hashlib
import logging
import os
import sys
import time

import requests

from . import pipeline
from .main import require_gpu

log = logging.getLogger("ocr-init")

VIETOCR_URL = "https://vocr.vn/data/vietocr/"
VIETOCR_SHA256 = {
    "base.yml": "9c8283fadb950f06f5d3400475f80d5355700ff315c9c48b7875e6ea66647d1c",
    "vgg-transformer.yml": "0df9feee197754c7381871e5dfd07c6f3e292a4853eece6f1af240923e57c907",
    "vgg_transformer.pth": "380512193a8b6cbf6fad80deacdc9b6939d10d473d199892fc6408d13775ea59",
}
ATTEMPTS = 10


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url: str, path: str, digest: str) -> None:
    """Tải có nối tiếp (máy chủ VietOCR chậm, hay đứt giữa chừng), kiểm sha256 rồi mới đổi tên."""
    if os.path.exists(path) and sha256(path) == digest:
        return
    part = path + ".part"
    for attempt in range(1, ATTEMPTS + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        try:
            with requests.get(url, stream=True, timeout=60, headers={"Range": f"bytes={have}-"} if have else {}) as r:
                r.raise_for_status()
                with open(part, "ab" if r.status_code == 206 else "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            break
        except requests.RequestException as exc:
            log.warning("tải %s lỗi (lần %s/%s): %s", url, attempt, ATTEMPTS, exc)
            time.sleep(min(5 * attempt, 30))
    else:
        sys.exit(f"Không tải được {url}")
    if (got := sha256(part)) != digest:
        os.remove(part)
        sys.exit(f"{url}: sha256 {got} không khớp {digest}")
    os.replace(part, path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    log.info("GPU: %s", require_gpu())
    models_dir = os.environ.get("OCR_MODELS_DIR", "/models")
    folder = os.path.join(models_dir, "vietocr")
    os.makedirs(folder, exist_ok=True)
    for name, remote in pipeline.VIETOCR_FILES.items():
        fetch(VIETOCR_URL + remote, os.path.join(folder, name), VIETOCR_SHA256[name])
    pipeline.load(models_dir, "cuda:0")
    log.info("đã có đủ mô hình OCR trong %s", models_dir)


if __name__ == "__main__":
    main()
