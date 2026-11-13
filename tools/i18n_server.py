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

"""Trích câu tiếng Việt mà máy chủ (services/actions, db/migrations) gửi ra giao diện và đối chiếu với bản dịch.

    python tools/i18n_server.py check          thoát 1 nếu thông báo lỗi hoặc câu trong mẫu văn bản chưa có bản dịch tiếng Anh
    python tools/i18n_server.py sync           chép bản dịch của web sang dịch vụ actions (dùng cho email, SMS, PDF)
    python tools/i18n_server.py dump TỆP.json  ghi mọi câu ứng viên kèm loại và vị trí

Bản dịch nằm ở apps/web/src/i18n/server.en.json (bản sao ở services/actions/app/locale/server.en.json); khóa là câu
tiếng Việt, phần chèn động viết {0}, {1}... Câu của mẫu PDF, Excel nằm ở services/actions/app/locale/docs.en.json.
"""

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "apps/web/src/i18n/server.en.json"
LOCALE_DIR = ROOT / "services/actions/app/locale"
TEMPLATES = ROOT / "services/actions/app/templates"
PY_DIRS = [ROOT / "services/actions/app", ROOT / "services/ocr/app"]
SQL_DIR = ROOT / "db/migrations"
VI = re.compile("[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)
ERROR_CALLS = {"SearchUnavailable", "SignatureRejected", "MqttUnavailable", "OcrUnavailable", "AccountConflict"}
SKIP_CALLS = {
    "_action",
    "warning",
    "info",
    "exception",
    "debug",
    "error",
    "print",
    "execute",
    "compile",
    "sub",
    "match",
    "search",
    "split",
    "replace",
    "Counter",
    "Histogram",
    "Gauge",
    "SystemExit",
}
SQL_CALLS = {"execute", "one"}
SKIP_FILES = {"hasura_metadata.py", "pii_guard.py", "telemetry.py", "openbao_init.py", "bootstrap.py"}


def _template(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        out, i = "", 0
        for v in node.values:
            if isinstance(v, ast.Constant):
                out += v.value
            else:
                out += "{%d}" % i
                i += 1
        return out
    return None


def _python(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    parents = {c: p for p in ast.walk(tree) for c in ast.iter_child_nodes(p)}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.JoinedStr, ast.Constant)):
            continue
        text = _template(node)
        if not text or not VI.search(text):
            continue
        parent = parents.get(node)
        if isinstance(parent, (ast.JoinedStr, ast.FormattedValue, ast.Expr)):
            continue
        kind, q = "text", node
        for _ in range(6):
            q = parents.get(q)
            if q is None:
                break
            if isinstance(q, ast.Call):
                name = getattr(q.func, "id", getattr(q.func, "attr", ""))
                if name in SQL_CALLS:
                    first = q.args[0] if q.args else None
                    inside = first is not None and any(n is node for n in ast.walk(first))
                    kind = None if inside else "text"
                elif name.endswith("Error") or name in ERROR_CALLS:
                    kind = "error"
                elif name in SKIP_CALLS:
                    kind = None
                else:
                    kind = "text"
                break
            if isinstance(q, (ast.Dict, ast.Return, ast.Assign, ast.AnnAssign)):
                break
        if kind:
            yield kind, text, f"{path.relative_to(ROOT)}:{node.lineno}"


_LIT = re.compile(r"'((?:[^']|'')*)'")


def _sql(path: Path):
    text = re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))
    lits = list(_LIT.finditer(text))
    i = 0
    while i < len(lits):
        m = lits[i]
        before = text[max(0, m.start() - 160) : m.start()]
        raised = re.search(r"RAISE\s+(EXCEPTION|NOTICE|WARNING)\s*$", before, re.I)
        fmt = re.search(r"format\(\s*$", before, re.I)
        comment = re.search(r"\bIS\s*$", before, re.I)
        piece = m.group(1).replace("''", "'")
        n = 0

        def hole():
            nonlocal n
            n += 1
            return "{%d}" % (n - 1)

        if raised:
            body = re.sub(r"%", lambda _: hole(), piece)
        elif fmt:
            body = re.sub(r"%[sIL]", lambda _: hole(), piece)
        else:
            body = piece
            if re.search(r"\|\|\s*$", before):
                body = hole() + body
            j = i
            while True:
                after = (
                    text[lits[j].end() : lits[j + 1].start()]
                    if j + 1 < len(lits)
                    else text[lits[j].end() : lits[j].end() + 40]
                )
                if j + 1 < len(lits) and re.fullmatch(r"\s*\|\|\s*", after):
                    body += lits[j + 1].group(1).replace("''", "'")
                    j += 1
                elif j + 1 < len(lits) and re.fullmatch(r"\s*\|\|\s*[^;,'()]+?\s*\|\|\s*", after):
                    body += hole() + lits[j + 1].group(1).replace("''", "'")
                    j += 1
                else:
                    if re.match(r"\s*\|\|", after):
                        body += hole()
                    break
            i = j
        i += 1
        if comment or not VI.search(body):
            continue
        line = text.count("\n", 0, m.start()) + 1
        yield (
            ("error" if raised and raised.group(1).upper() == "EXCEPTION" else "text"),
            body,
            f"{path.relative_to(ROOT)}:{line}",
        )


def candidates():
    seen = {}
    for d in PY_DIRS:
        for path in sorted(d.rglob("*.py")):
            if path.name in SKIP_FILES:
                continue
            for kind, text, where in _python(path):
                if text not in seen or (kind == "error" and seen[text][0] != "error"):
                    seen[text] = (kind, where)
    for path in sorted(SQL_DIR.rglob("*.sql")):
        for kind, text, where in _sql(path):
            if text not in seen or (kind == "error" and seen[text][0] != "error"):
                seen[text] = (kind, where)
    return seen


def doc_keys():
    """Câu cố định trong mẫu văn bản (`_("...")`) và lời gọi `i18n.t("...")` của dịch vụ actions."""
    keys = {}
    for path in sorted(TEMPLATES.glob("*.html")):
        for m in re.finditer(r"""\b_\((["'])((?:\\.|(?!\1).)*)\1""", path.read_text(encoding="utf-8")):
            keys.setdefault(ast.literal_eval(m.group(1) + m.group(2) + m.group(1)), path.name)
    for path in sorted(PY_DIRS[0].rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "t"
                and getattr(node.func.value, "id", "") == "i18n"
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)
            ):
                keys.setdefault(node.args[0].value, f"{path.name}:{node.lineno}")
    return keys


def main(argv):
    mode = argv[1] if len(argv) > 1 else "check"
    if mode == "sync":
        LOCALE_DIR.mkdir(exist_ok=True)
        (LOCALE_DIR / CATALOG.name).write_text(CATALOG.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Đã chép {CATALOG.relative_to(ROOT)} sang {LOCALE_DIR.relative_to(ROOT)}")
        return 0
    found = candidates()
    if mode == "dump":
        rows = [{"key": k, "kind": v[0], "where": v[1]} for k, v in found.items()]
        Path(argv[2]).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(rows)} câu ({sum(r['kind'] == 'error' for r in rows)} thông báo lỗi)")
        return 0
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    holes = lambda s: sorted(re.findall(r"\{\d+\}", s))  # noqa: E731
    bad = [k for k, v in catalog.items() if holes(k) != holes(v)]
    missing = sorted(k for k, v in found.items() if v[0] == "error" and k not in catalog)
    copy = LOCALE_DIR / CATALOG.name
    stale = not copy.exists() or copy.read_text(encoding="utf-8") != CATALOG.read_text(encoding="utf-8")
    if stale:
        print(f"{copy.relative_to(ROOT)} lệch bản của web: chạy python tools/i18n_server.py sync")
    docs = json.loads((LOCALE_DIR / "docs.en.json").read_text(encoding="utf-8"))
    bad += [k for k, v in docs.items() if holes(k) != holes(v)]
    undone = sorted(f"{k!r} ({where})" for k, where in doc_keys().items() if k not in docs and k not in catalog)
    for k in undone:
        print(f"Câu văn bản chưa dịch: {k}")
    for k in bad:
        print(f"Lệch tham số: {k!r}")
    for k in missing:
        print(f"Chưa dịch ({found[k][1]}): {k!r}")
    if bad or missing or stale or undone:
        print(
            f"{len(missing)} thông báo lỗi chưa có bản dịch, {len(bad)} bản dịch lệch tham số (apps/web/src/i18n/server.en.json)"
        )
        return 1
    print(f"i18n máy chủ: {sum(v[0] == 'error' for v in found.values())} thông báo lỗi đều có bản dịch tiếng Anh.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
