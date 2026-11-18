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

"""Nhận ngôn ngữ của một câu hỏi để Trợ lý trả lời bằng đúng ngôn ngữ đó (ADR #85).

`detect` trả "vi" (tiếng Việt, có dấu hoặc không dấu), "en" (tiếng Anh), "zh", "ja", "ko" (nhận theo chữ viết),
"xx" (ngôn ngữ khác) hoặc "" khi câu quá ít chữ để biết (ví dụ chỉ có mã, số). Không dùng mô hình hay thư viện ngoài:
chữ viết khác Latin là ngôn ngữ khác; chữ Latin thì xét dấu riêng của tiếng Việt, hư từ của hai ngôn ngữ và hình dạng
âm tiết tiếng Việt.
"""

import re
import unicodedata

VI, EN, ZH, JA, KO, OTHER, UNKNOWN = "vi", "en", "zh", "ja", "ko", "xx", ""
NAMES = {VI: "tiếng Việt", EN: "English", ZH: "中文", JA: "日本語", KO: "한국어"}

_VI_ONLY = frozenset("ăđơưĩũẽỹạảấầẩẫậắằẳẵặẹẻếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷ")
_VI_FUNC = frozenset(
    """là và của có không được những các cho thì gì nào bao nhiêu ai khi nếu phải cần mấy thế sao như trong từ đến
    với này đó do bị hay hoặc tôi mình ở về theo sau trước đã sẽ đang một ra vào lại rồi chưa hãy xin giúp hỏi muốn
    biết đâu vì nên mà cũng còn chỉ rất lúc bằng""".split()
)
_EN_FUNC = frozenset(
    """a an the is are was were be been am do does did can could should would will shall may might must what who whom
    whose which when where why how of to too in on at for from with by about and or not no it its this that these
    those there has have had if as i we you they he she my our your their any many much need needs please tell me us
    give list show explain describe summarize compare per under over between after before than then them him each
    every all some more most other into up so such only also just get got let put but""".split()
)
_HOMOGRAPH = frozenset("a an be can do in may me no so than then to".split())
_WORD = re.compile(r"[^\W\d_]+")
_SYLLABLE = re.compile(
    r"(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx])?"
    r"(?:uye|uya|uyu|uay|uou|uoi|oai|oay|oeo|ieu|yeu|ai|ao|au|ay|eo|eu|ia|ie|iu|oa|oe|oi|oo|ua|ue|ui|uo|uu|uy|ye|"
    r"[aeiouy])"
    r"(?:ch|ng|nh|[cmnpt])?"
)


def _plain(word: str) -> str:
    word = word.replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", word) if unicodedata.category(c) != "Mn")


def _latin(char: str) -> bool:
    return unicodedata.name(char, "").startswith("LATIN")


def _script(letters: list[str]) -> str:
    names = [unicodedata.name(c, "") for c in letters]
    if any(n.startswith(("HIRAGANA", "KATAKANA")) for n in names):
        return JA
    if any(n.startswith("HANGUL") for n in names):
        return KO
    return ZH if any(n.startswith("CJK") for n in names) else OTHER


def detect(text: str) -> str:
    """Ngôn ngữ của `text`: "vi", "en", "zh", "ja", "ko", "xx" (ngôn ngữ khác) hoặc "" (không đủ chữ để biết).

    Từ viết hoa toàn bộ (mã, chữ viết tắt) không tính, trừ khi cả câu viết hoa. Câu có từ mang dấu tiếng Việt là tiếng
    Việt, trừ khi khung câu là tiếng Anh (từ hai hư từ tiếng Anh trở lên và nhiều hơn hư từ tiếng Việt, ví dụ "What is
    hạn mức phê duyệt?"). Câu không dấu là tiếng Việt khi gần hết các từ có hình dạng âm tiết tiếng Việt và có từ không
    phải hư từ tiếng Anh.
    """
    text = unicodedata.normalize("NFC", text or "")
    letters = [c for c in text if c.isalpha()]
    foreign = [c for c in letters if not _latin(c)]
    if foreign and len(foreign) * 2 >= len(letters):
        return _script(foreign)
    found = _WORD.findall(text)
    words = [w.lower() for w in found if not (len(w) > 1 and w.isupper())]
    if not words and len(found) >= 3:
        words = [w.lower() for w in found]
    if not words:
        return UNKNOWN
    shaped = [bool(_SYLLABLE.fullmatch(_plain(w))) for w in words]
    ratio = sum(shaped) / len(words)
    english = sum(w in _EN_FUNC for w in words)
    accented = [w for w, s in zip(words, shaped, strict=True) if s and not w.isascii()]
    if accented:
        frame = sum(w in _VI_FUNC for w in words)
        strict = sum(w in _EN_FUNC and w not in _HOMOGRAPH for w in words)
        if strict >= 2 and strict > frame:
            return EN
        exclusive = any(c in _VI_ONLY for w in accented for c in w)
        if ratio >= (0.6 if exclusive else 0.8) or (frame and ratio >= 0.5):
            return VI
    else:
        own = sum(s and w not in _EN_FUNC for w, s in zip(words, shaped, strict=True))
        if ratio >= 0.8 and own and (ratio == 1 or own >= english):
            return VI
    if english >= 2 or (english and english * 3 >= len(words)):
        return EN
    return UNKNOWN if all(shaped) else OTHER
