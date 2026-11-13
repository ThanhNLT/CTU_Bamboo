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

import re
import threading
from dataclasses import dataclass

from bamboo_common.pii import mask_address, mask_tail

from .common import ActionError

LANG = "vi"
LABELS = {
    "VN_CCCD": "Số CCCD",
    "VN_CMND": "Số CMND",
    "VN_PHONE": "Số điện thoại",
    "EMAIL_ADDRESS": "Email",
    "VN_BANK_ACCOUNT": "Số tài khoản",
    "CREDIT_CARD": "Số thẻ",
    "VN_TAX_CODE": "Mã số thuế",
    "VN_HEALTH_INSURANCE": "Số thẻ BHYT",
    "VN_SOCIAL_INSURANCE": "Số sổ BHXH",
    "VN_PASSPORT": "Số hộ chiếu",
    "VN_PERSON": "Họ tên",
    "VN_ADDRESS": "Địa chỉ",
}
SCORE_THRESHOLD = 0.5

_START = r"(?<![\w+])(?<![\d][.,])"
_END = r"(?!\w)(?![.,]\d)"
CCCD = _START + r"0\d{2}(?:[ .]?\d{3}){3}" + _END
PHONE = _START + r"(?:\+84[ .-]?|0)(?:[35789]\d(?:[ .-]?\d){7}|2\d(?:[ .-]?\d){8})" + _END
EMAIL = r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+"
CMND = r"(?i)\b(?:cmnd|chứng minh(?: nhân dân| thư)?)\D{0,15}?(?P<pii>(?<!\d)\d{9}(?!\d))"
BANK_ACCOUNT = r"(?i)\b(?:stk|số tài khoản|tài khoản(?: ngân hàng)?)\D{0,20}?(?P<pii>(?<!\d)\d(?:[ .-]?\d){5,19}(?!\d))"

_UPPER = "A-ZĐÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ"
_LOWER = "a-zđàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ"
_NAME = rf"[{_UPPER}][{_LOWER}]+(?:[ ][{_UPPER}][{_LOWER}]+){{1,4}}"
TAX_CODE = r"(?i:\b(?:mã số thuế|mst))\D{0,15}?(?P<pii>(?<!\d)\d{10}(?:[- ]?\d{3})?(?!\d))"
HEALTH_INSURANCE = r"(?i:\b(?:bhyt|bảo hiểm y tế))\D{0,20}?(?P<pii>[A-Z]{2}(?:[ -]?\d){13}(?!\d))"
SOCIAL_INSURANCE = r"(?i:\b(?:bhxh|sổ bảo hiểm xã hội))\D{0,15}?(?P<pii>(?<!\d)\d{10}(?!\d))"
PASSPORT = r"(?i:\b(?:hộ chiếu|passport))\D{0,15}?(?P<pii>(?<![A-Z\d])[A-Z]\d{7,8}(?!\w))"
PERSON = (
    r"(?i:\b(?:họ và tên|họ tên|họ tên đầy đủ|ông|bà|anh|chị|đồng chí|bệnh nhân|khách hàng|bác sĩ))"
    rf"\s*[:\-]?\s*(?P<pii>{_NAME})"
)
ADDRESS = (
    r"(?i:\b(?:địa chỉ(?: thường trú| liên hệ| nhà riêng)?|nơi cư trú|nơi ở hiện nay))\s*[:\-]\s*"
    r"(?P<pii>[^\n;]{8,120}?)(?=[\n;.]|$)"
)
STREET_ADDRESS = (
    r"(?P<pii>(?<![\w/])\d+[A-Za-z]?(?:/\d+)*[ ]+(?i:đường|phố|ngõ|ngách|hẻm)[ ]+[^,\n;]{2,40}"
    r"(?:,[ ]*[^,\n;]{2,40}){1,4})"
)


@dataclass(frozen=True)
class Finding:
    entity: str
    start: int
    end: int

    @property
    def label(self) -> str:
        return LABELS.get(self.entity, self.entity)


def mask_value(entity: str, value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if entity == "EMAIL_ADDRESS":
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}" if domain else "***"
    if entity == "VN_PHONE":
        if value.lstrip().startswith("+84"):
            digits = "0" + digits[2:]
        return f"{digits[:4]} *** {digits[-3:]}" if len(digits) >= 7 else "***"
    if entity == "VN_PERSON":
        return " ".join(f"{word[:1]}•••" for word in value.split())
    if entity == "VN_ADDRESS":
        return mask_address(value)
    if entity in ("VN_HEALTH_INSURANCE", "VN_PASSPORT"):
        return mask_tail("".join(ch for ch in value if ch.isalnum()), 3)
    return mask_tail(digits, 4 if entity == "CREDIT_CARD" else 3)


def merge(findings: list[Finding]) -> list[Finding]:
    """Gộp các phát hiện cùng loại chồng lên nhau (hai luật cùng bắt một địa chỉ) thành một."""
    out: list[Finding] = []
    for f in sorted(findings, key=lambda x: (x.start, -x.end)):
        if out and out[-1].entity == f.entity and f.start < out[-1].end:
            out[-1] = Finding(f.entity, out[-1].start, max(out[-1].end, f.end))
        else:
            out.append(f)
    return out


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
            import spacy
            from presidio_analyzer import (
                AnalyzerEngine,
                EntityRecognizer,
                Pattern,
                PatternRecognizer,
                RecognizerRegistry,
                RecognizerResult,
            )
            from presidio_analyzer.nlp_engine import SpacyNlpEngine
            from presidio_analyzer.predefined_recognizers import CreditCardRecognizer
            from presidio_anonymizer import AnonymizerEngine
            from presidio_anonymizer.entities import OperatorConfig

            class BlankNlpEngine(SpacyNlpEngine):
                def load(self) -> None:
                    self.nlp = {LANG: spacy.blank("xx")}

            class KeywordRecognizer(EntityRecognizer):
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
                KeywordRecognizer("VN_TAX_CODE", TAX_CODE, 0.7),
                KeywordRecognizer("VN_HEALTH_INSURANCE", HEALTH_INSURANCE, 0.7),
                KeywordRecognizer("VN_SOCIAL_INSURANCE", SOCIAL_INSURANCE, 0.7),
                KeywordRecognizer("VN_PASSPORT", PASSPORT, 0.7),
                KeywordRecognizer("VN_PERSON", PERSON, 0.65),
                KeywordRecognizer("VN_ADDRESS", ADDRESS, 0.65),
                KeywordRecognizer("VN_ADDRESS", STREET_ADDRESS, 0.6),
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
        return merge([Finding(r.entity_type, r.start, r.end) for r in self._results(text)])

    def mask(self, text: str) -> tuple[str, list[Finding]]:
        if not text or not text.strip():
            return text, []
        results = self._results(text)
        if not results:
            return text, []
        masked = self._anonymizer.anonymize(text=text, analyzer_results=results, operators=self._operators).text
        return masked, merge([Finding(r.entity_type, r.start, r.end) for r in results])

    def mask_json(self, value, found: set[str] | None = None):
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


MAX_CHECK_CHARS = 10_000

_guard = PiiGuard()


def guard() -> PiiGuard:
    return _guard


def warm_up() -> None:
    threading.Thread(target=lambda: _guard.analyze("0912345678"), daemon=True, name="pii-guard-warm-up").start()


def check_pii(_conn, _session: dict, args: dict, _ctx) -> dict:
    text = args.get("text") or ""
    if len(text) > MAX_CHECK_CHARS:
        raise ActionError(f"Văn bản quá dài (tối đa {MAX_CHECK_CHARS} ký tự)", "rejected")
    masked, findings = _guard.mask(text)
    return {
        "masked_text": masked,
        "entities": [{"entity": f.entity, "label": f.label, "start": f.start, "end": f.end} for f in findings],
    }
