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

"""Dịch vụ OCR tiếng Việt (ADR #52): `uvicorn app.main:app`.

Không trạng thái: `POST /ocr` nhận ảnh một trang, trả các dòng chữ theo thứ tự đọc; `POST /unload` gỡ mô hình
khỏi bộ nhớ khi ai-worker cần chỗ cho mô hình sinh. Phát hiện dòng và xoay hướng bằng PaddleOCR (engine
transformers, PyTorch), nhận dạng bằng VietOCR. Mô hình chỉ nạp khi có trang cần OCR, chạy GPU CUDA nếu có,
không thì CPU, và tự gỡ sau OCR_IDLE_SECONDS không có việc.
"""

import ctypes
import gc
import io
import logging
import os
import sys
import threading
import time
from contextlib import asynccontextmanager

import numpy as np
import torch
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import pipeline, tuning

log = logging.getLogger("ocr")

MAX_BYTES = 30 * 1024 * 1024


def device() -> str:
    """GPU NVIDIA (CUDA), GPU Apple Silicon (Metal, khi OCR chạy thẳng trên macOS) hoặc CPU."""
    if torch.cuda.is_available() and torch.cuda.device_count() > 0:
        return "cuda:0"
    if os.environ.get("OCR_MPS", "auto").strip().lower() not in ("0", "false") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def device_name(dev: str) -> str:
    if dev.startswith("cuda"):
        return torch.cuda.get_device_name(0)
    return "Apple GPU (Metal)" if dev == "mps" else "CPU"


class ModelsMissing(Exception):
    """Không nạp được bộ mô hình (ocr-init chưa tải xong hoặc tệp hỏng)."""


class Engine:
    """Nạp bộ mô hình khi có việc, gỡ khi nhàn rỗi quá idle_seconds; một trang một lúc."""

    def __init__(self, models_dir: str, dev: str, idle_seconds: float = 300):
        self.models_dir = models_dir
        self.device = dev
        self.idle_seconds = idle_seconds
        self.lock = threading.Lock()
        self.models: pipeline.Models | None = None
        self.last_used = time.monotonic()
        self.half = tuning.half_precision(dev)

    def _ensure(self) -> pipeline.Models:
        if self.models is None:
            log.info("nạp mô hình OCR lên %s", self.device)
            try:
                self.models = pipeline.load(self.models_dir, self.device)
            except Exception as exc:
                if _out_of_memory(exc):
                    raise
                raise ModelsMissing(str(exc)) from exc
        return self.models

    def recognize(self, image: np.ndarray) -> list[dict]:
        with self.lock:
            try:
                models = self._ensure()
                with torch.inference_mode():
                    if self.half:
                        try:
                            with torch.autocast("cuda", dtype=torch.float16):
                                return pipeline.recognize(models, image)
                        except Exception as exc:
                            if _out_of_memory(exc):
                                raise
                            log.warning("float16 trên GPU lỗi (%s): chuyển về float32", exc)
                            self.half = False
                    return pipeline.recognize(models, image)
            finally:
                self.last_used = time.monotonic()

    def unload(self) -> bool:
        with self.lock:
            return self._unload()

    def _unload(self) -> bool:
        had = self.models is not None
        self.models = None
        gc.collect()
        if self.device.startswith("cuda"):
            torch.cuda.empty_cache()
        elif self.device == "mps":
            torch.mps.empty_cache()
        _trim_heap()
        return had

    def unload_idle(self) -> bool:
        """Gỡ mô hình khi đã nhàn rỗi quá idle_seconds; đang OCR thì bỏ qua."""
        if not self.lock.acquire(blocking=False):
            return False
        try:
            if self.models is None or time.monotonic() - self.last_used < self.idle_seconds:
                return False
            log.info("gỡ mô hình OCR sau %.0f giây nhàn rỗi", self.idle_seconds)
            return self._unload()
        finally:
            self.lock.release()

    def watch_idle(self, stop: threading.Event) -> None:
        while not stop.wait(min(self.idle_seconds, 30)):
            self.unload_idle()

    def loaded(self) -> bool:
        return self.models is not None


def _trim_heap() -> None:
    """Trả vùng heap trống cho hệ điều hành: glibc (và malloc của macOS) giữ lại bộ nhớ đã free, RSS không giảm sau khi
    gỡ mô hình."""
    try:
        if sys.platform == "darwin":
            relief = ctypes.CDLL(None).malloc_zone_pressure_relief
            relief.argtypes, relief.restype = [ctypes.c_void_p, ctypes.c_size_t], ctypes.c_size_t
            relief(None, 0)
        else:
            ctypes.CDLL("libc.so.6").malloc_trim(0)
    except (OSError, AttributeError):
        pass


def _out_of_memory(exc: BaseException) -> bool:
    return isinstance(exc, torch.cuda.OutOfMemoryError) or "out of memory" in str(exc).lower()


def warm_page_cache(models_dir: str) -> None:
    """Đọc trọng số vào page cache của hệ điều hành (không nạp mô hình): trang OCR đầu tiên không phải chờ đĩa."""
    total = 0
    try:
        for root, _dirs, files in os.walk(models_dir):
            for name in files:
                with open(os.path.join(root, name), "rb") as f:
                    while chunk := f.read(8 * 2**20):
                        total += len(chunk)
    except OSError as exc:
        log.info("đọc trước trọng số OCR dừng: %s", exc)
    log.info("đã đọc trước %d MB trọng số OCR vào page cache", total // 2**20)


@asynccontextmanager
async def lifespan(app: FastAPI):
    dev = device()
    tuning.apply(dev)
    app.state.device = device_name(dev)
    app.state.engine = Engine(
        os.environ.get("OCR_MODELS_DIR", "/models"), dev, float(os.environ.get("OCR_IDLE_SECONDS", "300"))
    )
    stop = threading.Event()
    threading.Thread(target=app.state.engine.watch_idle, args=(stop,), daemon=True).start()
    if os.environ.get("OCR_WARM_CACHE", "1").strip().lower() not in ("0", "false"):
        threading.Thread(target=warm_page_cache, args=(app.state.engine.models_dir,), daemon=True).start()
    log.info("dịch vụ OCR chạy trên %s, nạp mô hình khi có việc", app.state.device)
    yield
    stop.set()


app = FastAPI(title="Bamboo OCR", lifespan=lifespan)


@app.get("/health")
def health(request: Request):
    engine: Engine = request.app.state.engine
    body = {"status": "ok", "device": request.app.state.device, "loaded": engine.loaded()}
    if engine.device.startswith("cuda"):
        free, total = torch.cuda.mem_get_info(0)
        body |= {"free_mb": free // 2**20, "total_mb": total // 2**20}
    elif engine.device == "mps":
        body |= {"used_mb": torch.mps.driver_allocated_memory() // 2**20}
    return body


@app.post("/ocr")
async def ocr(request: Request):
    data = await request.body()
    if not data or len(data) > MAX_BYTES:
        return JSONResponse({"error": "Ảnh rỗng hoặc quá lớn"}, status_code=413)
    try:
        with Image.open(io.BytesIO(data)) as img:
            image = np.array(img.convert("RGB"))
    except OSError:
        return JSONResponse({"error": "Không đọc được ảnh"}, status_code=400)
    engine: Engine = request.app.state.engine
    try:
        lines = await run_in_threadpool(engine.recognize, image)
    except ModelsMissing as exc:
        log.error("chưa nạp được mô hình OCR (ocr-init chưa tải xong?): %s", exc)
        return JSONResponse({"error": "Chưa có mô hình OCR"}, status_code=503)
    except Exception as exc:
        if _out_of_memory(exc):
            log.warning("hết bộ nhớ khi OCR, gỡ mô hình: %s", exc)
            engine.unload()
            return JSONResponse({"error": "out of memory"}, status_code=507)
        raise
    return {"lines": lines, "text": "\n".join(line["text"] for line in lines)}


@app.post("/unload")
def unload(request: Request):
    return {"unloaded": request.app.state.engine.unload()}
