# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

"""Gắn header của dự án (docs/Header.txt) vào đầu mọi tệp mã nguồn, cấu hình, tài liệu.

    python tools/header.py            gắn hoặc cập nhật header (sửa docs/Header.txt rồi chạy lại, ví dụ khi đổi phiên bản)
    python tools/header.py --check    chỉ kiểm, thoát 1 nếu có tệp thiếu hoặc lệch header

Chỉ xử lý tệp Git đang theo dõi. Header viết bằng chú thích của từng loại tệp, đặt sau dòng `#!`, `<?xml ...?>`,
`<!doctype ...>` nếu có. Bỏ qua tệp không chứa được chú thích hoặc không phải của dự án: JSON, tệp khóa, dữ liệu mẫu,
ảnh, toàn văn giấy phép, NOTICE. Header gồm phần thông tin dự án và thông báo giấy phép Apache-2.0; ở tệp dùng chú thích
`#` hoặc `--`, header kết thúc ở dòng trống đầu tiên.

Hai tệp sinh tự động mang header do chính bộ sinh ghi: sửa docs/Header.txt thì sửa cả header trong
`services/actions/app/lakehouse_silver.py` (hàm build, tệp infra/platform/trino/silver.sql) và
`tools/release/compose_release.py` (compose.release.yml).
"""

import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/Header.txt"

HASH, DASH, BLOCK, HTML = "hash", "dash", "block", "html"
BY_SUFFIX = {
    ".py": HASH, ".sh": HASH, ".yml": HASH, ".yaml": HASH, ".toml": HASH, ".properties": HASH, ".ini": HASH,
    ".hcl": HASH, ".ps1": HASH, ".example": HASH, ".development": HASH, ".Dockerfile": HASH, ".dockerignore": HASH,
    ".sql": DASH,
    ".ts": BLOCK, ".tsx": BLOCK, ".js": BLOCK, ".mjs": BLOCK, ".css": BLOCK,
    ".html": HTML, ".xml": HTML, ".svg": HTML, ".md": HTML, ".MD": HTML,
}  # fmt: skip
BY_NAME = {
    "Dockerfile": HASH, "Makefile": HASH, ".gitignore": HASH, ".gitattributes": HASH, ".dockerignore": HASH,
    ".prettierignore": HASH, "nginx.conf": HASH, "mosquitto.conf": HASH, "kafka_server_jaas.conf": BLOCK,
}  # fmt: skip
SKIP_NAMES = {"pnpm-lock.yaml", "Header.txt"}
SKIP_PREFIXES = ("services/seed/data/", "LICENSES/")
PREAMBLES = ("#!", "<?xml", "<!doctype")


def header_lines() -> list[str]:
    return [line.rstrip() for line in SOURCE.read_text(encoding="utf-8").strip("\n").splitlines()]


def style_of(path: str) -> str | None:
    p = pathlib.PurePosixPath(path)
    if p.name in SKIP_NAMES or path.startswith(SKIP_PREFIXES):
        return None
    return BY_NAME.get(p.name) or BY_SUFFIX.get(p.suffix)


def render(lines: list[str], style: str) -> list[str]:
    if style == HASH:
        return [f"# {x}".rstrip() for x in lines]
    if style == DASH:
        return [f"-- {x}".rstrip() for x in lines]
    if style == BLOCK:
        return ["/**", *(f" * {x}".rstrip() for x in lines), " */"]
    return ["<!--", *(f"  {x}".rstrip() for x in lines), "-->"]


def content(line: str) -> str:
    return line.strip().lstrip("#-*").strip()


def strip_existing(body: list[str], style: str) -> list[str]:
    """Bỏ header cũ (nhận ra bằng dòng `@version` ngay sau dòng tiêu đề ở đầu tệp) để gắn bản mới."""
    opener, closer = {BLOCK: ("/**", " */"), HTML: ("<!--", "-->")}.get(style, (None, None))
    start = 1 if opener else 0
    if opener and body[:1] != [opener]:
        return body
    if len(body) < start + 2 or not content(body[start + 1]).startswith("@version "):
        return body
    end = start + 1
    if closer:
        while end < len(body) and body[end] != closer:
            end += 1
        end += 1
    else:
        prefix = "#" if style == HASH else "--"
        while end < len(body) and body[end].startswith(prefix):
            end += 1
    rest = body[end:]
    return rest[1:] if rest[:1] == [""] else rest


def stamp(text: str, lines: list[str], style: str) -> str:
    body = text.split("\n")
    trailing = body and body[-1] == ""
    if trailing:
        body.pop()
    preamble = []
    if body and body[0].lower().startswith(PREAMBLES):
        preamble = [body.pop(0)]
    body = strip_existing(body, style)
    out = preamble + render(lines, style)
    if body:
        out += ["", *body] if body[0] != "" else body
    return "\n".join(out) + "\n" if (trailing or not text) else "\n".join(out)


def main() -> int:
    check = "--check" in sys.argv[1:]
    lines = header_lines()
    files = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True, text=True
    ).stdout.split("\0")
    changed, skipped = [], []
    for rel in filter(None, files):
        style = style_of(rel)
        path = ROOT / rel
        if style is None or not path.is_file():
            skipped.append(rel)
            continue
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        newline = "\r\n" if "\r\n" in text else "\n"
        new = stamp(text.replace("\r\n", "\n"), lines, style).replace("\n", newline)
        if new != text:
            changed.append(rel)
            if not check:
                path.write_bytes(new.encode("utf-8"))
    verb = "thiếu hoặc lệch header" if check else "đã gắn header"
    print(
        f"{len(changed)} tệp {verb}, {len(files) - 1 - len(skipped) - len(changed)} tệp đã đúng, bỏ qua {len(skipped)}"
    )
    if check:
        for rel in changed:
            print(f"  {rel}")
    return 1 if check and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
