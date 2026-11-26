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

# Thư viện, phiên bản và giấy phép

Danh sách quét từ mã nguồn ngày 22-Nov-2026 (nhánh `main`, commit e04f2e4), nhóm theo tầng rồi theo chức năng.
Phiên bản là bản thực tế đang dùng:

- Image Docker: thẻ ghim trong `infra/compose/*.yml` và các `Dockerfile` (`infra/docker/`, `infra/platform/*/`).
- Python: bản khóa trong `uv.lock` (166 gói) và `services/ocr/uv.lock` (92 gói).
- JavaScript: bản khóa trong `pnpm-lock.yaml`; cột "Khai báo" là khoảng phiên bản ghi trong `package.json`.

Giấy phép lấy từ siêu dữ liệu của gói (`License-Expression`/`License` của PyPI, trường `license` của npm) hoặc kho
mã gốc của dự án. Bản tóm tắt pháp lý cho người phân phối nằm ở tệp `NOTICE` ở gốc repo; tài liệu này chi tiết hơn
về phiên bản và vị trí dùng.

Giấy phép không thuộc nhóm dễ dãi (MIT/BSD/Apache/ISC) được **in đậm**; cách dự án dùng chúng ghi ở mục cuối.

## Tầng 1: Nền tảng dịch vụ lõi (headless)

### Cổng API và biên mạng

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Apache APISIX (`apache/apisix`, bản debian) | 3.19.0 | Apache-2.0 | Điểm vào duy nhất `:8000`, kiểm token, giới hạn tần suất, websocket (`infra/platform/apisix`) |
| Coraza proxy-wasm | 0.6.0 | Apache-2.0 | WAF nhúng trong image cổng API |
| OWASP Core Rule Set (đi kèm Coraza) | theo Coraza 0.6.0 | Apache-2.0 | Bộ luật WAF |
| Alpine Linux (`alpine`, chỉ lúc build) | 3.22 | MIT và giấy phép từng gói | Tầng build tải, kiểm SHA-256 của Coraza |

### Định danh, SSO, MFA

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Keycloak (`quay.io/keycloak/keycloak`) | 26.8.0 | Apache-2.0 | OIDC + PKCE, một tài khoản nhiều tenant, OTP; realm và theme ở `infra/platform/keycloak` |
| PyJWT (`pyjwt[crypto]`) | 2.15.1 | MIT | Kiểm JWT trong `services/actions` |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause | Khóa, chữ ký cho PyJWT, pyHanko |

### Két bí mật, PKI, ký số

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| OpenBao (`openbao/openbao`) | 2.7.1 | **MPL-2.0** | Secret, AppRole từng dịch vụ, transit, ký Ed25519, CA nội bộ cho mTLS |
| pyHanko | 0.38.0 | MIT | Xác minh chữ ký số PDF đơn đăng ký (`legal_sign.py`), ký PAdES văn bản bằng chứng thư tổ chức (`org_sign.py`) |
| python-pkcs11 | 0.10.1 | MIT | Ký số qua HSM, token PKCS#11 (`org_sign.py`) |
| SoftHSM2 (gói Debian trong image `actions`) | 2.6 | BSD-2-Clause | Token PKCS#11 bằng phần mềm cho máy chưa có HSM, kiểm thử |
| pyhanko-certvalidator | 0.33.0 | MIT | Kiểm chuỗi chứng thư, OCSP/CRL |
| asn1crypto | 1.5.1 | MIT | Phân tích ASN.1 cho pyHanko |

### Kiểm dịch tệp, CDR

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| ClamAV (`clamav/clamav`; arm64: `clamav/clamav-debian`) | 1.4 | **GPL-2.0-only** | Quét virus theo mẫu (nhóm `scan`, bật ở mức RAM 16) |
| Pillow | 13.0.0 | MIT-CMU | Dựng lại ảnh khi CDR |
| pypdf | 7.0.0 | BSD-3-Clause | Đọc/dựng lại PDF bỏ nội dung chủ động |
| pypdfium2 (kèm PDFium) | 5.14.0 | Apache-2.0 OR BSD-3-Clause; PDFium BSD-3-Clause | Kết xuất trang PDF |
| openpyxl | 3.1.5 | MIT | Dựng lại tệp Office, nhập Excel hàng loạt |

### Che dữ liệu cá nhân

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| presidio-analyzer | 2.2.364 | MIT | Nhận diện CCCD, điện thoại, tài khoản, email theo mẫu Việt Nam (`pii_guard.py`) |
| presidio-anonymizer | 2.2.362 | MIT | Che PII trong nhật ký, ô trao đổi |
| spaCy | 3.8.16 | MIT | Bộ tách từ trống (`spacy.blank`) cho Presidio, không tải mô hình |

### Dữ liệu có cấu trúc và API dữ liệu

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| PostgreSQL + PostGIS (`imresamu/postgis`, bản đa kiến trúc dựng từ Dockerfile của postgis/docker-postgis; đổi bằng `BAMBOO_DB_IMAGE`) | 17-3.5 | PostgreSQL License; PostGIS **GPL-2.0-or-later** | Nguồn sự thật, phân quyền theo dòng, kiểm toán chuỗi hash |
| PostgreSQL (`postgres`, image migrate) | 17 | PostgreSQL License | Chạy migration `db/migrations` |
| Hasura GraphQL Engine CE (`hasura/graphql-engine`) | v2.51.0-ce | Apache-2.0 | GraphQL tự sinh, subscription, Action nghiệp vụ |
| psycopg (`psycopg[binary]`) | 3.3.6 | **LGPL-3.0-only** | Driver PostgreSQL cho `services/actions`, `services/seed` |
| psycopg-pool | 3.3.3 | **LGPL-3.0-only** | Pool kết nối |

### Dữ liệu phi cấu trúc: lưu trữ, tìm kiếm, sinh văn bản

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| SeaweedFS (`chrislusf/seaweedfs`) | 4.48 | Apache-2.0 | Lưu trữ đối tượng S3: tệp đính kèm, ổ đĩa, lakehouse |
| boto3 (kèm botocore) | 1.43.108 | Apache-2.0 | Client S3 trong `storage.py`, `attachments.py` |
| Apache Tika (`apache/tika`) | 4.1.0-1 | Apache-2.0 | Rút văn bản từ tệp để lập chỉ mục |
| Meilisearch Community (`getmeili/meilisearch`) | v1.54.3 | MIT | Tìm toàn văn, tìm vector |
| Gotenberg (`gotenberg/gotenberg`, bản chromium) | 8.37.0 | MIT; Chromium BSD-3-Clause và giấy phép từng thành phần | HTML → PDF cho phiếu, quyết định, báo cáo |
| Jinja2 | 3.1.6 | BSD-3-Clause | Mẫu văn bản `services/actions/app/templates` |

### Quy trình, tự động hóa

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Flowable REST (`flowable/flowable-rest`) | 8.0.0 | Apache-2.0 | Chạy BPMN, sandbox quy trình (`infra/platform/flowable`) |

### Trục sự kiện, CDC, Lakehouse

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Apache Kafka KRaft (`apache/kafka`) | 4.3.1 | Apache-2.0 | Trục sự kiện, SCRAM + ACL |
| Debezium Server (`quay.io/debezium/server`) | 3.7.0.Final | Apache-2.0 | CDC PostgreSQL → Kafka |
| kafka-python | 3.0.11 | Apache-2.0 | Đọc sự kiện trong image lakehouse |
| pyiceberg (`pyiceberg[pyarrow]`) | 0.12.0 | Apache-2.0 | Ghi bảng Iceberg bronze |
| pyarrow | 25.0.1 | Apache-2.0 | Định dạng cột cho Iceberg |
| SQLAlchemy | 2.1.3 | MIT | Catalog SQL của Iceberg |
| Trino (`trinodb/trino`) | 483 | Apache-2.0 | Truy vấn silver, lớp ngữ nghĩa BI, lọc theo tenant |

### IT/OT

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Eclipse Mosquitto (`eclipse-mosquitto`, image `bamboo-mosquitto` thêm cấu hình) | 2.0.21 | **EPL-2.0** OR EDL-1.0 | Broker MQTT có TLS, tài khoản theo công ty |
| paho-mqtt | 2.2.0 | **EPL-2.0** OR BSD-3-Clause | Client MQTT trong `iot_bridge.py`, `mqtt_admin.py` |

### Truyền thông

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Mailpit (`axllent/mailpit`) | v1.27 | MIT | Hộp thư thử cho email gửi ra |

Hàng đợi `msg.queue`, thử lại, hàng chết, biên nhận Ed25519 do dự án tự viết trên PostgreSQL.

### Nhật ký, truy vết, giám sát

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Vector (`timberio/vector`) | 0.46.1-debian | **MPL-2.0** | Gom log vào `obs.log_event` (tùy chọn) |
| OpenTelemetry Collector (`otel/opentelemetry-collector`) | 0.164.0 | Apache-2.0 | Nhận span OTLP |
| Jaeger (`jaegertracing/jaeger`) | 2.23.0 | Apache-2.0 | Xem truy vết |
| Prometheus (`prom/prometheus`) | v3.15.1 | Apache-2.0 | Số liệu, luật cảnh báo |
| Grafana OSS (`grafana/grafana-oss`) | 13.0.1 | **AGPL-3.0-only** | Bảng điều khiển dựng sẵn |
| opentelemetry-sdk, opentelemetry-exporter-otlp-proto-http | 1.45.2 | Apache-2.0 | Gửi span từ `services/actions` |
| opentelemetry-instrumentation-fastapi, -httpx, -psycopg | 0.66b2 | Apache-2.0 | Tự gắn span cho HTTP và SQL |
| prometheus-client | 0.26.0 | Apache-2.0 AND BSD-2-Clause | Xuất số liệu của actions |

### AI cục bộ

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Ollama (`ollama/ollama`; Mac: chạy ngoài Docker) | 0.35.1 | MIT; image kèm CUDA runtime (giấy phép NVIDIA) | Chạy mô hình chat và embedding, CPU hoặc GPU |
| Mô hình Qwen3-4B (`qwen3:4b`, biến `AI_CHAT_MODEL`) | thẻ 4b của registry Ollama | Apache-2.0 | Trợ lý RAG, tác tử, bước AI trong quy trình |
| Mô hình BGE-M3 (`bge-m3`, biến `AI_EMBED_MODEL`) | thẻ latest của registry Ollama | MIT | Vector cho tìm ngữ nghĩa |

### OCR tiếng Việt (`services/ocr`, image `bamboo-ocr`)

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Python (`python`, bản slim-bookworm) | 3.11 | PSF-2.0 | Nền image OCR |
| PyTorch, torchvision (bản CPU trong image; bản CUDA cu128 tải lúc chạy khi có GPU NVIDIA; Mac: PyPI, Metal) | 2.9.1, 0.24.1 | BSD-3-Clause | Chạy mô hình nhận dạng |
| PaddleOCR | 3.7.0 | Apache-2.0 | Dò vùng chữ |
| PaddleX | 3.7.2 | Apache-2.0 | Bộ chạy mô hình của PaddleOCR |
| VietOCR | 0.3.13 | Apache-2.0 | Nhận dạng chữ tiếng Việt |
| transformers | 5.20.2 | Apache-2.0 | Tải, chạy mô hình |
| opencv-contrib-python | 4.10.0.84 | Apache-2.0 (OpenCV); MIT (gói wheel) | Tiền xử lý ảnh |
| numpy, shapely | 2.3.5, 2.2.0 | BSD-3-Clause | Tính toán ảnh, hình học vùng chữ |
| pyclipper, einops, gdown | 1.4.0, 0.8.2, 6.4.2 | MIT | Mở rộng vùng chữ, biến đổi tensor, tải trọng số |
| Pillow (OCR ghim riêng) | 11.3.0 | MIT-CMU | Đọc ảnh |
| FastAPI, Uvicorn | 0.150.0, 0.54.0 | MIT, BSD-3-Clause | API của dịch vụ OCR |
| Triton, nvidia-* (CUDA, cuDNN…; chỉ tải vào volume `ocr-accel` khi có GPU NVIDIA) | 3.5.1; CUDA 12.8 | MIT; **NVIDIA Software License** | Tăng tốc GPU, không nằm trong image |

### Dịch vụ nghiệp vụ dùng chung (`services/actions`, `services/sleeper`, `services/seed`, `packages/py-common`)

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| Python (`python`, bản slim) | 3.13 | PSF-2.0 | Nền image actions, sleeper, seed, mô-đun mẫu |
| uv (`ghcr.io/astral-sh/uv`, chỉ lúc build) | 0.13.6 | MIT OR Apache-2.0 | Cài gói theo `uv.lock` |
| FastAPI | 0.142.2 | MIT | Hasura Actions, webhook xác thực, API mô-đun ngoài |
| Starlette | 1.7.0 | BSD-3-Clause | Nền của FastAPI |
| Pydantic | 2.13.5 | MIT | Kiểm dữ liệu vào |
| Uvicorn | 0.54.0 | BSD-3-Clause | Máy chủ ASGI |
| uvloop | 0.23.0 | MIT OR Apache-2.0 | Vòng sự kiện nhanh |
| httptools | 0.8.0 | MIT | Phân tích HTTP cho Uvicorn |
| httpx | 0.28.1 | BSD-3-Clause | Gọi Hasura, Flowable, Keycloak, Ollama…; dùng cả trong `py-common` |
| Faker | 40.40.0 | MIT | Sinh dữ liệu demo (`services/seed`) |

`services/sleeper` (bật/tắt dịch vụ theo nhu cầu, chọn GPU/CPU) chỉ dùng thư viện chuẩn Python.

### Ảnh nền, phục vụ ứng dụng web

| Thành phần | Phiên bản | Giấy phép | Dùng ở đâu, để làm gì |
|---|---|---|---|
| nginx (`nginxinc/nginx-unprivileged`, bản alpine) | 1.30 | BSD-2-Clause | Phục vụ bản build của `apps/web` |
| Node.js (`node`, bản alpine, chỉ lúc build) | 22 | MIT | Build `apps/web` trong image |

## Tầng 2: Không gian năng lực số (`apps/web`)

### Khung ứng dụng, giao diện

| Thư viện | Khai báo | Bản khóa | Giấy phép | Chức năng |
|---|---|---|---|---|
| react, react-dom | ^19.1.0 | 19.3.0 | MIT | Thư viện giao diện |
| @refinedev/core | ^5.0.8 | 5.0.12 | MIT | Khung CRUD, quyền, i18n |
| @refinedev/antd | ^6.0.1 | 6.0.3 | MIT | Ráp Refine với Ant Design |
| @refinedev/react-router | ^2.0.0 | 2.0.4 | MIT | Ráp Refine với bộ định tuyến |
| @refinedev/kbar | ^2.0.0 | 2.0.1 | MIT | Bảng lệnh Ctrl K |
| react-router | ^7.0.2 | 7.18.4 | MIT | Định tuyến |
| antd | ^5.23.0 | 5.29.3 | MIT | Bộ thành phần giao diện |
| @ant-design/icons | ^5.5.1 | 5.6.1 | MIT | Biểu tượng |
| lucide-react | ^1.53.0 | 1.53.0 | ISC | Biểu tượng bổ sung |
| dayjs | ^1.11.23 | 1.11.23 | MIT | Ngày giờ, định dạng `DD-MMM-YYYY` |

### Kết nối Tầng 1

| Thư viện | Khai báo | Bản khóa | Giấy phép | Chức năng |
|---|---|---|---|---|
| @refinedev/hasura | ^7.0.0 | 7.0.1 | MIT | Nguồn dữ liệu GraphQL của Hasura |
| graphql | ^15.6.1 | 15.10.3 | MIT | Phân tích truy vấn GraphQL |
| graphql-request | ^5.2.0 | 5.2.0 | MIT | Client GraphQL |
| graphql-tag | ^2.12.6 | 2.12.7 | MIT | Viết truy vấn trong mã |
| keycloak-js | ^25.0.1 | 25.0.6 | Apache-2.0 | Đăng nhập OIDC + PKCE |
| @react-keycloak/web | ^3.4.0 | 3.4.0 | MIT | Ráp Keycloak với React |

### Biểu đồ, sơ đồ quy trình

| Thư viện | Khai báo | Bản khóa | Giấy phép | Chức năng |
|---|---|---|---|---|
| recharts | ^3.10.1 | 3.10.1 | MIT | Biểu đồ KPI, Phân tích BI |
| diagram-js | ^15.28.0 | 15.28.0 | MIT | Khung vẽ cho lớp BPMN tự viết (`apps/web/src/bpmn`) |
| diagram-js-direct-editing | ^3.6.0 | 3.6.0 | MIT | Sửa nhãn tại chỗ |
| bpmn-moddle | ^10.3.1 | 10.3.1 | MIT | Đọc/ghi XML BPMN 2.0 |
| min-dash, min-dom, tiny-svg | ^5.1.0, ^5.3.0, ^4.1.4 | 5.1.0, 5.3.0, 4.1.4 | MIT | Tiện ích DOM/SVG cho lớp BPMN |

Không dùng `bpmn-js` (giấy phép bpmn.io chưa được OSI phê duyệt, ADR #81).

Toàn bộ cây phụ thuộc production của `apps/web` được `node tools/ci/check_licenses.mjs` kiểm chỉ gồm giấy phép
dễ dãi đã được OSI phê duyệt.

## Tầng 3: Nền tảng kinh doanh số

Chưa làm, không có thư viện riêng.

## Công cụ phát triển, kiểm thử, tài liệu (không nằm trong bản chạy)

### Quản lý mã nguồn, build

| Công cụ | Phiên bản | Giấy phép | Chức năng |
|---|---|---|---|
| pnpm (`packageManager`) | 12.16.1 | MIT | Quản lý gói JS, workspace |
| turbo | 2.11.10 | MIT | Chạy lint/build/test theo workspace |
| Node.js (`engines`) | ≥ 20 (image build dùng 22) | MIT | Chạy công cụ JS |
| vite | 6.4.3 (khai báo ^6.3.5) | MIT | Dev server, đóng gói web |
| @vitejs/plugin-react | 4.7.0 | MIT | Hỗ trợ React cho Vite |
| tailwindcss, @tailwindcss/vite | 4.3.3 | MIT | Lớp tiện ích CSS |
| @refinedev/cli | 2.16.52 | MIT | Lệnh `refine dev/build/start` |
| typescript | 5.9.3 | Apache-2.0 | Kiểm kiểu |
| @types/node, @types/react, @types/react-dom | 20.19.43, 19.3.0, 19.3.0 | MIT | Khai báo kiểu |
| uv | ≥ 0.13 (image 0.13.6) | MIT OR Apache-2.0 | Quản lý môi trường Python |

### Lint, định dạng, kiểm giấy phép

| Công cụ | Phiên bản | Giấy phép | Chức năng |
|---|---|---|---|
| eslint, @eslint/js | 9.39.5 | MIT | Lint JS/TS |
| typescript-eslint | 8.71.0 | MIT | Luật lint cho TS |
| eslint-plugin-react-hooks | 5.2.0 | MIT | Luật hook React |
| eslint-plugin-react-refresh | 0.4.26 | MIT | Luật HMR |
| globals | 16.5.0 | MIT | Danh sách biến toàn cục cho ESLint |
| prettier | 3.9.10 | MIT | Định dạng mã |
| ruff | 0.17.3 | MIT | Lint, định dạng Python |
| reuse | 5.1.1 | Apache-2.0 AND CC0-1.0 AND CC-BY-SA-4.0 AND **GPL-3.0-or-later** | Kiểm SPDX/REUSE (`REUSE.toml`) |

### Kiểm thử

| Công cụ | Phiên bản | Giấy phép | Chức năng |
|---|---|---|---|
| @playwright/test | 1.63.0 | Apache-2.0 | E2E `tests/e2e` |
| pytest | 9.1.1 | MIT | Test `services/actions`, `services/seed`, `services/sleeper` |
| PyYAML | 6.0.3 | MIT | Đọc tệp YAML trong test |

### Tài liệu (`docs/`)

| Công cụ | Phiên bản | Giấy phép | Chức năng |
|---|---|---|---|
| Sphinx | 8.2.3 | BSD-2-Clause | Dựng trang tài liệu |
| myst-parser | 4.0.1 | MIT | Viết tài liệu bằng Markdown |
| furo | 2025.12.19 | MIT | Giao diện trang |
| sphinxcontrib-mermaid | 2.1.1 | BSD-2-Clause | Sơ đồ Mermaid |
| sphinx-copybutton | 0.5.2 | MIT | Nút sao chép khối lệnh |
| sphinx-autobuild | 2025.8.25 | MIT | Tự dựng lại khi sửa |

## Thống kê giấy phép cây phụ thuộc JavaScript

Cài đặt hiện tại (`node_modules`, cả production và công cụ build của `apps/web`, `tests/e2e`) có 2.383 gói:

| Giấy phép | Số gói |
|---|---|
| MIT | 2.039 |
| ISC | 166 |
| Apache-2.0 | 66 |
| BSD-2-Clause | 46 |
| BSD-3-Clause | 24 |
| BlueOak-1.0.0 | 13 |
| 0BSD | 9 |
| MPL-2.0 | 5 |
| MIT OR CC0-1.0 | 4 |
| CC0-1.0 | 3 |
| Python-2.0, CC-BY-4.0, CC-BY-3.0, MIT AND ISC | 2 mỗi loại |

MPL-2.0, CC-BY và Python-2.0 chỉ nằm ở công cụ build (ví dụ dữ liệu `caniuse-lite` CC-BY-4.0), không vào bản
phát hành web.

## Giấy phép cần lưu ý và cách dự án dùng

| Giấy phép | Thành phần | Cách dùng |
|---|---|---|
| GPL-2.0-only | ClamAV | Chạy image upstream như một dịch vụ riêng, không sửa, không liên kết vào mã của dự án; tùy chọn (nhóm `scan`) |
| GPL-2.0-or-later | PostGIS | Phần mở rộng trong image CSDL upstream, không sửa |
| AGPL-3.0-only | Grafana OSS | Chạy image upstream riêng (nhóm `observability`), không sửa; chỉ dùng cấu hình bảng điều khiển |
| LGPL-3.0-only | psycopg, psycopg-pool | Dùng như thư viện qua `import`, không sửa |
| LGPL-2.1-or-later, LGPL-3.0-or-later | crc32c, python-bidi (phụ thuộc gián tiếp của OCR) | Dùng như thư viện, không sửa |
| MPL-2.0 | OpenBao, Vector, certifi, tqdm | Dùng nguyên bản, không sửa tệp nguồn |
| EPL-2.0 (lựa chọn kép) | Mosquitto, paho-mqtt | Dùng nguyên bản, không sửa; giấy phép cho chọn EDL-1.0 hoặc BSD-3-Clause |
| GPL-3.0-or-later | reuse | Chỉ là công cụ kiểm ở máy phát triển, không phân phối |
| NVIDIA Software License | CUDA runtime trong image Ollama; gói nvidia-* của OCR | Không nằm trong image do dự án dựng; Ollama kéo thẳng từ Docker Hub, OCR chỉ tải khi có GPU NVIDIA (`BAMBOO_GPU=false` để tắt) |

## Cập nhật danh sách

Khi đổi phiên bản hay thêm thư viện, cập nhật đồng thời tài liệu này và `NOTICE`. Lệnh lấy số liệu:

- JS: `node tools/ci/check_licenses.mjs` (kiểm giấy phép production); bản khóa trong `pnpm-lock.yaml`.
- Python: `uv tree --frozen` ở gốc repo và trong `services/ocr`; giấy phép xem trường `License-Expression` trong
  `*.dist-info/METADATA` của `.venv`.
- Image: `grep -h "image:" infra/compose/*.yml` và `grep FROM infra/docker/*.Dockerfile infra/platform/*/Dockerfile`.
