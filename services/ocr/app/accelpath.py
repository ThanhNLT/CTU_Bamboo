# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Dùng PyTorch bản CUDA trong volume tăng tốc khi nó khớp phiên bản PyTorch của image (ADR #80).

`app.accel` (do sleeper chạy trên máy có GPU NVIDIA) tải torch, torchvision bản CUDA vào `OCR_ACCEL_DIR` và ghi tệp đánh
dấu phiên bản. Gói `app` gọi `enable()` trước khi nạp torch: tệp đánh dấu khớp thì thư mục đó đứng đầu `sys.path`;
volume trống hoặc của phiên bản khác (image vừa nâng cấp) thì bỏ qua, OCR chạy bằng PyTorch bản CPU có sẵn.
"""

import importlib.metadata
import os
import sys
from pathlib import Path

ACCEL_DIR = Path(os.environ.get("OCR_ACCEL_DIR", "/opt/accel"))
INDEX = os.environ.get("OCR_CUDA_INDEX", "https://download.pytorch.org/whl/cu128")
MARKER = ".bamboo-accel"


def wanted() -> str:
    """Nội dung tệp đánh dấu ứng với PyTorch của image; gọi trước `enable()` hoặc khi volume chưa bật."""
    torch = importlib.metadata.version("torch").split("+")[0]
    vision = importlib.metadata.version("torchvision").split("+")[0]
    return f"torch=={torch} torchvision=={vision} {INDEX}"


def ready() -> bool:
    marker = ACCEL_DIR / MARKER
    try:
        return marker.is_file() and marker.read_text().strip() == wanted()
    except (OSError, importlib.metadata.PackageNotFoundError):
        return False


def enable() -> bool:
    if str(ACCEL_DIR) in sys.path:
        return True
    if not ready():
        return False
    sys.path.insert(0, str(ACCEL_DIR))
    return True
