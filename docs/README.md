<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.0
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/CTUBamboo/Bamboo, Bamboo project

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

# Thư mục tài liệu

Tài liệu viết bằng Markdown, build thành trang HTML bằng Sphinx + MyST (theme Furo).
File này chỉ để đọc trên Git, không đưa vào trang Sphinx.

## Cấu trúc

```text
docs/
├── index.md                     Trang chủ, mục lục
├── tong-quan/                   Yêu cầu đề thi và đối chiếu, kiến trúc 3 tầng, kịch bản nghiệp vụ
├── thiet-ke/                    Thiết kế CSDL, dịch vụ nền tảng Tầng 1, API
├── quan-ly-du-an/               Nhật ký quyết định kiến trúc (ADR)
├── van-hanh/                    Triển khai production, khởi tạo cho công ty mới
├── _static/custom.css           CSS bổ sung
├── conf.py                      Cấu hình Sphinx
├── pyproject.toml               Gói Python để build (package bamboo-docs, phiên bản ghim trong uv.lock ở gốc)
└── Makefile
```

Tên file giữ số thứ tự cũ (`01-`…`08-`) để dễ tìm; thứ tự trên trang do `toctree` trong
`index.md` của từng thư mục quyết định.

## Build

Cần [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`). Sau đó:

```bash
make -C docs html     # kết quả ở docs/_build/html/index.html
make -C docs live     # xem trực tiếp, tự tải lại: http://localhost:8000
make -C docs check    # cảnh báo = lỗi, dùng trong CI
```

`make` tự tạo `docs/.venv` và cài đúng phiên bản trong `uv.lock` (`uv sync --package bamboo-docs`) ở lần chạy đầu.

## Quy ước viết

- Liên kết sang trang khác bằng đường dẫn tương đối tới file `.md`:
  `[Thiết kế CSDL](../thiet-ke/03-thiet-ke-csdl.md)`.
- Nhắc tới quyết định kiến trúc: `[ADR #14](#adr-14)`. Mỗi ADR có nhãn `(adr-NN)=` ngay trên tiêu đề;
  thêm ADR mới theo mẫu ở cuối `quan-ly-du-an/05-quyet-dinh-kien-truc.md`.
- Sơ đồ: khối ```` ```mermaid ```` (hiển thị cả trên Git lẫn Sphinx). Sơ đồ ASCII dùng ```` ```text ````.
- Trang mới: tạo file `.md` có đúng một tiêu đề `#`, rồi thêm tên file vào `toctree`
  trong `index.md` của thư mục đó. Sphinx cảnh báo nếu quên.
- Tệp tải về (PDF, ảnh): đặt cạnh trang và liên kết bình thường, Sphinx tự chép vào bản build.
