# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Nhận diện và che dữ liệu cá nhân trong văn bản tự do bằng Microsoft Presidio (ADR #43).

Chỉ dùng bộ nhận diện theo mẫu (không có mô hình NER tiếng Việt): spaCy `blank("xx")` chỉ tách từ, không tải
mô hình nào. Bộ nhận diện riêng cho Việt Nam: CCCD 12 số, CMND 9 số và số tài khoản (chỉ khi có từ khóa đứng
trước, vì số dài khác rất nhiều: số lượng, số tiền, mã vạch), số điện thoại di động / cố định, email; số thẻ
dùng bộ nhận diện có kiểm tra Luhn của Presidio. Che từng phần để người đọc vẫn đối chiếu được:
`0912 *** 678`, `•••••••••789`, `n***@demo.vn`.

Presidio và spaCy nặng (khoảng 2 giây, 100 MB khi nạp) nên nạp lười, một lần cho cả tiến trình.
"""

# ===== Thư viện chuẩn =====
import re
import threading
from dataclasses import dataclass

# ===== Module nội bộ =====
from .common import ActionError
from .pii import mask_tail

# ===== Hằng số & cấu hình =====
LANG = "vi"
LABELS = {
    "VN_CCCD": "Số CCCD",
    "VN_CMND": "Số CMND",
    "VN_PHONE": "Số điện thoại",
    "EMAIL_ADDRESS": "Email",
    "VN_BANK_ACCOUNT": "Số tài khoản",
    "CREDIT_CARD": "Số thẻ",
}
SCORE_THRESHOLD = 0.5

# Biên của một số: không dính chữ, số, hay phần thập phân / nhóm nghìn (1.250.000, 3,5).
_START = r"(?<![\w+])(?<![\d][.,])"
_END = r"(?!\w)(?![.,]\d)"
CCCD = _START + r"0\d{2}(?:[ .]?\d{3}){3}" + _END
# Di động 0[35789]x + 7 số (10 số); cố định 02x + 8 số (11 số, mã vùng 3 chữ số).
PHONE = _START + r"(?:\+84[ .-]?|0)(?:[35789]\d(?:[ .-]?\d){7}|2\d(?:[ .-]?\d){8})" + _END
EMAIL = r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+"
CMND = r"(?i)\b(?:cmnd|chứng minh(?: nhân dân| thư)?)\D{0,15}?(?P<pii>(?<!\d)\d{9}(?!\d))"
BANK_ACCOUNT = r"(?i)\b(?:stk|số tài khoản|tài khoản(?: ngân hàng)?)\D{0,20}?(?P<pii>(?<!\d)\d(?:[ .-]?\d){5,19}(?!\d))"


# ===== Kiểu dữ liệu =====
@dataclass(frozen=True)
class Finding:
    entity: str
    start: int
    end: int

    @property
    def label(self) -> str:
        return LABELS.get(self.entity, self.entity)


# ===== Hàm =====
def mask_value(entity: str, value: str) -> str:
    """Bản che của một giá trị đã nhận diện."""
    digits = re.sub(r"\D", "", value)
    if entity == "EMAIL_ADDRESS":
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}" if domain else "***"
    if entity == "VN_PHONE":
        if value.lstrip().startswith("+84"):
            digits = "0" + digits[2:]
        return f"{digits[:4]} *** {digits[-3:]}" if len(digits) >= 7 else "***"
    return mask_tail(digits, 4 if entity == "CREDIT_CARD" else 3)


# ===== Lớp =====
class PiiGuard:
    def __init__(self):
        self._lock = threading.Lock()
        self._analyzer = None
        self._anonymizer = None
        self._operators = None

    def _load(self):
        with self._lock:
            if self._analyzer is not None:
                return
            import spacy  # spaCy
            from presidio_analyzer import (
                AnalyzerEngine,
                EntityRecognizer,
                Pattern,
                PatternRecognizer,
                RecognizerRegistry,
                RecognizerResult,
            )  # Presidio
            from presidio_analyzer.nlp_engine import SpacyNlpEngine  # Presidio
            from presidio_analyzer.predefined_recognizers import CreditCardRecognizer  # Presidio
            from presidio_anonymizer import AnonymizerEngine  # Presidio
            from presidio_anonymizer.entities import OperatorConfig  # Presidio

            class BlankNlpEngine(SpacyNlpEngine):
                """Chỉ tách từ: không tải (và không tự tải về) mô hình spaCy nào."""

                def load(self) -> None:
                    self.nlp = {LANG: spacy.blank("xx")}

            class KeywordRecognizer(EntityRecognizer):
                """Mẫu có từ khóa đứng trước; chỉ phần trong nhóm `pii` là dữ liệu cá nhân."""

                def __init__(self, entity: str, pattern: str, score: float):
                    self.pattern = re.compile(pattern)
                    self.score = score
                    super().__init__(supported_entities=[entity], supported_language=LANG, name=f"{entity}_keyword")

                def load(self) -> None:
                    pass

                def analyze(self, text, entities, nlp_artifacts=None):
                    return [
                        RecognizerResult(self.supported_entities[0], m.start("pii"), m.end("pii"), self.score)
                        for m in self.pattern.finditer(text)
                    ]

            def pattern(entity: str, regex: str, score: float):
                return PatternRecognizer(
                    supported_entity=entity, supported_language=LANG, patterns=[Pattern(entity.lower(), regex, score)]
                )

            nlp = BlankNlpEngine(models=[{"lang_code": LANG, "model_name": "blank"}])
            nlp.load()
            registry = RecognizerRegistry(supported_languages=[LANG])
            for recognizer in (
                pattern("VN_CCCD", CCCD, 0.6),
                pattern("VN_PHONE", PHONE, 0.6),
                pattern("EMAIL_ADDRESS", EMAIL, 0.8),
                KeywordRecognizer("VN_CMND", CMND, 0.7),
                KeywordRecognizer("VN_BANK_ACCOUNT", BANK_ACCOUNT, 0.7),
                CreditCardRecognizer(supported_language=LANG),
            ):
                registry.add_recognizer(recognizer)
            self._operators = {e: OperatorConfig("custom", {"lambda": lambda v, e=e: mask_value(e, v)}) for e in LABELS}
            self._anonymizer = AnonymizerEngine()
            self._analyzer = AnalyzerEngine(
                nlp_engine=nlp, registry=registry, supported_languages=[LANG], default_score_threshold=SCORE_THRESHOLD
            )

    def _results(self, text: str):
        if self._analyzer is None:
            self._load()
        return self._analyzer.analyze(text=text, language=LANG, entities=list(LABELS))

    def analyze(self, text: str) -> list[Finding]:
        if not text or not text.strip():
            return []
        return sorted((Finding(r.entity_type, r.start, r.end) for r in self._results(text)), key=lambda f: f.start)

    def mask(self, text: str) -> tuple[str, list[Finding]]:
        """Văn bản đã che và các đoạn đã che (vị trí theo văn bản gốc)."""
        if not text or not text.strip():
            return text, []
        results = self._results(text)
        if not results:
            return text, []
        masked = self._anonymizer.anonymize(text=text, analyzer_results=results, operators=self._operators).text
        return masked, sorted((Finding(r.entity_type, r.start, r.end) for r in results), key=lambda f: f.start)

    def mask_json(self, value, found: set[str] | None = None):
        """Che mọi chuỗi trong JSON (dict, list lồng nhau). Trả về (bản che, tập loại dữ liệu đã che)."""
        found = set() if found is None else found
        if isinstance(value, str):
            masked, findings = self.mask(value)
            found.update(f.entity for f in findings)
            return masked, found
        if isinstance(value, dict):
            return {k: self.mask_json(v, found)[0] for k, v in value.items()}, found
        if isinstance(value, list):
            return [self.mask_json(v, found)[0] for v in value], found
        return value, found


# ===== Hằng số & cấu hình =====
MAX_CHECK_CHARS = 10_000

# ===== Khởi tạo =====
_guard = PiiGuard()


# ===== Hàm =====
def guard() -> PiiGuard:
    return _guard


def warm_up() -> None:
    """Nạp Presidio ở luồng nền lúc khởi động để request đầu không phải chờ."""
    threading.Thread(target=lambda: _guard.analyze("0912345678"), daemon=True, name="pii-guard-warm-up").start()


def check_pii(_conn, _session: dict, args: dict, _ctx) -> dict:
    """Hasura Action: người dùng kiểm tra văn bản trước khi gửi (ô trao đổi) — bản che và các đoạn dữ liệu cá nhân."""
    text = args.get("text") or ""
    if len(text) > MAX_CHECK_CHARS:
        raise ActionError(f"Văn bản quá dài (tối đa {MAX_CHECK_CHARS} ký tự)", "rejected")
    masked, findings = _guard.mask(text)
    return {
        "masked_text": masked,
        "entities": [{"entity": f.entity, "label": f.label, "start": f.start, "end": f.end} for f in findings],
    }
