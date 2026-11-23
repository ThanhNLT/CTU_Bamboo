# Bamboo - DX-OS Open-Core
# @version 0.5.2
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

"""Tải PyTorch bản CUDA cho OCR trên máy có GPU NVIDIA (ADR #80): `python -m app.accel`.

Image `bamboo-ocr` chỉ có PyTorch bản CPU (toàn bộ là phần mềm nguồn mở). Khi `sleeper` thấy máy có GPU NVIDIA, nó chạy
lệnh này một lần trong container phụ dựng từ chính image OCR: pip tải `torch`, `torchvision` bản CUDA cùng phiên bản từ
kho của PyTorch (kèm thư viện CUDA/cuDNN dạng gói `nvidia-*`, giấy phép NVIDIA) vào volume gắn ở `OCR_ACCEL_DIR`. Lần
khởi động sau, `app.accelpath.enable()` đưa thư mục đó lên đầu `sys.path` nên OCR dùng bản CUDA.

Chỉ giữ lại gói chưa có trong image (torch, torchvision, triton, nvidia-*…); gói trùng (numpy, sympy…) bị bỏ để không
che bản của image. Đã tải đúng phiên bản thì thoát ngay. Mã thoát khác 0 thì sleeper giữ OCR chạy CPU.
"""

import importlib.metadata
import logging
import shutil
import subprocess
import sys
from pathlib import Path

from .accelpath import ACCEL_DIR, MARKER, ready, wanted

log = logging.getLogger("ocr-accel")

KEEP = {"torch", "torchvision"}


def norm(name: str) -> str:
    return name.lower().replace("_", "-").replace(".", "-")


def base_versions() -> dict[str, str]:
    """Gói có trong image (bỏ qua ACCEL_DIR)."""
    paths = [p for p in sys.path if p and Path(p).resolve() != ACCEL_DIR.resolve()]
    return {norm(d.metadata["Name"]): d.version for d in importlib.metadata.distributions(path=paths)}


def prune(target: Path, base: dict[str, str]) -> list[str]:
    """Xóa gói đã có trong image khỏi `target`; trả các gói còn lại."""
    kept = []
    for info in sorted(target.glob("*.dist-info")):
        meta = importlib.metadata.Distribution.at(info)
        name = norm(meta.metadata["Name"])
        if name in KEEP or name not in base:
            kept.append(f"{name}=={meta.version}")
            continue
        for line in (meta.read_text("RECORD") or "").splitlines():
            rel = line.split(",", 1)[0]
            path = (target / rel).resolve()
            if path.is_relative_to(target.resolve()) and path.is_file():
                path.unlink()
        shutil.rmtree(info, ignore_errors=True)
    for d in sorted(target.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    return kept


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    if ready():
        log.info("đã có PyTorch CUDA trong %s", ACCEL_DIR)
        return 0
    base = base_versions()
    want = wanted()
    marker = ACCEL_DIR / MARKER
    tmp = ACCEL_DIR / ".tmp-install"
    shutil.rmtree(tmp, ignore_errors=True)
    torch, vision, index = want.split()
    log.info("tải %s, %s từ %s (khoảng 6,6 GB, chỉ một lần)", torch, vision, index)
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "--disable-pip-version-check",
        "--target",
        str(tmp),
    ]
    if subprocess.call([*cmd, "--index-url", index, torch, vision]) != 0:
        shutil.rmtree(tmp, ignore_errors=True)
        log.error("không tải được PyTorch CUDA: OCR tiếp tục chạy CPU")
        return 1
    kept = prune(tmp, base)
    for old in ACCEL_DIR.iterdir():
        if old != tmp:
            shutil.rmtree(old) if old.is_dir() else old.unlink()
    for item in tmp.iterdir():
        item.rename(ACCEL_DIR / item.name)
    tmp.rmdir()
    marker.write_text(want + "\n")
    log.info("xong: %s", ", ".join(kept))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
