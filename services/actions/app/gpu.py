# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Điều phối GPU cho mọi việc của mô hình chính (ADR #52).

Mô hình chính (mô hình sinh của tác tử, bộ OCR) chỉ chạy khi nằm trọn trên GPU; mô hình phụ
(`AI_CPU_MODELS`, mặc định bge-m3) để Ollama tự đặt, được lùi về CPU khi thiếu VRAM. ai-worker là
tiến trình duy nhất chạy việc của mô hình chính, một việc một lúc, nên mô hình chính khác đang nạp
luôn là mô hình nhàn rỗi: thiếu chỗ thì gỡ nó khỏi VRAM, không chuyển sang CPU.
"""

import logging

from .ocr import OcrClient, OcrOutOfMemory, OcrUnavailable
from .ollama import Ollama, OllamaUnavailable

log = logging.getLogger("gpu")


class GpuUnavailable(Exception):
    """Mô hình chính không nạp trọn được lên GPU kể cả sau khi đã gỡ các mô hình khác."""


def model_name(name: str) -> str:
    return name if ":" in name else f"{name}:latest"


class Gpu:
    def __init__(self, ai: Ollama, ocr: OcrClient | None, cpu_models: tuple[str, ...] = ("bge-m3",)):
        self.ai = ai
        self.ocr = ocr
        self.cpu_models = {model_name(m) for m in cpu_models}

    def _on_gpu(self, model: str) -> bool:
        return any(
            model_name(m["name"]) == model_name(model) and m["size"] > 0 and m["size_vram"] >= m["size"]
            for m in self.ai.running()
        )

    def ensure_chat(self, model: str) -> None:
        """Bảo đảm mô hình sinh nằm trọn trên GPU trước khi gọi; không được thì GpuUnavailable."""
        if self._on_gpu(model):
            return
        log.info("nạp %s lên GPU: gỡ bộ OCR và các mô hình Ollama khác", model)
        if self.ocr is not None:
            try:
                self.ocr.unload()
            except OcrUnavailable:
                pass  # dịch vụ OCR không chạy thì không giữ VRAM
        for m in self.ai.running():
            self.ai.unload(m["name"])
        self.ai.load(model)
        if not self._on_gpu(model):
            self.ai.unload(model)
            raise GpuUnavailable(f"{model} không nạp trọn lên GPU")

    def free_for_ocr(self) -> None:
        """Gỡ mô hình chính của Ollama đang nhàn rỗi để nhường VRAM cho bộ OCR."""
        try:
            for m in self.ai.running():
                if model_name(m["name"]) not in self.cpu_models:
                    log.info("gỡ %s khỏi VRAM để chạy OCR", m["name"])
                    self.ai.unload(m["name"])
        except OllamaUnavailable:
            pass  # Ollama không chạy thì không giữ VRAM

    def recognize(self, image: bytes) -> dict:
        """OCR một trang; thiếu VRAM thì gỡ mô hình sinh nhàn rỗi rồi thử lại một lần."""
        if self.ocr is None:
            raise RuntimeError("Chưa cấu hình dịch vụ OCR")
        try:
            return self.ocr.recognize(image)
        except OcrOutOfMemory:
            self.free_for_ocr()
            return self.ocr.recognize(image)
