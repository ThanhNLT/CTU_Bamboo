<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
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

# Dịch và cài đặt từ mã nguồn

Bamboo dịch được từ mã nguồn theo hai cách, đều chỉ dùng công cụ nguồn mở và cấu hình bằng biến, không sửa tệp mã:

| Cách | Lệnh | Kết quả |
|---|---|---|
| Docker Compose | `make up` | Toàn bộ hệ thống (Tầng 1 và giao diện) chạy trong container, image dịch từ mã nguồn |
| Cài vào hệ thống | `make build && make install` | Dịch vụ Python, giao diện, migration CSDL nằm ở `PREFIX`, chạy bằng lệnh `bamboo`, không cần thư mục mã nguồn |

## Công cụ

| Công cụ | Phiên bản | Giấy phép | Dùng để |
|---|---|---|---|
| GNU Make | 4 trở lên | GPL-3.0-or-later | Điều phối các bước dịch, cài đặt |
| [uv](https://docs.astral.sh/uv/) | 0.13 trở lên | Apache-2.0 OR MIT | Cài phụ thuộc Python đúng phiên bản ghim trong `uv.lock` |
| Python | 3.13 | PSF-2.0 | Dịch vụ `actions`, `seed` |
| Node.js | 22 (tối thiểu 20) | MIT | Dịch giao diện |
| [pnpm](https://pnpm.io) | 12.16.1 | MIT | Cài phụ thuộc JavaScript đúng phiên bản ghim trong `pnpm-lock.yaml` |
| Docker Engine, Docker Compose | 25 trở lên, v2 | Apache-2.0 | Cách Docker Compose |
| Git, tar, gzip | bất kỳ | GPL-2.0-only, GPL-3.0-or-later | Lấy mã nguồn, đóng gói |
| `psql` (PostgreSQL client) | 17 | PostgreSQL | Chạy migration ở bản cài vào hệ thống |

Phụ thuộc lấy từ PyPI và npm lúc dịch, không có bản sao nào nằm trong kho mã; danh sách và giấy phép ở
[NOTICE](https://github.com/CTUBamboo/Bamboo/blob/main/NOTICE).

## Lấy mã nguồn

```bash
git clone https://github.com/CTUBamboo/Bamboo.git && cd Bamboo
```

Hoặc tải `bamboo-<phiên bản>.tar.gz` và `SHA256SUMS` ở [trang phát hành](https://github.com/CTUBamboo/Bamboo/releases):

```bash
sha256sum -c SHA256SUMS && tar xzf bamboo-<phiên bản>.tar.gz && cd bamboo-<phiên bản>
```

## Cấu hình trước khi dịch

`make help` in mọi tùy chọn cùng giá trị đang có hiệu lực. Truyền tùy chọn trên dòng lệnh (`make build WITH_LAKEHOUSE=1`)
hoặc ghi vào tệp `config.mk` ở gốc kho mã (Git không theo dõi tệp này):

```make
PREFIX := /opt/bamboo
WITH_LAKEHOUSE := 1
export VITE_KEYCLOAK_URL := https://sso.example.vn
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PREFIX` | `/usr/local` | Thư mục gốc để cài |
| `DESTDIR` | trống | Thư mục tạm đặt trước `PREFIX` khi đóng gói (`make install DESTDIR=/tmp/pkg PREFIX=/usr`) |
| `bindir`, `libdir`, `datadir`, `sysconfdir`, `docdir` | `PREFIX/bin`, `PREFIX/lib`, `PREFIX/share`, `PREFIX/etc`, `PREFIX/share/doc/bamboo` | Đổi riêng từng thư mục theo quy ước của bản phân phối |
| `BUILD_DIR` | `build` | Nơi chứa kết quả dịch |
| `PYTHON_VERSION` | `3.13` | Bản Python để tạo môi trường của dịch vụ |
| `WITH_LAKEHOUSE` | `0` | `1`: cài thêm phụ thuộc cho `bamboo lakehouse-sink` (PyIceberg, Kafka) |
| `UV`, `PNPM` | `uv`, `pnpm` | Đường dẫn tới hai công cụ khi không nằm trong `PATH` |
| `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT`, `VITE_HASURA_URL` | địa chỉ đang mở trang, `bms`, `bms-web`, `/graphql` | Giá trị mặc định dựng vào giao diện; lúc chạy vẫn đổi được bằng biến `BAMBOO_*` |

Cách Docker Compose cấu hình bằng biến môi trường: truyền trên dòng lệnh (`BAMBOO_RAM=16 GATEWAY_PORT=9000 make up`) hoặc
chép `.env.example` thành `.env` rồi sửa. Mọi biến đều có giá trị mặc định cho máy dev.

## Dịch

```bash
make build
```

Lệnh thực hiện ba việc, kết quả nằm trong `build/` và `apps/web/dist/`:

1. Xuất danh sách phụ thuộc của từng dịch vụ từ `uv.lock`, kèm mã băm của từng gói (`build/py/<dịch vụ>/requirements.txt`).
2. Tạo môi trường Python riêng cho `actions` và `seed` (`build/venv/<dịch vụ>`), cài phụ thuộc và gói dùng chung
   `packages/py-common`.
3. Cài phụ thuộc JavaScript theo `pnpm-lock.yaml` rồi dịch giao diện bằng Vite.

Lần đầu cần Internet để tải gói từ PyPI và npm. `make clean` xóa kết quả dịch.

## Cài đặt

```bash
make install PREFIX=/opt/bamboo        # thêm sudo khi PREFIX thuộc root
```

| Thư mục | Nội dung |
|---|---|
| `PREFIX/bin/bamboo` | Lệnh chạy mọi thành phần |
| `PREFIX/lib/bamboo/<dịch vụ>/` | Môi trường Python của `actions`, `seed` |
| `PREFIX/share/bamboo/services/` | Mã dịch vụ và dữ liệu demo |
| `PREFIX/share/bamboo/infra/platform/` | Cấu hình các dịch vụ nền tảng: realm và theme Keycloak, metadata Hasura, quy trình BPMN, OpenBao, Trino |
| `PREFIX/share/bamboo/db/`, `tools/db/` | Migration, tài khoản CSDL và script chạy |
| `PREFIX/share/bamboo/web/` | Giao diện đã dịch |
| `PREFIX/etc/bamboo/bamboo.env.example` | Mẫu tệp cấu hình |
| `PREFIX/share/doc/bamboo/` | README, CHANGELOG, LICENSE, NOTICE |

`make uninstall PREFIX=/opt/bamboo` gỡ toàn bộ, giữ lại tệp `bamboo.env` do bạn tạo. Bước cài chỉ chép tệp, không cần
Internet. Sau khi cài, thư mục mã nguồn không còn được dùng tới và có thể xóa.

## Chạy bản đã cài

Bamboo cần các dịch vụ nền tảng đang chạy: PostgreSQL, OpenBao, SeaweedFS, Meilisearch, Keycloak, Flowable, Hasura. Cài
chúng từ gói của hệ điều hành hoặc bản phân phối chính thức theo mục *Chạy native* của
[README](https://github.com/CTUBamboo/Bamboo#chạy-native-không-dùng-docker) (bước 1, 4, 5); tệp cấu hình mẫu của từng dịch
vụ nằm ở `PREFIX/share/bamboo/infra/platform/`.

Tạo tệp cấu hình rồi chạy lần lượt:

```bash
cd /opt/bamboo/etc/bamboo && cp bamboo.env.example bamboo.env     # sửa địa chỉ, mật khẩu cho khớp máy

export STATE=/var/lib/bamboo && mkdir -p $STATE/{openbao,run,seaweedfs,meili}
bamboo migrate                                    # database, migration, tài khoản riêng cho từng dịch vụ
BAO_KEYS_FILE=$STATE/openbao/init.json S3_CONFIG_PATH=$STATE/seaweedfs/s3.json MEILI_CONFIG_PATH=$STATE/meili/config.toml \
APPROLE_OUTPUTS=actions=$STATE/run/actions.json,bootstrap=$STATE/run/bootstrap.json,search=$STATE/run/search.json \
bamboo openbao-init                               # khởi tạo két, sinh secret, khóa S3, khóa Meilisearch, AppRole
DATABASE_URL=postgresql://bms:bms-dev@127.0.0.1:5432/bms bamboo seed          # dữ liệu demo (bỏ qua nếu không cần)
BAO_APPROLE_FILE=$STATE/run/bootstrap.json bamboo bootstrap                    # bucket, BPMN, metadata Hasura, client Keycloak

BAO_APPROLE_FILE=$STATE/run/actions.json bamboo actions &                      # http://127.0.0.1:8090/healthz
BAO_APPROLE_FILE=$STATE/run/actions.json bamboo flow-sync &
BAO_APPROLE_FILE=$STATE/run/search.json bamboo search-sync &
bamboo web                                                                     # http://localhost:5173
```

`bamboo help` liệt kê mọi lệnh. Lệnh `bamboo` nạp `PREFIX/etc/bamboo/bamboo.env` trước khi chạy (đổi tệp bằng
`BAMBOO_ENV_FILE`); biến đã đặt sẵn trong môi trường hoặc trên dòng lệnh được ưu tiên hơn tệp. `bamboo web` phục vụ giao diện để chạy
thử và sinh `/config.js` từ `BAMBOO_KEYCLOAK_URL`, `BAMBOO_HASURA_URL` nên đổi địa chỉ dịch vụ không cần dịch lại; triển
khai thật đặt `PREFIX/share/bamboo/web/` sau nginx hoặc web server tương đương.

## Docker Compose: chạy ngoài thư mục mã nguồn

`make up` dịch image từ mã nguồn; mã, cấu hình và script nằm trong image, container không gắn tệp nào của thư mục mã nguồn
(trừ nhóm tùy chọn `logs`, `observability` và nhóm kiểm thử). Để chạy hệ thống từ một thư mục khác bằng chính các image vừa dịch:

```bash
make up                         # dịch image (thẻ dev) và chạy
make release-compose            # sinh compose.release.yml chỉ tham chiếu image, không có phần build
make down                       # dừng bản đang chạy từ thư mục mã nguồn, giữ nguyên dữ liệu
mkdir -p ~/bamboo && cp compose.release.yml ~/bamboo/ && cd ~/bamboo
docker compose -f compose.release.yml up -d
```

Hai cách chạy dùng chung tên dự án `bamboo` nên dùng chung volume dữ liệu. `make release-compose VERSION=<phiên bản>` sinh
tệp tham chiếu image của một bản đã phát hành trên GitHub Container Registry thay cho image dịch tại máy (hiện có tới
bản 0.3.0).

## Đóng gói mã nguồn

```bash
make dist        # build/dist/bamboo-<phiên bản>.tar.gz và SHA256SUMS, lấy từ commit đang đứng
```

Phiên bản lấy từ dòng `@version` trong `docs/Header.txt`.
