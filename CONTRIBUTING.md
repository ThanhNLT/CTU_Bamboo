<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.1
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

# Đóng góp cho Bamboo

Cảm ơn bạn quan tâm tới Bamboo. Mọi đóng góp đều được hoan nghênh: báo lỗi, đề xuất, sửa tài liệu, viết mã, dịch giao
diện. Khi tham gia, bạn đồng ý tuân theo [Quy tắc ứng xử](CODE_OF_CONDUCT.md).

## Trao đổi ở đâu

| Bạn muốn | Dùng |
|---|---|
| Báo lỗi | [Issues](https://github.com/CTUBamboo/Bamboo/issues/new/choose), mẫu **Báo lỗi** |
| Đề xuất tính năng | [Issues](https://github.com/CTUBamboo/Bamboo/issues/new/choose), mẫu **Đề xuất** |
| Hỏi cách cài đặt, cách dùng, trao đổi ý tưởng | [Discussions](https://github.com/CTUBamboo/Bamboo/discussions) |
| Báo lỗ hổng bảo mật | Không mở issue công khai; làm theo [SECURITY.md](SECURITY.md) |

Trước khi mở issue, tìm xem đã có issue hoặc thảo luận tương tự chưa. Issue mới mang nhãn `needs-triage`; nhóm duy trì
phân loại rồi gắn `needs-info` khi cần bạn bổ sung thông tin, hoặc `wontfix` kèm lý do khi không làm.

## Dựng môi trường

Cách nhanh nhất là Docker Compose, một lệnh dựng toàn bộ hệ thống kèm dữ liệu demo:

```bash
git clone https://github.com/CTUBamboo/Bamboo.git && cd Bamboo
make up                # http://localhost:8000, tài khoản demo trong README
```

Chạy từng thành phần không dùng Docker và cài ra ngoài thư mục mã nguồn:
[README](README.md#chạy-native-không-dùng-docker), [Dịch và cài đặt từ mã nguồn](docs/van-hanh/dich-tu-ma-nguon.md).

## Quy trình đóng góp mã

1. Fork kho mã, tạo nhánh từ `main` với tên nói rõ việc làm, ví dụ `fix/dang-nhap-demo` hoặc `feat/lich-cong-tac`.
2. Sửa mã kèm kiểm thử cho hành vi mới hoặc lỗi vừa sửa.
3. Chạy kiểm tra ở máy (mục dưới) cho tới khi đạt.
4. Ghi thay đổi người dùng thấy được vào mục **Chưa phát hành** của [CHANGELOG.md](CHANGELOG.md).
5. Mở pull request vào `main`, mô tả ngắn gọn thay đổi và issue liên quan (`Closes #123`).

Một pull request chỉ nên làm một việc. Thay đổi lớn (thêm dịch vụ nền tảng, đổi mô hình dữ liệu, đổi công nghệ) nên mở
issue hoặc thảo luận trước để thống nhất hướng làm.

## Kiểm tra trước khi gửi

```bash
make check             # kiểm tra tĩnh: uv.lock, REUSE, ruff, bản dịch thông báo, cấu hình Compose, giao diện, tài liệu
make test-db           # kiểm thử SQL của migration
make test-actions      # kiểm thử dịch vụ actions với Hasura, Flowable, SeaweedFS, OpenBao thật
make test-seed         # kiểm thử dữ liệu demo
pnpm --filter @bamboo/e2e test:e2e     # kiểm thử đầu-cuối qua giao diện (hệ thống đang chạy bằng make up)
```

`make check-py`, `make check-web`, `make check-docs` chạy riêng từng phần của `make check`.

## Quy ước

- **Giấy phép trong từng tệp:** tệp mới phải mang header của dự án. Sau khi `git add` tệp mới, chạy
  `python tools/header.py`; `python tools/header.py --check` và `reuse lint` phải đạt.
- **Python:** định dạng và sắp xếp import bằng ruff (`ruff format`, `ruff check`); mỗi tệp `.py` mở đầu bằng docstring mô
  tả mô-đun. Phụ thuộc mới thêm vào `pyproject.toml` của dịch vụ rồi `uv lock`.
- **TypeScript:** định dạng bằng Prettier, kiểm bằng ESLint (`pnpm check`). Mọi câu hiển thị phải có trong danh mục dịch
  tiếng Việt và tiếng Anh; `pnpm lint` chặn câu chưa dịch.
- **Thông báo từ máy chủ:** thêm câu lỗi mới ở backend hoặc migration thì thêm bản dịch tiếng Anh;
  `python3 tools/i18n_server.py check` chặn câu chưa dịch.
- **Cơ sở dữ liệu:** không sửa migration đã đẩy lên Git, tạo tệp mới `NNN_mo_ta.sql` trong `db/migrations/bms/`; quy ước
  đầy đủ ở [Thiết kế cơ sở dữ liệu](docs/thiet-ke/03-thiet-ke-csdl.md).
- **Phụ thuộc bên thứ ba:** chỉ dùng phần mềm theo giấy phép được OSI phê duyệt, lấy từ PyPI, npm hoặc image chính thức
  của upstream; không chép mã của dự án khác vào kho và không vá mã của gói phụ thuộc. Thành phần mới ghi vào
  [NOTICE](NOTICE).
- **Quyết định kiến trúc:** ghi một ADR mới vào
  [Nhật ký quyết định kiến trúc](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md) khi chọn công nghệ hoặc đổi cách làm.
- **Thuật ngữ nghiệp vụ:** dùng đúng từ trong [CONTEXT.md](CONTEXT.md).

## Giấy phép của phần đóng góp

Bamboo phát hành theo [Apache License 2.0](LICENSE). Theo mục 5 của giấy phép, phần đóng góp bạn gửi vào kho mã được cấp
theo đúng giấy phép này, không kèm điều kiện nào khác. Chỉ gửi mã do bạn viết hoặc mã bạn có quyền đóng góp theo
Apache-2.0.
