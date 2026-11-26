<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project

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

# Bamboo

Bài thi OLP Phần mềm nguồn mở 2026, chủ đề *Xây dựng Hệ điều hành Chuyển đổi số bằng Công nghệ Lõi nguồn mở (DX-OS Open-Core)*.

**Mục lục:** [Giấy phép](#giấy-phép) · [Giới thiệu](#giới-thiệu-về-bamboo) · [Thông tin phần mềm](#thông-tin-về-phần-mềm) ·
[Kiến trúc](#kiến-trúc-hệ-thống) · [Luồng dữ liệu](#các-luồng-dữ-liệu-chính) · [Chức năng](#chức-năng-có-sẵn-có-giao-diện) ·
[Cấu hình máy](#yêu-cầu-cấu-hình-máy-tính) · [Chạy bằng Docker](#chạy-bằng-một-lệnh-với-docker) ·
[Chạy native](#chạy-native-không-dùng-docker) · [Dữ liệu demo](#cơ-sở-dữ-liệu-demo)

## Giấy phép

Mã nguồn của Bamboo phát hành theo **[Apache License 2.0](LICENSE)**, một giấy phép được OSI phê duyệt. Toàn văn nằm ở
[`LICENSE`](LICENSE) và [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt).

- **Mục đích:** mọi tổ chức, doanh nghiệp được tự do dùng, sửa đổi, phân phối lại và tích hợp Bamboo (kể cả vào sản phẩm
  thương mại), với điều kiện giữ thông báo bản quyền, tệp [NOTICE](NOTICE) và ghi rõ phần đã thay đổi; người đóng góp cấp kèm
  quyền sáng chế.
- **Trong từng tệp:** mỗi tệp mã mang header của dự án (lấy từ [`docs/Header.txt`](docs/Header.txt), gắn bằng
  `python tools/header.py`) ghi bản quyền, `@license Apache-2.0` và thông báo giấy phép Apache-2.0; [REUSE.toml](REUSE.toml) khai báo giấy phép cho
  toàn bộ kho mã theo chuẩn [REUSE 3.3](https://reuse.software), kể cả tệp không ghi được header (JSON, ảnh...); tệp dữ liệu, cấu hình không chứa được chú thích (CSV, dữ liệu demo, `jvm.config`...) có thêm tệp `<tên>.license` đi kèm ghi SPDX. Biểu tượng mẫu của Refine theo MIT
  ([`LICENSES/MIT.txt`](LICENSES/MIT.txt)). Kiểm tra: `reuse lint`.
- **Thành phần bên thứ ba:** đều là phần mềm nguồn mở, dùng như dịch vụ hoặc thư viện không sửa đổi, không đóng gói kèm mã
  nguồn của dự án phụ thuộc. Danh sách và giấy phép từng thành phần: [NOTICE](NOTICE).

## Giới thiệu về Bamboo

### Vấn đề đặt ra

Khi chuyển đổi số, nhiều tổ chức rơi vào một trong hai thái cực:

- **Mua nhiều phần mềm rời rạc** cho từng phòng ban: mỗi hệ thống một tài khoản, một kho dữ liệu, một quy trình. Dữ liệu
  thành các "ốc đảo", không ai có bức tranh chung, cùng một việc phải nhập nhiều lần.
- **Mua một hệ thống nguyên khối** đồ sộ: khó nâng cấp, khó tùy biến, tổ chức phụ thuộc vào một nhà cung cấp và mất quyền làm
  chủ dữ liệu của chính mình.

Với một tập đoàn đa ngành, bài toán còn khó hơn: cơ cấu tổ chức nhiều tầng thay đổi liên tục, người kiêm nhiệm nhiều công ty,
hạn mức duyệt khác nhau theo công ty và nhóm hàng, dữ liệu nhạy cảm (nhân sự, y tế) phải cách ly, và mọi quyết định phải truy
vết được.

### Kiến trúc DX-OS được đề xuất

Bamboo giải bài toán bằng khung **DX-OS (Hệ điều hành Chuyển đổi số)** dựng trên công nghệ lõi nguồn mở (Open-Core), chia
thành ba tầng theo nguyên tắc phân tách mối quan tâm:

| Tầng | Vai trò | Trong Bamboo |
|---|---|---|
| **Tầng 1 – Nền tảng Dịch vụ Lõi số** | Chạy ngầm, không có giao diện người dùng (headless), cung cấp dịch vụ dùng chung như một PaaS: định danh, cổng API, dữ liệu có cấu trúc và phi cấu trúc, luồng công việc, kiểm toán, truyền thông | Keycloak, APISIX, PostgreSQL + Hasura, SeaweedFS, Flowable, OpenBao, Kafka, Iceberg, Trino... chỉ phục vụ qua cổng API |
| **Tầng 2 – Không gian Năng lực số** | Ứng dụng có giao diện cho nhân viên và quản lý, dùng dịch vụ của Tầng 1, tổ chức theo 4 không gian H-P-D-I | Ứng dụng web Refine với ứng dụng chính **Đề nghị mua sắm – thanh toán** và các trang của cả 4 không gian |
| **Tầng 3 – Nền tảng Kinh doanh số** | Ứng dụng nghiệp vụ chuyên ngành, cắm–rút linh hoạt (OMS, WMS, MES, EMR, CRM...) | Định hướng phát triển; cắm vào nền tảng theo cùng cách Tầng 2 đang dùng |

Thay đổi nghiệp vụ ở tầng trên không làm ảnh hưởng nền tảng ở tầng dưới. Nền tảng trung lập ngành: cơ cấu tổ chức, phân quyền,
hạn mức duyệt, danh mục đều là **dữ liệu doanh nghiệp tự khai báo**, không viết cứng trong mã. Kịch bản demo là **Tập đoàn X**
hư cấu: công ty mẹ, ba công ty con công nghiệp (Chip X, Điện thoại X, Gia dụng X) và Bệnh viện X tách tenant riêng.

### Mô hình 4 không gian H-P-D-I

Chuyển đổi số là chuỗi tiến hóa bốn bậc, bậc sau dựa trên bậc trước: không thể tự động hóa bằng AI khi dữ liệu chưa sạch,
và dữ liệu không sạch khi quy trình chưa chuẩn.

| Không gian | Mục tiêu | Bamboo hiện thực |
|---|---|---|
| **[H] Human – Con người số** | Môi trường làm việc số: định danh tập trung, giao tiếp, cộng tác, lưu trữ, tri thức | Đăng nhập một lần cho mọi công ty, hộp việc, thông báo đa kênh, ổ đĩa tài liệu, thư viện tri thức, tiếp nhận, điều chuyển, quyết định nhân sự |
| **[P] Process – Quy trình số** | Chuẩn hóa luồng nghiệp vụ, rào chắn kỹ thuật chống sai sót, số hóa hồ sơ, tự động hóa liên phòng ban | Đề nghị mua sắm với chuỗi duyệt tự tính theo cây tổ chức và hạn mức, đơn hàng nội bộ, thiết kế quy trình BPMN, quy trình tự động; ràng buộc nghiệp vụ nằm trong CSDL |
| **[D] Data – Dữ liệu số** | Một nguồn sự thật duy nhất, dữ liệu sạch và toàn vẹn, điều hành bằng số liệu thời gian thực | Trung tâm điều hành kèm bản đồ, Lakehouse (CDC → Iceberg → Trino), bản sao số, phả hệ dữ liệu, KPI đóng băng theo kỳ, sổ cái đối soát chuỗi hash |
| **[I] Intelligence – Trí tuệ số** | AI và tác tử AI phân tích, hỗ trợ quyết định, con người vẫn duyệt ngoại lệ | Tìm kiếm toàn văn và ngữ nghĩa, Trợ lý RAG trích nguồn theo tên văn bản, Phân tích BI, OCR tiếng Việt điền sẵn chứng từ để người dùng kiểm, quản trị tác tử AI; mô hình chạy cục bộ, dữ liệu không rời hệ thống |

## Thông tin về phần mềm

| | |
|---|---|
| Mã nguồn | <https://github.com/ThanhNLT/CTU_Bamboo> |
| Báo lỗi, đề xuất | [GitHub Issues](https://github.com/ThanhNLT/CTU_Bamboo/issues) (có mẫu báo lỗi và đề xuất); lỗ hổng bảo mật: [SECURITY.md](SECURITY.md) |
| Hỏi đáp, trao đổi | [GitHub Discussions](https://github.com/ThanhNLT/CTU_Bamboo/discussions); các kênh hỗ trợ: [SUPPORT.md](SUPPORT.md) |
| Đóng góp | [CONTRIBUTING.md](CONTRIBUTING.md), [Quy tắc ứng xử](CODE_OF_CONDUCT.md) |
| Lịch sử thay đổi | [CHANGELOG.md](CHANGELOG.md) theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số theo [Semantic Versioning](https://semver.org/lang/vi/) |
| Giấy phép | [Apache-2.0](LICENSE) |
| Tài liệu kỹ thuật | [`docs/`](docs/) (Sphinx, build bằng `make -C docs html`): [yêu cầu đề thi và đối chiếu](docs/tong-quan/01-yeu-cau-va-kien-truc.md), [thiết kế CSDL](docs/thiet-ke/03-thiet-ke-csdl.md), [dịch vụ nền tảng](docs/thiet-ke/06-dich-vu-nen-tang.md), [API](docs/thiet-ke/08-api-giao-dien.md), [nhật ký quyết định kiến trúc (ADR)](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md), [triển khai production](docs/van-hanh/trien-khai.md), [khởi tạo cho công ty mới](docs/van-hanh/cong-ty-moi.md) |
| Thuật ngữ nghiệp vụ | [CONTEXT.md](CONTEXT.md) |

### Các phiên bản đã phát hành

Bản phát hành ở [GitHub Releases](https://github.com/ThanhNLT/CTU_Bamboo/releases), mỗi bản gồm mã nguồn `bamboo-<phiên bản>.tar.gz`
và `SHA256SUMS`; bản 0.1.0–0.3.0 và từ 0.5.2 có thêm `compose.release.yml` và image dựng sẵn (amd64, arm64) trên GitHub
Container Registry. Định dạng
phát hành chính thức là `.tar.gz` (tệp zip do GitHub tự sinh kèm mỗi bản).

| Phiên bản | Ngày | Nội dung chính |
|---|---|---|
| [0.5.2](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.5.2) | 24/11/2026 | Hạn mức dung lượng 5 GB mỗi tài khoản, AI tự tắt kèm lý do khi máy thiếu RAM, Mac Apple Silicon chạy CSDL và ClamAV bản arm64 và AI trên GPU Metal, trợ lý AI trả lời theo ngôn ngữ câu hỏi; NOTICE liệt kê đủ thư viện và giấy phép, tệp `.license` cho tệp không ghi được header; sửa `make up` trên Mac và câu trả lời của trợ lý lẫn phần lập luận của mô hình |
| [0.5.1](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.5.1) | 14/11/2026 | Dịch và cài đặt từ mã nguồn bằng `make`, GitOps tự chạy theo chu kỳ, tắt giao diện web của OpenBao và Hasura Console, tài liệu cho người đóng góp; sửa cổng API trả 404 và dịch vụ tự tắt khi `docker compose up`; sửa không tạo được công ty khi đăng ký (lỗi 500, tài khoản mới báo "chưa thuộc tenant nào"), công ty mới dùng được ngay mọi công cụ đã chọn, doanh nghiệp vừa và nhỏ khai mã số thuế sau, tên hệ thống hiển thị "Bamboo", đồng bộ ngôn ngữ và khoảng cách giao diện |
| [0.5.0](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.5.0) | 13/11/2026 | Thông báo giấy phép Apache-2.0 trong từng tệp, bỏ thành phần chưa được OSI phê duyệt (bpmn-js, CUDA trong image OCR), hoàn thiện Tầng 1 (CDR, MQTT/NGSI-LD, giám sát, mTLS nội bộ, kịch bản tự viết, tác tử AI tự hành động), AI tự nhận GPU, thông báo theo ngôn ngữ đang chọn, ngày và số theo định dạng quốc tế |
| [0.4.0](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.4.0) | 29/10/2026 | Nhân sự (tiếp nhận, điều chuyển, quyết định), đơn hàng nội bộ, che dữ liệu cá nhân, Lakehouse (CDC → Iceberg → Trino), quản trị tổ chức, sổ cái, thiết kế và chạy tự động quy trình, thư viện tri thức, trung tâm điều hành, bản sao số, phả hệ, AI cục bộ (RAG, tác tử), OCR tiếng Việt, quét tệp, thông báo đa kênh, neo kiểm toán, nhật ký, sao lưu, nạp lô; tài liệu cập nhật |
| [0.3.0](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.3.0) | 05/10/2026 | Tìm kiếm toàn văn (Meilisearch + Tika), mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu, script sao lưu và khôi phục |
| [0.2.0](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.2.0) | 04/10/2026 | Cổng API APISIX là điểm vào duy nhất (WAF, kiểm token tại biên, giới hạn tần suất) |
| [0.1.0](https://github.com/ThanhNLT/CTU_Bamboo/releases/tag/v0.1.0) | 04/10/2026 | Bản đầu: cơ cấu tổ chức, phân quyền, chuỗi duyệt, đề nghị mua sắm, kiểm toán chuỗi hash, tệp đính kèm, OpenBao, Flowable, giao diện Refine |

### Cấu trúc mã nguồn

Monorepo xếp theo vai trò ([ADR #60](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md)); gốc repo chỉ giữ tệp "cửa vào"
(`compose.yaml`, `Makefile`, `package.json`, `pyproject.toml`, các tệp khóa phiên bản).

```text
apps/web/            Giao diện Refine (package pnpm @bamboo/web)
services/            Dịch vụ Python: actions, seed, ocr, sleeper
packages/py-common/  Gói Python dùng chung bamboo-common (client OpenBao, Flowable, Ollama, quét tệp, mã hóa PII)
infra/compose/       Định nghĩa dịch vụ theo nhóm (core, data, ai, scan, test, gpu), compose.yaml ở gốc include
infra/docker/        Dockerfile của mọi image Bamboo
infra/platform/      Cấu hình dịch vụ bên thứ ba: APISIX, Flowable, Hasura, Kafka, Keycloak, OpenBao, Trino, Vector
infra/k8s/           Chỗ dành sẵn cho k3s/GitOps (chưa có manifest)
db/                  Migration, vai trò CSDL, kiểm thử SQL
tools/               Script CI, CSDL, vận hành, sao lưu, GitOps, phát hành, cài đặt, smoke AI/OCR
tests/e2e/           Kiểm thử đầu–cuối Playwright (package pnpm @bamboo/e2e)
examples/            Ví dụ cho bên thứ ba: mô-đun ngoài mẫu mo-dun-mau (ADR #58)
docs/                Tài liệu kỹ thuật (Sphinx)
```

JS là pnpm workspace + Turborepo (`pnpm-lock.yaml`), Python là uv workspace (`uv.lock`, riêng OCR có `services/ocr/uv.lock`).
Kiểm tra tĩnh toàn repo giống CI: `make check` (cần `uv`, `pnpm`, Docker).

## Kiến trúc hệ thống

```text
Trình duyệt / ứng dụng ──► Cổng API APISIX :8000 (một điểm vào; WAF Coraza + OWASP CRS, kiểm token tại biên, giới hạn tần suất, X-Request-Id)
   ├── /                    → web (Refine + Ant Design)                                  ── TẦNG 2
   ├── /realms, /resources  → Keycloak (OIDC + PKCE, MFA; realm master bị chặn)           ┐
   ├── /graphql             → Hasura ──auth webhook──► actions (FastAPI)                  │
   │                           │   Hasura Actions: gửi duyệt, duyệt, tệp, AI, quy trình...│
   │                           └──► PostgreSQL + PostGIS (nguồn sự thật, phân quyền theo dòng, kiểm toán chuỗi hash)
   ├── /bms-quarantine, /bms-documents → SeaweedFS S3 (link có chữ ký)                    │  TẦNG 1
   ├── /ingest/*            → nạp dữ liệu theo lô                                         │  (headless)
   └── /hooks/*             → webhook khởi chạy quy trình tự động                         ┘
Tiến trình nền: flow-sync (CSDL ↔ Flowable, thông báo đa kênh, neo kiểm toán, quy trình tự động) · search-sync (Tika → Meilisearch)
                ai-worker (Ollama, OCR) · Debezium → Kafka → lakehouse-sink → Iceberg → Trino · backup · sleeper (cho dịch vụ dùng thưa ngủ)
Két bí mật: OpenBao (secret, khóa S3, mã hóa dữ liệu nhạy cảm, ký Ed25519)
```

Tầng 1 không có giao diện: ứng dụng chỉ gọi qua cổng API. Giao diện web của OpenBao và Hasura Console tắt mặc định
([ADR #82](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md)). Công cụ quản trị có sẵn trong các sản phẩm upstream còn lại
(Keycloak Admin, Trino, Mailpit...) chỉ nghe `127.0.0.1` trên máy chủ, không đi qua cổng API, dành cho người vận hành.

### Thành phần, thư viện và giấy phép

Mức: **Có** = đã hiện thực, có kiểm thử; **Một phần** = có nhưng đơn giản hơn mục tiêu (xem cột Chức năng).

| Thành phần | Công nghệ | Giấy phép | Chức năng | Mức |
|---|---|---|---|---|
| Cổng API, WAF | Apache APISIX 3.19, Coraza + OWASP CRS | Apache-2.0 | Một điểm vào, kiểm token tại biên, WAF, giới hạn tần suất, websocket | Có |
| Định danh, SSO, MFA | Keycloak 26 | Apache-2.0 | Đăng nhập OIDC + PKCE, một tài khoản nhiều tenant, OTP bắt buộc cho quản trị nền tảng | Có |
| API dữ liệu | Hasura GraphQL Engine v2 CE | Apache-2.0 | Tự sinh GraphQL từ CSDL, phân quyền theo dòng, subscription thời gian thực, 99 Action nghiệp vụ | Có |
| Dữ liệu có cấu trúc | PostgreSQL 17 + PostGIS 3.5 | PostgreSQL, GPL-2.0-or-later (PostGIS) | Nguồn sự thật, ràng buộc nghiệp vụ, nhật ký kiểm toán chuỗi hash, KPI đóng băng | Có |
| Quy trình | Flowable REST 8; diagram-js, bpmn-moddle (lớp BPMN tự viết) | Apache-2.0; MIT | Luồng duyệt BPMN, thiết kế quy trình trên giao diện, chạy thử sandbox, quy trình tự động (hẹn giờ, webhook, sự kiện) | Có |
| Lưu trữ đối tượng | SeaweedFS 4 | Apache-2.0 | Tệp đính kèm, ổ đĩa, Lakehouse; bucket kiểm dịch, link có chữ ký | Có |
| Két bí mật, ký số | OpenBao 2 | MPL-2.0 | Secret, AppRole riêng từng dịch vụ, mã hóa dữ liệu nhạy cảm, chữ ký Ed25519 cho biên nhận và bản neo | Có |
| Quét tệp, CDR | Bộ quét nội bộ Bamboo, CDR (Pillow, pypdf); ClamAV 1.4 (bật ở mức RAM 16) | Apache-2.0, MIT-CMU, BSD-3-Clause; GPL-2.0-only | Kiểm cấu trúc, macro, mã chủ động, tệp nhúng, bom nén; dựng lại ảnh, Office, PDF bỏ nội dung chủ động; ClamAV quét theo mẫu virus | Có |
| Tìm kiếm | Meilisearch 1 Community, Apache Tika 4 | MIT, Apache-2.0 | Tìm toàn văn có dấu/không dấu trong chứng từ và nội dung tệp, lọc lại theo quyền; tìm ngữ nghĩa bằng vector | Có |
| Sinh văn bản PDF | Gotenberg 8 (Chromium), Jinja2 | MIT, BSD-3-Clause | Phiếu đề nghị, quyết định nhân sự, báo cáo KPI; mã kiểm tra là mã băm nội dung | Có |
| CDC, trục sự kiện | Debezium Server 3, Apache Kafka 4 (KRaft) | Apache-2.0 | Đẩy mọi thay đổi của CSDL vào Kafka, SCRAM + ACL | Có |
| Lakehouse | Apache Iceberg (pyiceberg, pyarrow), Trino 483 | Apache-2.0 | Lịch sử thay đổi (bronze), trạng thái hiện tại có kiểu (silver), lớp ngữ nghĩa, lọc theo tenant | Có |
| AI cục bộ | Ollama 0.35, Qwen3-4B (chat), bge-m3 (vector) | MIT, Apache-2.0, MIT | Trợ lý RAG có trích dẫn, guardrail, tìm ngữ nghĩa; chạy CPU hoặc GPU | Có |
| OCR tiếng Việt | PaddleOCR + VietOCR trên PyTorch | Apache-2.0, BSD-3-Clause | Đọc bản quét, rút nhà cung cấp, mã số thuế, dòng hàng, số tiền để điền chứng từ | Có |
| IT/OT | Eclipse Mosquitto 2 (dynamic-security), paho-mqtt; NGSI-LD | EPL-2.0/EDL-1.0 | Thiết bị gửi số đo qua MQTT (TLS, tài khoản theo công ty) hoặc REST NGSI-LD vào bản sao số | Có |
| Che dữ liệu cá nhân | Microsoft Presidio | MIT | Nhận diện CCCD, điện thoại, tài khoản, email theo mẫu Việt Nam; bản che trong nhật ký và ô trao đổi | Có |
| Thông báo đa kênh | Hàng đợi `msg.queue` trong PostgreSQL; Mailpit (hộp thư thử) | –; MIT | Email, SMS, webhook có thử lại, hàng chết, biên nhận có chữ ký chống chối bỏ | Có |
| Nhật ký, truy vết, giám sát | Vector 0.46 (tùy chọn), bảng `obs.log_event`; OpenTelemetry Collector, Jaeger 2, Prometheus 3, Grafana 13 (nhóm `observability`) | MPL-2.0; Apache-2.0; AGPL-3.0-only (Grafana, chạy riêng, không sửa) | Log kèm `X-Request-Id`, đã che dữ liệu cá nhân; span theo yêu cầu và câu lệnh SQL; số liệu, bảng điều khiển, cảnh báo | Có |
| Sao lưu, GitOps | Script `tools/ops`, `tools/gitops` | Apache-2.0 | Sao lưu theo lịch, diễn tập khôi phục có kiểm chuỗi hash; đối chiếu hệ thống với cấu hình trong Git theo chu kỳ (systemd timer hoặc cron, tự bật khi `BAMBOO_ENV=production`) | Một phần (không dùng Argo CD, Kubernetes) |
| Dịch vụ nghiệp vụ | Python 3.13, FastAPI, psycopg | MIT, LGPL-3.0 (psycopg, dùng như thư viện) | Hasura Actions, xác thực, đồng bộ, worker nền, job khởi tạo | Có |
| Giao diện | Refine 5, React 19, Ant Design 5 | MIT | Ứng dụng web Tầng 2, đầy đủ tiếng Việt và tiếng Anh | Có |

Danh sách đầy đủ thư viện Python, JavaScript và giấy phép: [NOTICE](NOTICE). Lý do chọn từng công nghệ và phương án đã loại:
[nhật ký quyết định kiến trúc](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md).

### Đang làm và dự kiến

Chưa có trong phiên bản hiện tại, là hướng phát triển tiếp theo:

- **Bảo mật:** mTLS cho các chặng HTTP nội bộ còn lại (APISIX, Hasura, Keycloak, Flowable: cần sidecar hoặc service mesh);
  ký số theo từng pháp nhân khi một cài đặt có nhiều công ty khác mã số thuế.
- **Vận hành:** chuyển sang Kubernetes (k3s) và Argo CD; span của APISIX, Hasura.
- **Nghiệp vụ:** nhận hàng, hóa đơn, thanh toán, đối trừ công nợ nội bộ; giao diện sửa quy tắc hạn mức duyệt; dịch thông báo
  lỗi do máy chủ trả về sang tiếng Anh.
- **Lakehouse:** chính sách vòng đời và xóa dữ liệu.
- **Tầng 3:** ứng dụng ngành (OMS, WMS, MES/SCADA, EMR, CRM) cắm vào nền tảng.

Giới hạn hiện tại khác: cách ly tenant là cách ly logic trong cùng một PostgreSQL (khóa kép `tenant_id`, phân quyền theo dòng),
không phải CSDL riêng; quy trình tự thiết kế chưa thay luồng duyệt đang chạy; OCR rút trường bằng quy tắc nên mẫu lạ phải nhập
tay; mô hình AI 4B chạy CPU mất 30–90 giây mỗi lượt hỏi.

## Các luồng dữ liệu chính

```mermaid
flowchart LR
  U[Người dùng] -->|OIDC + PKCE| KC[Keycloak]
  U -->|GraphQL + token| GW[APISIX]
  GW --> H[Hasura]
  H -->|Action| A[actions]
  H --> PG[(PostgreSQL)]
  A --> PG
  PG -->|NOTIFY| FS[flow-sync] --> FL[Flowable]
  FS --> Q[(msg.queue)] -->|email, SMS, webhook| OUT[Kênh ngoài]
  PG -->|search.pending| SS[search-sync] --> MS[Meilisearch]
  U -->|PUT/GET link có chữ ký| S3[SeaweedFS]
  PG -->|WAL| DBZ[Debezium] --> K[Kafka] --> LS[lakehouse-sink] --> ICE[(Iceberg)] --> TR[Trino]
  A --> OL[Ollama / OCR]
```

1. **Đăng nhập và phân quyền:** trình duyệt đăng nhập Keycloak (OIDC + PKCE) rồi gọi `/graphql` kèm token và tenant đã chọn.
   Cổng API kiểm token trước khi chuyển tiếp; Hasura hỏi `actions` (webhook) để biết người dùng là ai trong tenant đó; mọi truy
   vấn bị lọc theo `tenant_id` và quyền theo dòng.
2. **Lập và duyệt chứng từ:** người dùng lập đề nghị (nháp ghi thẳng qua Hasura), gửi duyệt bằng Action. CSDL tính chuỗi duyệt
   theo vị trí người lập, cây tổ chức và hạn mức; khi đến lượt mỗi bước tìm người đang giữ vị trí (trống, trùng người lập hoặc
   xung đột thì đẩy lên cấp trên). Việc duyệt vào hộp việc qua subscription; `flow-sync` phản chiếu từng bước sang Flowable để
   xem sơ đồ. Duyệt đề nghị mua từ công ty nội bộ thì tự sinh đơn hàng nội bộ, bên bán xác nhận kèm lô thì tự sinh đơn mua.
3. **Tệp đính kèm:** xin link có chữ ký → trình duyệt tải thẳng lên bucket kiểm dịch → xác nhận → quét (bộ quét nội bộ, ClamAV
   nếu bật) → sạch thì chuyển sang bucket tài liệu và ghi SHA-256; tải về bằng link có chữ ký 5 phút.
4. **Tìm kiếm:** trigger đánh dấu bản ghi thay đổi; `search-sync` trích chữ bằng Tika (OCR nếu là bản quét) rồi đánh chỉ mục
   Meilisearch; kết quả tìm được kiểm lại quyền xem trong CSDL trước khi trả về.
5. **Kiểm toán:** mọi thay đổi quan trọng ghi `audit.log` nối chuỗi hash theo tenant; định kỳ đầu chuỗi được ký bằng OpenBao và
   công bố ra ngoài CSDL (neo), nên sửa hay cắt lịch sử đều bị phát hiện.
6. **Thông báo:** trigger sinh thông báo trong ứng dụng; theo lựa chọn của từng người, tin vào hàng đợi và được gửi qua email,
   SMS, webhook, mỗi tin giao xong có biên nhận ký số.
7. **Dữ liệu lịch sử và phân tích:** Debezium đọc WAL của PostgreSQL vào Kafka; `lakehouse-sink` ghi Iceberg (bronze); Trino
   dựng view silver và lớp ngữ nghĩa cho Trung tâm điều hành, Dịch vụ dữ liệu, mà không truy vấn CSDL nghiệp vụ.
8. **AI:** câu hỏi vào hàng đợi; `ai-worker` tìm đoạn tài liệu thư viện người hỏi được xem, ghép prompt có guardrail và gọi
   Ollama, trả lời dần kèm trích dẫn. Bản quét được OCR, kết quả điền vào đề nghị nháp để người dùng kiểm rồi mới gửi.

## Chức năng có sẵn (có giao diện)

| Không gian | Trang | Đường dẫn |
|---|---|---|
| [H] Con người số | Hộp việc, hộp việc duyệt (cả việc nhận qua ủy quyền) | `/p/tasks`, `/p/inbox` |
| | Ổ đĩa tài liệu (hạn mức theo tenant) | `/h/drive` |
| | Thư viện tri thức: đề xuất tài liệu qua chuỗi duyệt, xuất bản, tìm toàn văn | `/h/library` |
| | Tiếp nhận nhân sự: dữ liệu nhạy cảm mã hóa, xem đầy đủ có ghi nhật ký, tự tạo tài khoản | `/h/onboarding` |
| | Điều chuyển nội bộ và liên tập đoàn | `/h/transfer` |
| | Quyết định nhân sự (in PDF) | `/h/decisions` |
| | Kênh nhận thông báo (email, SMS, webhook) | `/settings/notifications` |
| | Tin nhắn: nhắn riêng, nhóm, kênh phòng ban tự đồng bộ theo phân công; @nhắc tên, gửi tệp, thu hồi, đã xem | `/h/chat` |
| | Lịch công tác ngày/tuần/tháng/quý: lịch cá nhân, lịch chung của đơn vị, mời họp, báo trùng giờ, nhắc lịch, xuất `.ics` | `/h/calendar` |
| | Ứng dụng web cho thiết bị di động: cài lên màn hình chính, thanh điều hướng dưới, thông báo trên thiết bị | (mọi trang) |
| [P] Quy trình số | **Đề nghị mua sắm**: lập, dòng hàng, đính kèm, gửi duyệt, duyệt / trả về / từ chối, hủy, bình luận, in phiếu, sơ đồ quy trình | `/p/documents` |
| | Đơn hàng nội bộ: xác nhận kèm lô, từ chối, hủy | `/p/ic-orders` |
| | Hồ sơ chứng từ | `/p/records` |
| | Thiết kế quy trình BPMN: vẽ, kiểm lỗi, chạy thử, phát hành, yêu cầu sửa, chạy tự động | `/p/process` |
| | Dự án và kế hoạch: văn bản kế hoạch chi tiết, WBS, phụ thuộc tự dời lịch, sơ đồ Gantt, đường găng, đường cơ sở, báo cáo tiến độ theo kỳ (in PDF) | `/p/projects` |
| | Quản trị: cơ cấu tổ chức, người dùng, vai trò và phân quyền, danh mục và dữ liệu chủ (có nhập Excel) | `/admin/org`, `/admin/people`, `/admin/roles`, `/admin/catalog` |
| [D] Dữ liệu số | Trung tâm điều hành thời gian thực kèm bản đồ cơ sở (quy trình, sản xuất, bệnh viện, chất lượng) | `/d/ops` |
| | Dịch vụ dữ liệu trên Lakehouse | `/d/services` |
| | Bản sao số phòng sạch: chuỗi đo, ngưỡng, sự cố, ghi nhận sự cố | `/d/twin` |
| | Phả hệ dữ liệu thu tự động, đối chiếu chất lượng PostgreSQL ↔ Lakehouse, báo sự cố dữ liệu | `/d/lineage` |
| | Cổng dịch vụ API: REST `/api/v1` có OpenAPI, khóa API theo công ty (phạm vi, hạn dùng, dải IP, thu hồi) | `/d/api` |
| | Sổ cái: đối soát tệp với chuỗi hash, phòng đọc chỉ đọc | `/d/ledger` |
| | Nhật ký kiểm toán (bản che), đối soát chuỗi hash | `/admin/audit-logs` |
| [I] Trí tuệ số | Tìm kiếm toàn văn và ngữ nghĩa | `/i/search` |
| | Trợ lý RAG trích nguồn theo tên văn bản, dùng lại câu trả lời đã có | `/i/assistant` |
| | Phân tích BI: chọn chỉ số, vẽ và lưu biểu đồ, xuất CSV | `/i/bi` |
| | Nhập liệu OCR: bản quét → đề nghị nháp | `/i/ocr` |
| | Quản trị tác tử AI: mô hình, guardrail, tốc độ, tài nguyên | `/i/agents` |
| Vận hành | Hàng đợi tin nhắn (đưa lại tin chết, xác minh biên nhận) | `/admin/queue` |
| | Vận hành hệ thống: nhật ký tập trung, neo kiểm toán, sao lưu | `/admin/ops` |

Trang AI và OCR tự chọn nơi chạy: GPU NVIDIA nếu máy có, GPU Apple (Metal) trên Mac Apple Silicon, không có GPU thì CPU khi Docker có từ 7 GB RAM (máy 8 GB chạy được, chậm hơn khi đổi mô hình); dưới mức đó AI tắt và báo lý do (xem mục dưới).

## Yêu cầu cấu hình máy tính

| | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 4 nhân (vCPU) | 8 nhân |
| RAM Docker thấy được | 8 GB (đầy đủ gồm AI và OCR; mỗi lúc một mô hình AI, lượt hỏi đầu sau khi nhàn rỗi chậm hơn) | 16 GB (đầy đủ, mô hình hỏi đáp và mô hình nhúng cùng nằm trên RAM); thêm 2 GB nếu bật ClamAV |
| Ổ đĩa | 20 GB SSD trống | 50 GB SSD (image OCR khoảng 14 GB, mô hình AI khoảng 3,7 GB) |
| GPU | Không cần (AI chạy CPU khi Docker có từ 7 GB RAM) | NVIDIA 8 GB VRAM trở lên (đã kiểm trên RTX 4060), hoặc Mac Apple Silicon 16 GB (AI chạy GPU Metal ngoài Docker, cần `brew install ollama uv`) |
| Hệ điều hành | Linux, macOS, Windows 10/11 với WSL2 | Linux |
| Kiến trúc | amd64 hoặc arm64 (`make up` tự dùng bản arm64 của PostGIS, ClamAV) | amd64 |
| Phần mềm | Docker Engine 25+ với Docker Compose v2 | Docker Compose 2.40.2+ (chạy image dựng sẵn từ OCI) |

Trên Windows, đặt mã nguồn trong hệ thống tệp của WSL2 ([ADR #12](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md)). WSL2 mặc định
chỉ cấp một nửa RAM máy: máy 16 GB muốn chạy đầy đủ thì đặt `memory=12GB` trong `%UserProfile%\.wslconfig` rồi `wsl --shutdown`.
Lần đầu cần Internet để tải image và mô hình; sau đó chạy được không cần Internet.

## Chạy bằng một lệnh với Docker

```bash
git clone https://github.com/ThanhNLT/CTU_Bamboo.git
cd Bamboo
make up        # đầy đủ gồm AI ở mọi mức RAM; máy 8 GB tự tiết kiệm RAM hơn (BAMBOO_RAM=8 hoặc 16 để chọn tay)
```

Không có `make` thì dùng `docker compose up -d` (cũng chạy đầy đủ, gồm AI). Không cần tạo `.env` hay chạy migration tay: lệnh build
image từ mã nguồn rồi tự chạy theo thứ tự migration CSDL, nạp dữ liệu demo, khởi tạo OpenBao, tạo bucket S3, deploy BPMN, nạp
metadata Hasura. Lần đầu mất khoảng 5–10 phút. Theo dõi:

```bash
docker compose ps          # dịch vụ chạy lâu phải "healthy"; migrate, seed, openbao-init, bootstrap "exited (0)"
docker compose logs -f bootstrap
```

Mở **<http://localhost:8000>** (dùng đúng `localhost`, không dùng `127.0.0.1`), bấm **Đăng nhập bằng tài khoản tập đoàn**, dùng
một tài khoản ở mục [Cơ sở dữ liệu demo](#cơ-sở-dữ-liệu-demo) với mật khẩu `demo-password`.

- **Clone trên Windows** (PowerShell, Git for Windows): `.gitattributes` buộc mọi tệp văn bản checkout với LF, và các image
  tự bỏ CRLF khỏi script, nên `docker compose up -d` chạy được cả khi `core.autocrlf=true`. Bản clone cũ (trước khi có
  `.gitattributes`) vẫn mang CRLF trong thư mục làm việc: sau `git pull` chạy `git rm -r -q --cached . && git reset --hard`
  (xóa thay đổi chưa commit) để checkout lại với LF. Triệu chứng của CRLF: `docker compose logs migrate` báo
  `env: 'bash\r': No such file or directory`, các dịch vụ còn lại không lên và trang đăng nhập không mở được.
- **`make up` và `docker compose up` phải chạy trên cùng một bản clone:** hai lệnh dùng chung tên dự án `bamboo` (chung
  image, volume), nên chạy `make up` ở một bản clone cũ (ví dụ trong WSL) sẽ dựng lại giao diện cũ đè lên.
- **GPU NVIDIA:** không cần cấu hình gì. Máy có card NVIDIA (Docker Desktop WSL2, hoặc Linux có `nvidia-container-toolkit`)
  thì vài phút sau khi hệ thống lên, AI và OCR tự chuyển sang GPU; không có card hoặc GPU lỗi thì chạy trên CPU/RAM
  (`docker compose logs sleeper` ghi đã chọn gì). `BAMBOO_GPU=false` trong `.env` để luôn chạy CPU. Image OCR chỉ gồm phần
  mềm nguồn mở (PyTorch bản CPU); lần đầu trên máy có GPU, hệ thống tự tải PyTorch bản CUDA (khoảng 6,6 GB, kèm thư viện CUDA/cuDNN
  theo giấy phép NVIDIA) vào volume `ocr-accel` rồi mới chuyển OCR sang GPU, cần Internet.
- **Dịch vụ dùng thưa** (Trino, Tika, Gotenberg, Ollama, OCR) ngủ sau 5 phút nhàn rỗi và tự dậy khi được gọi; lần gọi đầu chậm
  hơn. Trước buổi demo chạy `tools/demo_prepare.sh` để làm nóng.
- **Bật thêm:** ClamAV `docker compose --profile scan up -d` (đặt `CLAMAV_HOST=clamav`), gom log container
  `COMPOSE_PROFILES=logs`.
- **Dừng:** `docker compose down` (giữ dữ liệu), `docker compose down -v` (xóa sạch, kể cả khóa OpenBao).
- **Cấu hình:** mọi biến có giá trị mặc định cho máy dev; muốn đổi thì `cp .env.example .env` rồi sửa. Triển khai thật (tên miền
  HTTPS, `BAMBOO_ENV=production`, sao lưu, nâng cấp): [Triển khai production](docs/van-hanh/trien-khai.md).

**Chạy bằng image dựng sẵn**, không cần mã nguồn (Docker Compose 2.40.2+; kho và gói GHCR phải ở chế độ công khai). Image dựng sẵn
có cho bản 0.1.0–0.3.0 và từ 0.5.2 (amd64 và arm64, Mac Apple Silicon chạy native); bản 0.4.0–0.5.1 chạy từ mã nguồn bằng lệnh
ở trên.

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.5.2 up -d -y
```

Hoặc tải `compose.release.yml` ở trang phát hành rồi `docker compose -f compose.release.yml up -d`.

**Công cụ vận hành** (giá trị mặc định cho máy dev; chỉ nghe `127.0.0.1`, không đi qua cổng API):

| Thành phần | Địa chỉ | Đăng nhập |
|---|---|---|
| Keycloak | <http://localhost:8080/admin> | `kcadmin` / `kcadmin-dev` |
| Hasura (API metadata; Console tắt mặc định) | <http://localhost:8081> | admin secret `dev-admin-secret`; bật Console khi gỡ lỗi: `HASURA_ENABLE_CONSOLE=true` trong `.env` |
| OpenBao (API, không có giao diện web) | <http://localhost:8200> | CLI `bao` hoặc API; root token in bằng `make bao-token` |
| Flowable REST | <http://localhost:8082/flowable-rest> | `rest-admin` / `test` |
| Trino | <https://localhost:8085> | `bms-admin`, mật khẩu in bằng `make trino-password` |
| Hộp thư thử (Mailpit) | <http://localhost:8025> | không cần |
| Grafana (nhóm `observability`) | <http://localhost:3001> | `admin` / `grafana-dev` |
| Jaeger, Prometheus | <http://localhost:16686>, <http://localhost:9090> | không cần |
| MQTT (Mosquitto) | `localhost:1883`, TLS `localhost:8883` | tài khoản thiết bị tạo ở Cổng dịch vụ API |
| PostgreSQL | `localhost:5432` | `bms` / `bms-dev` (`make psql`) |

**Kiểm thử:** `make test-db` (SQL), `make test-seed`, `make test-actions` (với Hasura, Flowable, SeaweedFS, OpenBao, Kafka, Trino
thật), `make test-auth` (đăng nhập thật mọi tài khoản demo), `make test-gateway`, `make test-all`; kiểm tra tĩnh toàn repo `make check`; giao diện `pnpm check` ở gốc repo
(Turborepo: lint, format:check, build), `pnpm --filter @bamboo/e2e test:e2e`; AI và OCR `tools/ai_smoke.sh`, `tools/ocr_smoke.sh`.

## Dịch và cài đặt từ mã nguồn

Ngoài Docker Compose, Bamboo dịch và cài vào hệ thống bằng GNU Make cùng hai công cụ nguồn mở `uv` và `pnpm`:

```bash
make help                             # mọi tùy chọn cấu hình và giá trị đang có hiệu lực
make build                            # dịch dịch vụ Python (actions, seed) và giao diện
make install PREFIX=/opt/bamboo       # cài ra ngoài thư mục mã nguồn
/opt/bamboo/bin/bamboo help           # chạy từng thành phần của bản đã cài
```

Tùy chọn (`PREFIX`, `DESTDIR`, `WITH_LAKEHOUSE`, `VITE_*`...) truyền trên dòng lệnh hoặc ghi vào `config.mk`, không sửa tệp mã.
Sau khi cài, hệ thống chạy bằng lệnh `bamboo` mà không cần thư mục mã nguồn; `make uninstall` gỡ bản cài, `make dist` đóng gói
mã nguồn thành `.tar.gz` kèm `SHA256SUMS`. Với Docker Compose, `make release-compose` sinh `compose.release.yml` chỉ tham chiếu
image vừa dịch để chạy từ thư mục bất kỳ. Hướng dẫn đầy đủ: [Dịch và cài đặt từ mã nguồn](docs/van-hanh/dich-tu-ma-nguon.md).

## Chạy native (không dùng Docker)

Mỗi thành phần chạy được trực tiếp trên máy bằng công cụ nguồn mở của hệ sinh thái tương ứng. Cách này hợp cho phát triển và
gỡ lỗi; khi chạy native, giao diện gọi thẳng Keycloak và Hasura (không qua cổng APISIX, không có WAF). Các giá trị dưới đây là
mặc định của máy dev, giống bản Docker; tên dịch vụ đổi thành `127.0.0.1`.

### 1. Cài phần mềm

| Phần mềm | Phiên bản | Ghi chú |
|---|---|---|
| PostgreSQL | 17, extension `ltree`, `btree_gist` | PostGIS 3.5 tùy chọn; `wal_level=logical` nếu chạy CDC |
| Python | 3.13 | Dịch vụ `actions`, `seed` |
| Node.js | 22 (tối thiểu 20) | Giao diện |
| pnpm | 12.16.1 (ghim ở `packageManager` trong `package.json`) | Workspace JS: `npm install -g --allow-scripts=pnpm pnpm@12.16.1` (npm mới chặn install script; thiếu cờ này lệnh `pnpm` không chạy được từ Turborepo) |
| Java | 21 | Keycloak, Flowable |
| Keycloak | 26.8 | Bản phân phối `.zip`/`.tar.gz` |
| Flowable REST | 8.0 | `flowable-rest.war` (Spring Boot) |
| Hasura GraphQL Engine | v2.51 CE | Build từ mã nguồn <https://github.com/hasura/graphql-engine> hoặc dùng binary `graphql-engine` |
| OpenBao | 2.x | Binary `bao` |
| SeaweedFS | 4.48 | Binary `weed` |
| Meilisearch | 1.x Community | Binary `meilisearch` |
| Tùy chọn | Apache Tika 4, Gotenberg 8, Kafka 4 + Debezium Server 3, Trino 483, Ollama 0.35 | Trích chữ tệp, PDF, Lakehouse, AI |

### 2. Cơ sở dữ liệu

Tạo superuser `bms` (mật khẩu `bms-dev`) và database `bms`, rồi chạy script tạo database dịch vụ, migration, tài khoản riêng cho
từng dịch vụ:

```bash
export PGHOST=localhost PGUSER=bms PGPASSWORD=bms-dev
EXTRA_DATABASES="flowable keycloak hasura_meta lakehouse" \
SERVICE_DATABASES="keycloak:bamboo_keycloak flowable:bamboo_flowable hasura_meta:bamboo_hasura lakehouse:bamboo_lakehouse" \
tools/db/up.sh
```

### 3. Môi trường Python

```bash
# Cần uv (https://docs.astral.sh/uv/); phiên bản ghim trong uv.lock ở gốc
uv sync --frozen --package bamboo-actions --package bamboo-seed && . .venv/bin/activate
```

### 4. OpenBao và SeaweedFS

```bash
mkdir -p .local/{openbao/data,run,seaweedfs,meili}
# Sinh cấu hình chạy native từ tệp mẫu của bản Docker (không sửa tay): dữ liệu vào .local/openbao/data, chỉ nghe 127.0.0.1
sed -e 's|"/openbao/file"|".local/openbao/data"|' -e 's|0\.0\.0\.0:8200|127.0.0.1:8200|' -e 's|http://openbao:|http://127.0.0.1:|' \
  infra/platform/openbao/config.hcl > .local/openbao/config.hcl
bao server -config=.local/openbao/config.hcl &

cd services/actions
BAO_ADDR=http://127.0.0.1:8200 BAO_KEYS_FILE=../../.local/openbao/init.json \
APPROLE_OUTPUTS=actions=../../.local/run/actions.json,bootstrap=../../.local/run/bootstrap.json,search=../../.local/run/search.json \
S3_CONFIG_PATH=../../.local/seaweedfs/s3.json MEILI_CONFIG_PATH=../../.local/meili/config.toml \
python -m app.openbao_init        # khởi tạo, unseal, sinh secret, khóa S3, khóa Meilisearch, AppRole
cd ../..

weed server -dir=.local/seaweedfs/data -ip=127.0.0.1 -volume.port=8087 -master.volumeSizeLimitMB=256 -filer \
  -s3 -s3.port=8333 -s3.config=.local/seaweedfs/s3.json -s3.allowedOrigins=http://localhost:5173 &
meilisearch --config-file-path .local/meili/config.toml --db-path .local/meili/data --http-addr 127.0.0.1:7700 &
```

`.local/openbao/init.json` chứa khóa unseal và root token: giữ kín. `-volume.port=8087` để SeaweedFS không chiếm cổng 8080 của
Keycloak.

### 5. Keycloak, Flowable, Hasura

```bash
# Keycloak: chép realm và theme vào bản phân phối rồi chạy
cp infra/platform/keycloak/realm/bms-realm.json <keycloak>/data/import/
cp -r infra/platform/keycloak/themes/dxos-login <keycloak>/themes/
KC_DB=postgres KC_DB_URL=jdbc:postgresql://127.0.0.1:5432/keycloak KC_DB_USERNAME=bamboo_keycloak \
KC_DB_PASSWORD=keycloak-db-dev KC_HOSTNAME=http://localhost:8080 KC_HTTP_ENABLED=true \
KC_BOOTSTRAP_ADMIN_USERNAME=kcadmin KC_BOOTSTRAP_ADMIN_PASSWORD=kcadmin-dev DEMO_PASSWORD=demo-password \
<keycloak>/bin/kc.sh start-dev --import-realm &

# Flowable REST trên cổng 8082
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/flowable SPRING_DATASOURCE_USERNAME=bamboo_flowable \
SPRING_DATASOURCE_PASSWORD=flowable-db-dev FLOWABLE_REST_APP_ADMIN_USER_ID=rest-admin FLOWABLE_REST_APP_ADMIN_PASSWORD=test \
FLOWABLE_REST_APP_CREATE_DEMO_DEFINITIONS=false java -jar flowable-rest.war --server.port=8082 &

# Hasura trên cổng 8081, xác thực bằng webhook của actions (:8090)
HASURA_GRAPHQL_METADATA_DATABASE_URL=postgres://bamboo_hasura:hasura-db-dev@127.0.0.1:5432/hasura_meta \
BMS_DATABASE_URL=postgres://bamboo_hasura:hasura-db-dev@127.0.0.1:5432/bms \
HASURA_GRAPHQL_ADMIN_SECRET=dev-admin-secret ACTIONS_SECRET=dev-actions-secret ACTIONS_URL=http://127.0.0.1:8090 \
HASURA_GRAPHQL_AUTH_HOOK=http://127.0.0.1:8090/auth/hasura HASURA_GRAPHQL_AUTH_HOOK_MODE=GET \
HASURA_GRAPHQL_CORS_DOMAIN=http://localhost:5173 HASURA_GRAPHQL_ENABLE_CONSOLE=false \
graphql-engine serve --server-port 8081 &
```

### 6. Dịch vụ Bamboo

Đặt biến môi trường chung (lưu vào một tệp rồi `source` ở mỗi cửa sổ dòng lệnh):

```bash
export DATABASE_URL=postgresql://bamboo_actions:actions-db-dev@127.0.0.1:5432/bms
export HASURA_URL=http://127.0.0.1:8081 HASURA_GRAPHQL_ADMIN_SECRET=dev-admin-secret ACTIONS_SECRET=dev-actions-secret
export FLOWABLE_URL=http://127.0.0.1:8082/flowable-rest/service FLOWABLE_USER=rest-admin FLOWABLE_PASSWORD=test
export KEYCLOAK_JWKS_URL=http://127.0.0.1:8080/realms/bms/protocol/openid-connect/certs
export KEYCLOAK_ISSUER=http://localhost:8080/realms/bms KEYCLOAK_INTERNAL_URL=http://127.0.0.1:8080
export KEYCLOAK_ADMIN=kcadmin KEYCLOAK_ADMIN_PASSWORD=kcadmin-dev KEYCLOAK_ADMIN_URL=http://localhost:8080
export S3_ENDPOINT=http://127.0.0.1:8333 S3_PUBLIC_ENDPOINT=http://127.0.0.1:8333 MEILI_URL=http://127.0.0.1:7700
export WEB_ORIGIN=http://localhost:5173 DEMO_PASSWORD=demo-password BAO_ADDR=http://127.0.0.1:8200
export TIKA_URL=http://127.0.0.1:9998 GOTENBERG_URL=http://127.0.0.1:3000 OLLAMA_URL=   # để trống OLLAMA_URL nếu không chạy AI
```

```bash
cd services/seed
DATABASE_URL=postgresql://bms:bms-dev@127.0.0.1:5432/bms python -m app.seed        # dữ liệu demo
cd ../actions
BAO_APPROLE_FILE=../../.local/run/bootstrap.json python -m app.bootstrap           # bucket, BPMN, chỉ mục, metadata Hasura, client Keycloak
BAO_APPROLE_FILE=../../.local/run/actions.json uvicorn app.main:app --port 8090 &  # Hasura Actions và webhook xác thực
BAO_APPROLE_FILE=../../.local/run/actions.json python -m app.flow_sync &           # đồng bộ Flowable, thông báo, neo, quy trình tự động
BAO_APPROLE_FILE=../../.local/run/search.json python -m app.search_sync &          # đánh chỉ mục tìm kiếm
```

Tùy chọn: `python -m app.ai_worker` (cần Ollama với `qwen3:4b`, `bge-m3`), `python -m app.lakehouse_sink` (cần Kafka, Debezium,
Trino). Biến môi trường đầy đủ: `services/actions/app/config.py`.

### 7. Giao diện

```bash
pnpm install --frozen-lockfile   # ở gốc repo (workspace pnpm: apps/web, tests/e2e); pnpm ghim ở package.json
cd apps/web
VITE_KEYCLOAK_URL=http://localhost:8080 VITE_HASURA_URL=http://localhost:8081/v1/graphql pnpm dev   # http://localhost:5173
pnpm build           # bản tĩnh trong dist/, phục vụ bằng web server bất kỳ
```

Mở <http://localhost:5173> và đăng nhập bằng tài khoản demo.

## Cơ sở dữ liệu demo

Dữ liệu demo của **Tập đoàn X** hư cấu, 100% giả lập, tự nạp lần đầu chạy (`SEED_DEMO=true`, tắt bằng `false` khi dùng cho
công ty thật: [Khởi tạo cho công ty mới](docs/van-hanh/cong-ty-moi.md)). Một database PostgreSQL `bms` (55 migration, 21 schema:
[thiết kế CSDL](docs/thiet-ke/03-thiet-ke-csdl.md)); danh sách tài khoản sinh từ `services/seed/app/demo.py`, dùng chung cho CSDL
và realm Keycloak.

- **Hai tenant:** Tập đoàn X (`TDX`: công ty mẹ, Chip X, Điện thoại X, Gia dụng X) và Bệnh viện X (`BVX`, tenant con, cách ly dữ
  liệu với tập đoàn). 46 đơn vị trong cây tổ chức, mỗi vị trí có người giữ (30 tài khoản đăng nhập được, các vị trí còn lại là
  người giả lập bằng Faker `vi_VN`), kèm kiêm nhiệm, quyền trưởng, hợp đồng, ủy quyền, ghế trống chờ tuyển.
- **Dữ liệu nghiệp vụ:** 10 đề nghị mua sắm dừng ở các bước khác nhau kèm lịch sử duyệt nhiều ngày (cho Trung tâm điều hành),
  8 nhà cung cấp (gồm nhà cung cấp nội bộ), 12 vật tư, lô sản xuất, đơn hàng nội bộ, ghế trống chờ tiếp nhận, tài liệu quy chế
  trong thư viện tri thức, 7 quy trình BPMN mẫu, tác tử AI "Trợ lý quy chế".
- **Cộng tác và dự án** (`services/seed/app/demo_hpd.py`, mốc thời gian tính quanh hôm nay):
  - **Tin nhắn:** kênh của mọi phòng ban (tự theo phân công) có trao đổi ở kênh Tập đoàn X, Phòng Mua hàng Điện thoại X,
    Phòng sạch Chip X (sự cố CR-02), Khoa Chẩn đoán hình ảnh; nhóm "Ban điều hành tập đoàn", "Điều chuyển nhân sự quý IV",
    "Mua sắm thiết bị y tế"; tin riêng chưa đọc giữa `nv.muahang.dienthoai` và `tp.muahang.dienthoai`, giữa `gd.chip` và
    `pgd.chip`; có @nhắc tên.
  - **Lịch công tác:** giao ban Ban Tổng giám đốc, Điện thoại X, Văn phòng Chuyển đổi số (hằng tuần), kiểm tra an toàn phòng
    sạch (hằng tháng), Hội đồng thiết bị y tế Bệnh viện X; chuyến công tác Singapore của `gd.chip`; họp duyệt đề nghị 650
    triệu có mời và trả lời; đào tạo Bamboo; nghỉ phép; đánh giá KPI cuối quý, hạn báo cáo thuế.
  - **Dự án:** DX-2027 (chuyển đổi số, chậm 5 ngày, 2 báo cáo), CHIP-CR02 (nâng cấp phòng sạch, 2 việc trễ, báo cáo đỏ),
    DT-SMT4 (đang lập kế hoạch), GD-BH (đã xong), BVX-EMR (Bệnh viện X, đúng tiến độ); đủ WBS, phụ thuộc, mốc, đường cơ sở.
  - **Cổng dịch vụ API:** hai khóa mẫu của Tập đoàn X (một đang dùng kèm 30 ngày lượt gọi, một đã thu hồi); chỉ lưu mã băm
    của chuỗi ngẫu nhiên nên không dùng được để gọi thật.
- **Dữ liệu số:** bản sao số phòng sạch (chuỗi đo 24 giờ, ngưỡng, sự cố), phả hệ và chất lượng dữ liệu, KPI, nạp từ
  `services/seed/data/demo`. Làm mới theo giờ hiện tại: `docker compose run --rm seed python -m app.demo_load --refresh`.
- **Hạn mức duyệt mẫu:** công ty thành viên dưới 50 triệu quản lý trực tiếp duyệt; 50–500 triệu thêm giám đốc công ty; từ 500
  triệu thêm Tổng giám đốc. Đơn vị trực thuộc tập đoàn từ 50 triệu lên thẳng Tổng giám đốc. Bệnh viện X: thiết bị y tế luôn hai
  bước.
- **Dọn dữ liệu thử:** `tools/demo_cleanup.sh` (xem trước), `tools/demo_cleanup.sh --apply` (xóa đề nghị do người dùng lập
  khi thử, cùng tài khoản, đơn vị, vị trí do kiểm thử E2E tạo: "Người Thử …", "Nhóm Thử …", tài khoản Keycloak `e2e.*`;
  vị trí, người còn được quyết định nhân sự nhắc tới thì chỉ kết thúc hiệu lực và gỡ tài khoản vì quyết định không xóa được).

### Tài khoản demo

Mật khẩu chung **`demo-password`** (biến `DEMO_PASSWORD`). Đổi người dùng bằng **Đăng xuất** ở thanh bên trái.

**Đăng ký doanh nghiệp mới** dùng được cùng lúc với dữ liệu demo: ở trang đăng nhập bấm **Tạo tài khoản →** (hoặc mở
<http://localhost:8000/khoi-tao>), khai chủ sở hữu, doanh nghiệp, quy mô, thành viên và công cụ cần bật; hệ thống tạo công ty
mới cùng tài khoản với mật khẩu tạm (đổi ở lần đăng nhập đầu, chủ sở hữu cài thêm OTP). Biến `SETUP_OPEN_SIGNUP` (bỏ trống thì
theo `SEED_DEMO`) quyết định trang này có mở khi máy đã có công ty hay không; production đặt `SEED_DEMO=false` nên trang chỉ
mở khi máy chưa có công ty (ADR #62, #68).

Đăng nhập được nhưng báo **"Tài khoản chưa thuộc tenant nào"** nghĩa là id tài khoản trong Keycloak không khớp người nào
trong CSDL. Thường do chạy image cũ (bản dựng trước, hoặc kéo từ GHCR) chưa có migration và seed mới: `docker compose up -d`
và `make up` đều dựng lại image từ mã đang có (`pull_policy: build`; đặt `BAMBOO_PULL_POLICY=missing` trong `.env` để dùng
image sẵn có). Sau `git pull`, chạy lại `docker compose up -d` (hoặc `make up`): job `bootstrap` thay tài khoản demo trùng tên đăng nhập nhưng lệch id (volume Keycloak cũ,
tài khoản tạo lại bằng tay) bằng tài khoản đúng id và chuyển liên kết; job `seed` gắn lại tài khoản demo cho người đang giữ
ghế nếu bị gỡ. Một phần dữ liệu demo lỗi không còn kéo đổ cả seed (tổ chức, người, tài khoản vẫn được nạp; `seed` thoát mã
1 và ghi phần lỗi trong `docker compose logs seed`).

Báo **"Không lấy được danh sách tenant"** kèm mã 503 (hoặc 403 ở bản cũ) nghĩa là cổng API chưa gọi được dịch vụ `actions`
(đang khởi động, hoặc đã dừng). Trang tự thử lại khoảng một phút; nếu vẫn lỗi, xem `docker compose ps actions` và
`docker compose logs --tail 80 actions`.

Báo **502 Bad Gateway** và `flow-sync`, `actions` tự khởi động lại liên tục sau khi khởi động lại máy hoặc Docker: OpenBao bị
khóa (sealed) mỗi lần container khởi động lại. Dịch vụ `openbao-unseal` tự mở khóa trong vài giây và các dịch vụ chờ OpenBao
tối đa 2 phút (`BAO_WAIT_SECONDS`) thay vì thoát; bản cũ chưa có dịch vụ này thì chạy lại `docker compose up -d`. Kiểm bằng
`docker compose logs --tail 20 openbao-unseal`.

**Tập đoàn X – công ty mẹ**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `tgd` | Nguyễn Văn Thành, Tổng giám đốc | Thấy đề nghị toàn tập đoàn; hộp việc có đề nghị 650 triệu và 300 triệu chờ duyệt; lịch họp duyệt và nhóm "Ban điều hành tập đoàn" |
| `pho.tgd` | Trần Thị Mai, Phó tổng giám đốc | Vị trí báo cáo cho Tổng giám đốc; ban hành quyết định nhân sự |
| `gd.taichinh` | Phạm Thu Hà, Giám đốc tài chính | Xem mọi đề nghị trong tenant, menu **Kiểm toán**, đối soát chuỗi hash |
| `cdo` | Lê Quang Huy, Giám đốc chuyển đổi số | Quản trị tổ chức, thiết kế quy trình; quản lý dự án DX-2027 (Gantt, báo cáo tiến độ); khóa API ở `/d/api` |
| `gd.nhansu.tapdoan` | Phạm Thị Thanh Vân, Trưởng phòng nhân sự tập đoàn | Duyệt quyết định điều chuyển liên tập đoàn |

**Công ty Chip X**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `gd.chip` | Hoàng Minh Đức, Giám đốc | Đang đi công tác (lịch cả ngày ở `/h/calendar`), đã ủy quyền cho phó giám đốc |
| `pgd.chip` | Vũ Thị Lan, Phó giám đốc | Hộp việc có đề nghị 90 triệu gắn nhãn **Duyệt thay (ủy quyền)** |
| `qd.phongsach.chip` | Đặng Văn Long, Quản đốc phòng sạch | Hộp việc có đề nghị máy đếm hạt bụi 35 triệu; bản sao số phòng sạch; dự án CHIP-CR02 đang trễ |
| `kd.chip` | Bùi Thị Ngọc, Chuyên viên kinh doanh B2B | Lập đề nghị dưới tư cách nhân viên |
| `ns.chip` | Châu Văn Phát, Chuyên viên nhân sự | Lập hồ sơ tiếp nhận cho Chip X (không lập được cho công ty khác) |

**Công ty Điện thoại X**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `nv.muahang.dienthoai` | Phan Văn Nam, Chuyên viên mua hàng | Lập đề nghị kèm dòng hàng, đính kèm báo giá, gửi duyệt; xem đề nghị bị trả về |
| `nv3.muahang.dienthoai` | Cao Thị Mỹ Linh, Chuyên viên mua hàng | Tự lập đề nghị điều chuyển sang đơn vị khác |
| `tp.muahang.dienthoai` | Đỗ Thị Hương, Trưởng phòng mua hàng | Duyệt đề nghị dưới 50 triệu của phòng; duyệt bước 1 hồ sơ tiếp nhận người vào phòng (chỉ thấy CCCD đã che); có tin nhắn riêng chưa đọc |
| `gd.dienthoai` | Ngô Thanh Sơn, Giám đốc | Đã duyệt bước 1 của đề nghị 650 triệu; duyệt bước 2 hồ sơ tiếp nhận |
| `ns.dienthoai` | Hồ Thị Thu Trang, Chuyên viên nhân sự | Lập hồ sơ tiếp nhận vào ghế trống, CCCD mã hóa, **Xem đầy đủ** ghi nhật ký |
| `tp.nhansu.dienthoai` | Nguyễn Thị Hồng Nhung, Trưởng phòng nhân sự | Bước duyệt nhân sự của điều chuyển |
| `tp.phanmem.dienthoai` | Trần Quốc Bảo, Trưởng phòng Phần mềm | Trưởng đơn vị tiếp nhận: chọn vị trí cho người điều chuyển tới |
| `nv.phanmem.dienthoai` | Lê Hoàng Anh, Kỹ sư phần mềm | Nhân viên trong kịch bản điều chuyển |

**Công ty Gia dụng X**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `gd.giadung` | Lý Thị Thảo, Giám đốc | Hộp việc có đề nghị bộ dụng cụ sửa chữa 120 triệu |
| `gd.baohanh.giadung` | Trịnh Văn Hải, Giám đốc trung tâm bảo hành | Người quản lý hợp đồng: duyệt đề nghị 15 triệu do người làm hợp đồng lập |
| `ns.giadung` | Lâm Thị Kim Ngân, Chuyên viên nhân sự | Lập hồ sơ tiếp nhận cho Gia dụng X |

**Bệnh viện X** (tenant riêng)

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `gd.benhvien` | Võ Thị Bích, Giám đốc bệnh viện | Bước 2 của đề nghị máy siêu âm 4D (thiết bị y tế luôn duyệt 2 cấp); dự án BVX-EMR |
| `bs.cdha.benhvien` | Lưu Thị Yến, Bác sĩ chẩn đoán hình ảnh | Người lập đề nghị máy siêu âm 4D |
| `tk.duoc.benhvien` | Dương Văn Khoa, Trưởng khoa Dược | Không thấy dữ liệu tập đoàn |
| `ns.benhvien` | Quách Văn Toàn, Chuyên viên phòng Tổ chức cán bộ | Lập hồ sơ tiếp nhận cho bệnh viện |
| `tp.tccb.benhvien` | Đoàn Minh Châu, Trưởng phòng Tổ chức cán bộ | Duyệt nhân sự phía bệnh viện trong điều chuyển liên tập đoàn |
| `tp.khth.benhvien` | Vương Hữu Phước, Trưởng phòng Kế hoạch tổng hợp | Trưởng đơn vị tiếp nhận ở bệnh viện |

**Tài khoản đặc biệt**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `kiemnhiem` | Mai Xuân Phúc, pháp chế Tập đoàn X, kiêm nhiệm ở Bệnh viện X | Một tài khoản, hai tenant: màn hình **Chọn đơn vị làm việc**, đổi tenant ở menu người dùng |
| `hopdong` | Tạ Minh Tuấn, kỹ sư Chip X, làm hợp đồng cho Gia dụng X | Lập được đề nghị ở Gia dụng X nhưng không bao giờ là người duyệt |
| `admin` | Kiều Anh Quân, đội nền tảng | Quản trị nền tảng; **bắt buộc cài OTP** ở lần đăng nhập đầu |
