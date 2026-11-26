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
