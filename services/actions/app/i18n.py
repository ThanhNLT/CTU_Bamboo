# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

"""Ngôn ngữ của văn bản máy chủ tự dựng (PDF, Excel mẫu, email, SMS, webhook) và định dạng ngày, số.

Câu gốc là tiếng Việt; bản tiếng Anh nằm ở `locale/docs.en.json` (câu trong mẫu văn bản) và `locale/server.en.json`
(thông báo, nhãn; bản sao của apps/web/src/i18n/server.en.json, đồng bộ bằng `python tools/i18n_server.py sync`).
"""

import contextlib
import contextvars
import datetime as dt
import functools
import json
import pathlib
import re
from decimal import ROUND_HALF_UP, Decimal

import psycopg

LOCALES = ("vi", "en")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_DIR = pathlib.Path(__file__).resolve().parent / "locale"
_HOLE = re.compile(r"\{(\d+)\}")
_SLASH_DATE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
_locale: contextvars.ContextVar[str] = contextvars.ContextVar("bamboo_locale", default="vi")


def normalize(value) -> str:
    return "en" if str(value or "").strip().lower().startswith("en") else "vi"


def get_locale() -> str:
    return _locale.get()


def set_locale(value) -> str:
    locale = normalize(value)
    _locale.set(locale)
    return locale


@contextlib.contextmanager
def use(value):
    token = _locale.set(normalize(value))
    try:
        yield
    finally:
        _locale.reset(token)


@functools.cache
def _catalog(name: str) -> dict[str, str]:
    path = _DIR / f"{name}.en.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _fill(text: str, args: tuple) -> str:
    return _HOLE.sub(lambda m: str(args[int(m.group(1))]) if int(m.group(1)) < len(args) else m.group(0), text)


def t(text: str, *args) -> str:
    """Câu cố định của văn bản theo ngôn ngữ hiện tại; `{0}`, `{1}` thay bằng tham số."""
    if get_locale() == "en":
        text = _catalog("docs").get(text) or _catalog("server").get(text) or text
    return _fill(text, args) if args else text


def english(text: str) -> str:
    """Bản tiếng Anh của một câu cố định, không phụ thuộc ngôn ngữ hiện tại (để nhận tệp nhập theo cả hai ngôn ngữ)."""
    return _catalog("docs").get(text) or _catalog("server").get(text) or text


@functools.cache
def _templates() -> tuple[dict[str, list], list]:
    by_head: dict[str, list] = {}
    loose: list = []
    for vi, en in _catalog("server").items():
        if not _HOLE.search(vi):
            continue
        parts = _HOLE.split(vi)
        literal = "".join(parts[0::2])
        letters = sum(ch.isalpha() for ch in literal)
        if letters < 3 or (len(parts[0]) < 3 and letters < 6):
            continue
        source = "".join(re.escape(p) if i % 2 == 0 else "(.*?)" for i, p in enumerate(parts))
        if source.endswith("(.*?)"):
            source = source[:-5] + "(.*)"
        item = (re.compile(f"^{source}$", re.S), en, parts[1::2], len(literal))
        if len(parts[0]) >= 3:
            by_head.setdefault(parts[0][:3], []).append(item)
        else:
            loose.append(item)
    return by_head, loose


def _translate(text: str, depth: int) -> str:
    trimmed = text.strip()
    if not trimmed or len(trimmed) > 600:
        return text
    exact = _catalog("server")
    if trimmed in exact:
        return text.replace(trimmed, exact[trimmed])
    if depth > 0:
        counted = re.match(r"^(\d+) (.+)$", trimmed, re.S)
        if counted and counted.group(2) in exact:
            return f"{counted.group(1)} {exact[counted.group(2)]}"
        if "; " in trimmed:
            return "; ".join(_translate(p, depth + 1) for p in trimmed.split("; "))
    by_head, loose = _templates()
    best = None
    for item in [*by_head.get(trimmed[:3], []), *loose]:
        if best and item[3] <= best[0][3]:
            continue
        m = item[0].match(trimmed)
        if m:
            best = (item, m)
    if best is None:
        if 0 < depth < 4 and ", " in trimmed:
            return ", ".join(_translate(p, 4) for p in trimmed.split(", "))
        return text
    (_, en, order, _), m = best
    groups = {n: m.group(i + 1) or "" for i, n in enumerate(order)}
    out = _HOLE.sub(
        lambda h: _translate(groups.get(h.group(1), ""), depth + 1) if depth < 4 else groups.get(h.group(1), ""), en
    )
    return text.replace(trimmed, out)


def _iso_dates(text: str) -> str:
    def swap(m: re.Match) -> str:
        day, month = int(m.group(1)), int(m.group(2))
        return f"{m.group(1)}-{MONTHS[month - 1]}-{m.group(3)}" if 1 <= month <= 12 and day <= 31 else m.group(0)

    return _SLASH_DATE.sub(swap, text)


def message(text: str | None, locale: str | None = None) -> str:
    """Câu máy chủ đã ghép sẵn bằng tiếng Việt (thông báo, lỗi) đổi sang ngôn ngữ cần giao; ngày về dd-MMM-yyyy."""
    if not text:
        return text or ""
    out = _translate(text, 0) if normalize(locale or get_locale()) == "en" else text
    return _iso_dates(out)


def date(value, time: bool = False) -> str:
    """Ngày dạng 05-Nov-2026 (kèm giờ 05-Nov-2026 14:05), giống nhau ở mọi ngôn ngữ."""
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        value = dt.datetime.fromisoformat(value) if ("T" in value or " " in value) else dt.date.fromisoformat(value)
    text = f"{value.day:02d}-{MONTHS[value.month - 1]}-{value.year}"
    if time and isinstance(value, dt.datetime):
        text += f" {value.hour:02d}:{value.minute:02d}"
    return text


def month(value) -> str:
    return f"{MONTHS[value.month - 1]}-{value.year}"


def number(value, decimals: int = 0) -> str:
    """Số dạng 1,234,567.5: dấu phẩy ngăn nghìn, dấu chấm thập phân, bỏ số 0 thừa ở cuối."""
    d = Decimal(str(value))
    if decimals == 0:
        return f"{int(d.quantize(Decimal(1), rounding=ROUND_HALF_UP)):,}"
    text = f"{int(d):,}"
    frac = str(abs(d) % 1)[2 : 2 + decimals].rstrip("0")
    return f"{text}.{frac}" if frac else text


def save_person_locale(conn: psycopg.Connection, tenant: str, person: str, value) -> str:
    locale = normalize(value)
    conn.execute(
        """INSERT INTO collab.person_locale (tenant_id, person_id, locale) VALUES (%s, %s, %s)
           ON CONFLICT (tenant_id, person_id) DO UPDATE SET locale = EXCLUDED.locale, updated_at = now()
           WHERE collab.person_locale.locale <> EXCLUDED.locale""",
        (tenant, person, locale),
    )
    return locale


def person_locale(conn: psycopg.Connection, tenant, person) -> str:
    if not tenant or not person:
        return "vi"
    row = conn.execute(
        "SELECT locale FROM collab.person_locale WHERE tenant_id = %s AND person_id = %s", (tenant, person)
    ).fetchone()
    if row is None:
        return "vi"
    return normalize(row["locale"] if isinstance(row, dict) else row[0])


def for_session(conn: psycopg.Connection, session: dict) -> str:
    """Đặt ngôn ngữ của lần gọi theo lựa chọn đã lưu của người đang đăng nhập."""
    return set_locale(person_locale(conn, session.get("x-hasura-tenant-id"), session.get("x-hasura-user-id")))
