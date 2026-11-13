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

"""Chỉnh PyTorch theo thiết bị để OCR nhanh nhất mà kết quả không đổi (ADR #80).

CPU: số luồng tính toán bằng số nhân vật lý được cấp, tối đa 8, tôn trọng giới hạn CPU của container. PyTorch mặc
định lấy số luồng logic: với SMT hai luồng một nhân tranh nhau bộ tính toán, và các mô hình OCR nhỏ không chia việc được
cho nhiều hơn khoảng 8 luồng. Đo một trang trên máy 16 nhân 32 luồng: 32 luồng 7 giây, 16 luồng 3,0 giây, 8 luồng 2,5
giây, 4 luồng 3,3 giây; phần CPU còn lại để cho Ollama và các dịch vụ khác.
GPU: bật TF32 cho phép nhân và tích chập, và chạy độ chính xác hỗn hợp (float16) để nhanh hơn và ít VRAM hơn, nhường
chỗ cho mô hình của tác tử AI. `OCR_THREADS` đặt số luồng; `OCR_GPU_PRECISION=fp32` tắt float16.
"""

import logging
import math
import os

import torch

log = logging.getLogger("ocr")

MAX_THREADS = 8


def physical_cores(cpuinfo: str, allowed: set[int]) -> int:
    """Số nhân vật lý trong các CPU logic được cấp; không đọc được thì trả số CPU logic."""
    cores, cpu, package = set(), None, "0"
    for line in cpuinfo.splitlines():
        key, _, value = (part.strip() for part in line.partition(":"))
        if key == "processor":
            cpu, package = int(value), "0"
        elif key == "physical id":
            package = value
        elif key == "core id" and cpu in allowed:
            cores.add((package, value))
    return len(cores) or len(allowed)


def quota_cpus(cpu_max: str) -> float:
    """Giới hạn CPU của cgroup v2 (`cpu.max`), vô hạn khi không đặt."""
    quota, _, period = cpu_max.strip().partition(" ")
    if quota in ("", "max") or not period:
        return math.inf
    return int(quota) / int(period)


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def cpu_threads() -> int:
    configured = os.environ.get("OCR_THREADS", "").strip()
    if configured.isdigit() and int(configured) > 0:
        return int(configured)
    allowed = os.sched_getaffinity(0) if hasattr(os, "sched_getaffinity") else set(range(os.cpu_count() or 1))
    cores = physical_cores(_read("/proc/cpuinfo"), set(allowed))
    quota = quota_cpus(_read("/sys/fs/cgroup/cpu.max"))
    return max(1, min(MAX_THREADS, cores if math.isinf(quota) else min(cores, math.ceil(quota))))


def half_precision(device: str) -> bool:
    return device.startswith("cuda") and os.environ.get("OCR_GPU_PRECISION", "auto").strip().lower() != "fp32"


def apply(device: str) -> None:
    if device.startswith("cuda"):
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        log.info("GPU: TF32 bật, độ chính xác %s", "hỗn hợp (float16)" if half_precision(device) else "float32")
        return
    threads = cpu_threads()
    torch.set_num_threads(threads)
    log.info("CPU: %d luồng tính toán", threads)
