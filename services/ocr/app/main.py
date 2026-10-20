# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Dịch vụ OCR tiếng Việt chỉ chạy GPU (ADR #52): `uvicorn app.main:app`.

Không trạng thái: `POST /ocr` nhận ảnh một trang, trả các dòng chữ theo thứ tự đọc; `POST /unload` gỡ mô hình
khỏi VRAM khi ai-worker cần chỗ cho mô hình sinh. Phát hiện dòng và xoay hướng bằng PaddleOCR (engine
transformers, PyTorch), nhận dạng bằng VietOCR. Không có CUDA thì thoát ngay, không bao giờ chạy CPU.
"""

import gc
import io
import logging
import os
import sys
import threading
from contextlib import asynccontextmanager

import numpy as np
import torch
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import pipeline

log = logging.getLogger("ocr")

MAX_BYTES = 30 * 1024 * 1024


def require_gpu() -> str:
    if not torch.cuda.is_available() or torch.cuda.device_count() == 0:
        log.error("Không thấy GPU CUDA: dịch vụ OCR chỉ chạy GPU (ADR #52), dừng.")
        sys.exit(1)
    return torch.cuda.get_device_name(0)


class Engine:
    """Giữ bộ mô hình trên GPU; một trang một lúc."""

    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.lock = threading.Lock()
        self.models: pipeline.Models | None = None

    def _ensure(self) -> pipeline.Models:
        if self.models is None:
            log.info("nạp mô hình OCR lên GPU")
            self.models = pipeline.load(self.models_dir, "cuda:0")
        return self.models

    def recognize(self, image: np.ndarray) -> list[dict]:
        with self.lock:
            return pipeline.recognize(self._ensure(), image)

    def unload(self) -> bool:
        with self.lock:
            had = self.models is not None
            self.models = None
            gc.collect()
            torch.cuda.empty_cache()
            return had

    def loaded(self) -> bool:
        return self.models is not None


def _out_of_memory(exc: BaseException) -> bool:
    return isinstance(exc, torch.cuda.OutOfMemoryError) or "out of memory" in str(exc).lower()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.gpu = require_gpu()
    app.state.engine = Engine(os.environ.get("OCR_MODELS_DIR", "/models"))
    try:
        await run_in_threadpool(app.state.engine._ensure)
    except Exception as exc:
        if not _out_of_memory(exc):
            raise
        log.warning("chưa nạp được mô hình OCR lúc khởi động (thiếu VRAM), sẽ nạp khi có việc")
        app.state.engine.unload()
    log.info("dịch vụ OCR chạy trên %s", app.state.gpu)
    yield


app = FastAPI(title="Bamboo OCR", lifespan=lifespan)


@app.get("/health")
def health(request: Request):
    if not torch.cuda.is_available():
        return JSONResponse({"status": "no-gpu"}, status_code=503)
    free, total = torch.cuda.mem_get_info(0)
    return {
        "status": "ok",
        "gpu": request.app.state.gpu,
        "loaded": request.app.state.engine.loaded(),
        "free_mb": free // 2**20,
        "total_mb": total // 2**20,
    }


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
    except Exception as exc:
        if _out_of_memory(exc):
            log.warning("hết VRAM khi OCR, gỡ mô hình: %s", exc)
            engine.unload()
            return JSONResponse({"error": "out of memory"}, status_code=507)
        raise
    return {"lines": lines, "text": "\n".join(line["text"] for line in lines)}


@app.post("/unload")
def unload(request: Request):
    return {"unloaded": request.app.state.engine.unload()}
