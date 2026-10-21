# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Điều phối bộ nhớ (VRAM, hoặc RAM khi không có GPU) cho mô hình chính (ADR #52).

Mô hình chỉ nạp khi có việc: Ollama tự gỡ mô hình sau AI_KEEP_ALIVE, dịch vụ OCR sau OCR_IDLE_SECONDS nhàn rỗi.
Mô hình chính (mô hình sinh của tác tử, bộ OCR) không nạp cùng lúc: ai-worker là tiến trình duy nhất chạy
việc của mô hình chính, một việc một lúc, nên mô hình chính khác đang nạp luôn là mô hình nhàn rỗi và được gỡ
trước để nhường chỗ. Mô hình phụ (`AI_CPU_MODELS`, mặc định bge-m3) nhỏ, được giữ lại.
"""

import logging

from .ocr import OcrClient, OcrOutOfMemory, OcrUnavailable
from .ollama import Ollama, OllamaUnavailable

log = logging.getLogger("gpu")


def model_name(name: str) -> str:
    return name if ":" in name else f"{name}:latest"


class Gpu:
    def __init__(self, ai: Ollama, ocr: OcrClient | None, cpu_models: tuple[str, ...] = ("bge-m3",)):
        self.ai = ai
        self.ocr = ocr
        self.cpu_models = {model_name(m) for m in cpu_models}

    def ensure_chat(self, model: str) -> None:
        """Trước khi Ollama nạp mô hình sinh: gỡ bộ OCR và mô hình chính khác để nó có đủ chỗ (ưu tiên GPU)."""
        running = self.ai.running()
        if any(model_name(m["name"]) == model_name(model) for m in running):
            return
        log.info("chuẩn bị nạp %s: gỡ bộ OCR và các mô hình chính khác", model)
        if self.ocr is not None:
            try:
                self.ocr.unload()
            except OcrUnavailable:
                pass  # dịch vụ OCR không chạy thì không giữ bộ nhớ
        for m in running:
            if model_name(m["name"]) not in self.cpu_models:
                self.ai.unload(m["name"])

    def free_for_ocr(self) -> None:
        """Gỡ mô hình chính của Ollama đang nhàn rỗi để nhường bộ nhớ cho bộ OCR."""
        try:
            for m in self.ai.running():
                if model_name(m["name"]) not in self.cpu_models:
                    log.info("gỡ %s để chạy OCR", m["name"])
                    self.ai.unload(m["name"])
        except OllamaUnavailable:
            pass  # Ollama không chạy thì không giữ bộ nhớ

    def recognize(self, image: bytes) -> dict:
        """OCR một trang; hết bộ nhớ thì gỡ mô hình sinh nhàn rỗi rồi thử lại một lần."""
        if self.ocr is None:
            raise RuntimeError("Chưa cấu hình dịch vụ OCR")
        try:
            return self.ocr.recognize(image)
        except OcrOutOfMemory:
            self.free_for_ocr()
            return self.ocr.recognize(image)
