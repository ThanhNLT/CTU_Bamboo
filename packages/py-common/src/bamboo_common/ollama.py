# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Gọi Ollama cục bộ (ADR #51): danh mục mô hình, embedding, sinh câu trả lời qua API tương thích OpenAI."""

import json
from collections.abc import Iterator
from dataclasses import dataclass

import httpx

WAKE_SECONDS = 25.0


class OllamaUnavailable(Exception):
    def __init__(self, message: str, transient: bool = True):
        super().__init__(message)
        self.transient = transient


@dataclass
class Delta:
    content: str = ""
    thinking: str = ""
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    finish_reason: str | None = None


class Ollama:
    def __init__(self, url: str, timeout: float = 300.0):
        self.url = url.rstrip("/")
        self.http = httpx.Client(base_url=self.url, timeout=timeout)

    def _post(self, path: str, body: dict) -> dict:
        try:
            resp = self.http.post(path, json=body)
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(f"Ollama không truy cập được: {exc}") from exc
        if resp.status_code >= 400:
            raise OllamaUnavailable(f"Ollama {path}: {resp.status_code} {resp.text[:300]}", resp.status_code >= 500)
        return resp.json()

    def models(self, timeout: float = 2.0) -> list[dict]:
        try:
            resp = self.http.get("/api/tags", timeout=timeout)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(f"Ollama không truy cập được: {exc}") from exc
        return [
            {"name": m["name"], "size_bytes": m.get("size"), "family": (m.get("details") or {}).get("family")}
            for m in resp.json().get("models", [])
        ]

    def running(self) -> list[dict]:
        """Mô hình đang nạp: tên, tổng dung lượng và phần nằm trên VRAM (`/api/ps`)."""
        try:
            resp = self.http.get("/api/ps", timeout=5.0)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(f"Ollama không truy cập được: {exc}") from exc
        return [
            {"name": m["name"], "size": m.get("size") or 0, "size_vram": m.get("size_vram") or 0}
            for m in resp.json().get("models", [])
        ]

    def unload(self, model: str) -> None:
        """Gỡ mô hình khỏi bộ nhớ; mô hình embedding không nhận /api/generate nên gỡ qua /api/embed."""
        try:
            self._post("/api/generate", {"model": model, "keep_alive": 0, "stream": False})
        except OllamaUnavailable as exc:
            if exc.transient:
                raise
            self._post("/api/embed", {"model": model, "input": [], "keep_alive": 0})

    def warm(self, model: str) -> None:
        """Nạp mô hình vào bộ nhớ mà không sinh gì (yêu cầu rỗng), để chạy song song với việc khác."""
        self._post("/api/generate", {"model": model, "stream": False})

    def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._post("/api/embed", {"model": model, "input": texts})["embeddings"]
        if len(vectors) != len(texts):
            raise OllamaUnavailable(f"Ollama trả {len(vectors)} vector cho {len(texts)} đoạn")
        return vectors

    def chat(
        self, model: str, messages: list[dict], *, think: bool = False, max_tokens: int = 1024, json_mode: bool = False
    ) -> Iterator[Delta]:
        body = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        if not think:
            body["reasoning_effort"] = "none"
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        try:
            with self.http.stream("POST", "/v1/chat/completions", json=body) as resp:
                if resp.status_code >= 400:
                    resp.read()
                    raise OllamaUnavailable(
                        f"Ollama chat: {resp.status_code} {resp.text[:300]}", resp.status_code >= 500
                    )
                for line in resp.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    event = json.loads(data)
                    delta = Delta()
                    for choice in event.get("choices") or []:
                        d = choice.get("delta") or {}
                        delta.content += d.get("content") or ""
                        delta.thinking += d.get("reasoning") or d.get("reasoning_content") or ""
                        delta.finish_reason = choice.get("finish_reason") or delta.finish_reason
                    if usage := event.get("usage"):
                        delta.prompt_tokens = usage.get("prompt_tokens")
                        delta.completion_tokens = usage.get("completion_tokens")
                    yield delta
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(f"Ollama không truy cập được: {exc}") from exc
