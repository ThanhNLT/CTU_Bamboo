# Thư mục tài liệu

Tài liệu viết bằng Markdown, build thành trang HTML bằng Sphinx + MyST (theme Furo).
File này chỉ để đọc trên Git, không đưa vào trang Sphinx.

## Cấu trúc

```text
docs/
├── index.md                     Trang chủ, mục lục
├── tong-quan/                   Đề thi, yêu cầu, kiến trúc 3 tầng, kịch bản nghiệp vụ
├── thiet-ke/                    Thiết kế CSDL, dịch vụ nền tảng
├── quan-ly-du-an/               Timeline, nhật ký quyết định kiến trúc (ADR)
├── _static/custom.css           CSS bổ sung
├── conf.py                      Cấu hình Sphinx
├── requirements.txt             Gói Python để build
└── Makefile
```

Tên file giữ số thứ tự cũ (`01-`…`06-`) để dễ tìm; thứ tự trên trang do `toctree` trong
`index.md` của từng thư mục quyết định.

## Build

Lần đầu trên Ubuntu/WSL cần `sudo apt install python3-venv`. Sau đó:

```bash
make -C docs html     # kết quả ở docs/_build/html/index.html
make -C docs live     # xem trực tiếp, tự tải lại: http://localhost:8000
make -C docs check    # cảnh báo = lỗi, dùng trong CI
```

`make` tự tạo `docs/.venv` và cài `requirements.txt` ở lần chạy đầu.

## Quy ước viết

- Liên kết sang trang khác bằng đường dẫn tương đối tới file `.md`:
  `[Thiết kế CSDL](../thiet-ke/03-thiet-ke-csdl.md)`.
- Nhắc tới quyết định kiến trúc: `[ADR #14](#adr-14)`. Mỗi ADR có nhãn `(adr-NN)=` ngay trên tiêu đề;
  thêm ADR mới theo mẫu ở cuối `quan-ly-du-an/05-quyet-dinh-kien-truc.md`.
- Sơ đồ: khối ```` ```mermaid ```` (hiển thị cả trên Git lẫn Sphinx). Sơ đồ ASCII dùng ```` ```text ````.
- Trang mới: tạo file `.md` có đúng một tiêu đề `#`, rồi thêm tên file vào `toctree`
  trong `index.md` của thư mục đó. Sphinx cảnh báo nếu quên.
- Tệp tải về (PDF, ảnh): đặt cạnh trang và liên kết bình thường, Sphinx tự chép vào bản build.
