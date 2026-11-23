# Bamboo - DX-OS Open-Core
# @version 0.5.2
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

"""Đo tỉ lệ lỗi ký tự (CER) của dịch vụ OCR thật (ADR #52); chạy trong container `ocr` qua tools/ocr_smoke.sh.

Mẫu tổng hợp: một báo giá tiếng Việt in rõ, bản "quét" nghiêng và nhiễu, bản lật 180° và xoay 90°.
Mẫu thật: thư mục có cặp `tên.png|jpg` + `tên.txt` (văn bản đúng).
"""

import argparse
import io
import pathlib
import random
import sys
import time

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

LINES = [
    "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP MIỀN NAM",
    "BẢNG BÁO GIÁ SỐ BG-2026/1015",
    "Kính gửi: Phòng Mua sắm, Tập đoàn X",
    "Máy bơm ly tâm Ebara 3M 40-200/7.5, công suất 7,5 kW",
    "Số lượng: 02 cái, đơn giá 48.500.000 đồng",
    "Thành tiền chưa thuế: 97.000.000 đồng",
    "Thuế giá trị gia tăng 8%: 7.760.000 đồng",
    "Tổng cộng: 104.760.000 đồng (Một trăm linh bốn triệu bảy trăm sáu mươi nghìn đồng)",
    "Thời gian giao hàng: trong vòng 30 ngày kể từ ngày ký hợp đồng",
    "Bảo hành 12 tháng, hỗ trợ kỹ thuật tại chỗ ở Hà Nội và Đà Nẵng",
]


def page(font: str, angle: float = 0.0, noise: bool = False) -> bytes:
    size = 34
    img = Image.new("L", (2480, 140 + len(LINES) * int(size * 2.2)), 250)
    draw = ImageDraw.Draw(img)
    face = ImageFont.truetype(font, size)
    for n, line in enumerate(LINES):
        draw.text((150, 100 + n * int(size * 2.2)), line, font=face, fill=20)
    if angle:
        img = img.rotate(angle, expand=True, fillcolor=250)
    if noise:
        px, rnd = img.load(), random.Random(1)
        for _ in range(img.width * img.height // 200):
            px[rnd.randrange(img.width), rnd.randrange(img.height)] = rnd.choice((60, 120, 200))
        img = img.filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


def cer(truth: str, got: str) -> float:
    prev = list(range(len(got) + 1))
    for i, a in enumerate(truth, 1):
        cur = [i]
        for j, b in enumerate(got, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a != b)))
        prev = cur
    return prev[-1] / max(len(truth), 1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--font")
    ap.add_argument("--samples")
    ap.add_argument("--max-cer", type=float, default=0.05)
    args = ap.parse_args()
    cases: list[tuple[str, bytes, str]] = []
    if args.font:
        truth = "\n".join(LINES)
        cases += [
            ("báo giá in rõ", page(args.font), truth),
            ("bản quét nghiêng, nhiễu", page(args.font, 1.2, True), truth),
            ("bản lật ngược", page(args.font, 180, True), truth),
            ("bản xoay 90°", page(args.font, 90, True), truth),
        ]
    if args.samples:
        for img in sorted(pathlib.Path(args.samples).glob("*")):
            if img.suffix.lower() in (".png", ".jpg", ".jpeg") and img.with_suffix(".txt").exists():
                cases.append((img.name, img.read_bytes(), img.with_suffix(".txt").read_text(encoding="utf-8").strip()))
    if not cases:
        print("Không có mẫu nào (cần --font hoặc --samples)")
        return 1
    failed = 0
    for name, data, truth in cases:
        started = time.monotonic()
        resp = requests.post(f"{args.url}/ocr", data=data, headers={"Content-Type": "image/png"}, timeout=300)
        elapsed = time.monotonic() - started
        if resp.status_code != 200:
            print(f"FAIL {name}: HTTP {resp.status_code} {resp.text[:200]}")
            failed += 1
            continue
        score = cer(truth, resp.json()["text"])
        ok = score <= args.max_cer
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}: CER {score:.1%} ({elapsed:.1f} giây)")
        if not ok:
            print("     " + resp.json()["text"].replace("\n", "\n     "))
    print(f"{len(cases) - failed}/{len(cases)} mẫu đạt CER ≤ {args.max_cer:.0%}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
