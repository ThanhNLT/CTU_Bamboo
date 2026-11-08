"""Điều phối bộ nhớ (VRAM, hoặc RAM khi không có GPU) cho mô hình chính (ADR #52).

Mô hình chỉ nạp khi có việc: Ollama tự gỡ mô hình sau AI_KEEP_ALIVE, dịch vụ OCR sau OCR_IDLE_SECONDS nhàn rỗi.
Mô hình chính (mô hình sinh của tác tử, bộ OCR) không nạp cùng lúc: ai-worker là tiến trình duy nhất chạy
việc của mô hình chính, một việc một lúc, nên mô hình chính khác đang nạp luôn là mô hình nhàn rỗi và được gỡ
trước để nhường chỗ. Mô hình phụ (`AI_CPU_MODELS`, mặc định bge-m3) nhỏ, được giữ lại.

Container Ollama và OCR ngủ khi nhàn rỗi qua `sleeper` (ADR #53); container đang ngủ không giữ bộ nhớ nên không
gọi nó để gỡ mô hình, vì mọi yêu cầu qua sleeper đều đánh thức container.
"""

import logging
from collections.abc import Callable

import httpx

from bamboo_common.ollama import Ollama, OllamaUnavailable

from .ocr import OcrClient, OcrOutOfMemory, OcrUnavailable

log = logging.getLogger("gpu")


OLLAMA_SERVICE = "ollama-core"
OCR_SERVICE = "ocr-core"


def model_name(name: str) -> str:
    return name if ":" in name else f"{name}:latest"


def sleeper_awake(url: str) -> Callable[[str], bool]:
    """Hàm hỏi `GET /status` của sleeper xem container có đang chạy; không hỏi được thì coi như đang chạy."""

    def awake(service: str) -> bool:
        if not url:
            return True
        try:
            resp = httpx.get(f"{url.rstrip('/')}/status", timeout=2.0)
            resp.raise_for_status()
            return (resp.json().get(service) or {}).get("running") is not False
        except (httpx.HTTPError, ValueError):
            return True

    return awake


class Gpu:
    def __init__(
        self,
        ai: Ollama,
        ocr: OcrClient | None,
        cpu_models: tuple[str, ...] = ("bge-m3",),
        awake: Callable[[str], bool] = lambda _service: True,
    ):
        self.ai = ai
        self.ocr = ocr
        self.cpu_models = {model_name(m) for m in cpu_models}
        self.awake = awake

    def ensure_chat(self, model: str) -> bool:
        """Trước khi Ollama nạp mô hình sinh: gỡ bộ OCR và mô hình chính khác để nó có đủ chỗ (ưu tiên GPU).

        Trả True nếu mô hình sinh chưa nạp (lượt hỏi phải chờ nạp)."""
        running = self.ai.running()
        if any(model_name(m["name"]) == model_name(model) for m in running):
            return False
        log.info("chuẩn bị nạp %s: gỡ bộ OCR và các mô hình chính khác", model)
        if self.ocr is not None and self.awake(OCR_SERVICE):
            try:
                self.ocr.unload()
            except OcrUnavailable:
                pass
        for m in running:
            if model_name(m["name"]) not in self.cpu_models:
                self.ai.unload(m["name"])
        return True

    def free_for_ocr(self) -> None:
        """Gỡ mô hình chính của Ollama đang nhàn rỗi để nhường bộ nhớ cho bộ OCR."""
        if not self.awake(OLLAMA_SERVICE):
            return
        try:
            for m in self.ai.running():
                if model_name(m["name"]) not in self.cpu_models:
                    log.info("gỡ %s để chạy OCR", m["name"])
                    self.ai.unload(m["name"])
        except OllamaUnavailable:
            pass

    def recognize(self, image: bytes) -> dict:
        """OCR một trang; hết bộ nhớ thì gỡ mô hình sinh nhàn rỗi rồi thử lại một lần."""
        if self.ocr is None:
            raise RuntimeError("Chưa cấu hình dịch vụ OCR")
        try:
            return self.ocr.recognize(image)
        except OcrOutOfMemory:
            self.free_for_ocr()
            return self.ocr.recognize(image)
