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

# Thiết kế chi tiết 3 tầng

Tài liệu này mô tả chi tiết từng tầng của khung DX-OS trong Bamboo: thành phần, ranh giới, giao tiếp giữa các tầng, luồng
dữ liệu chính, bảo mật và triển khai. Yêu cầu của đề và bảng đối chiếu ở
[Yêu cầu và kiến trúc](../tong-quan/01-yeu-cau-va-kien-truc.md); chi tiết từng phần nằm ở các tài liệu chuyên đề:

| Chủ đề | Tài liệu |
|---|---|
| Lược đồ CSDL, migration, cơ chế nghiệp vụ trong CSDL | [Thiết kế CSDL](03-thiet-ke-csdl.md) |
| Cấu hình, lệnh, biến môi trường của từng dịch vụ Tầng 1 | [Dịch vụ nền tảng](06-dich-vu-nen-tang.md) |
| GraphQL, Hasura Action, ánh xạ màn hình | [API của nền tảng](08-api-giao-dien.md) |
| Thư viện, phiên bản, giấy phép | [Thư viện và giấy phép](09-thu-vien-va-giay-phep.md) |
| Lý do của từng lựa chọn | [Nhật ký quyết định kiến trúc](../quan-ly-du-an/05-quyet-dinh-kien-truc.md) |

## 1. Tổng quan

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Tầng 3 – Nền tảng Kinh doanh số: ứng dụng ngành cắm–rút                                               │
│   mô-đun ngoài (/x/<mã>, /ext, /ext-api) · ứng dụng độc lập (OIDC + /graphql, /api/v1, /ingest, /hooks) │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tầng 2 – Không gian Năng lực số: ứng dụng web apps/web (Refine, React, Ant Design)                     │
│   [H] Con người số · [P] Quy trình số · [D] Dữ liệu số · [I] Trí tuệ số                                │
├──────────────────────────────── cổng API APISIX :8000 (điểm vào duy nhất) ─────────────────────────────┤
│ Tầng 1 – Nền tảng Dịch vụ Lõi số (headless)                                                           │
│   định danh · két sắt · dữ liệu có cấu trúc · dữ liệu phi cấu trúc · quy trình · sự kiện, Lakehouse ·  │
│   AI cục bộ · IoT · truyền thông · vận hành, giám sát                                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Quy tắc giữa các tầng**

1. Tầng trên chỉ gọi tầng dưới qua cổng API (`/realms`, `/graphql`, `/bms-*`, `/api/v1`, `/ext-api`, `/ingest`, `/hooks`);
   không tầng nào đọc thẳng CSDL, S3 hay Flowable của Tầng 1.
2. Tầng 1 trung lập ngành: cơ cấu tổ chức, quyền, hạn mức duyệt, danh mục, quy trình là dữ liệu doanh nghiệp khai báo,
   không viết cứng trong mã. Đặc thù ngành chỉ nằm ở Tầng 3.
3. Mọi yêu cầu mang danh tính (token Keycloak, khóa API `bak_…`, khóa mô-đun `bmk_…`) và công ty (`x-bamboo-tenant`);
   quyền kiểm ở cổng API, ở Hasura (phân quyền theo dòng) và ở Action, không dựa vào giao diện.
4. Thay đổi ở tầng trên không đòi sửa tầng dưới; tầng dưới nâng cấp giữ hợp đồng API (GraphQL, `/api/v1`, `/ext-api/v1`).

## 2. Tầng 1 – Nền tảng Dịch vụ Lõi số

### 2.1. Nguyên tắc

- **Headless:** không dịch vụ nào có giao diện người dùng mở ra ngoài. Giao diện của OpenBao và Hasura Console tắt mặc
  định ([ADR #82](#adr-82)); công cụ quản trị upstream còn lại (Keycloak Admin, Trino, Mailpit) chỉ nghe `127.0.0.1`.
- **Mỗi dịch vụ một danh tính:** tài khoản CSDL riêng không phải superuser, AppRole OpenBao riêng, khóa S3 riêng, tài khoản
  Kafka riêng ([ADR #35](#adr-35)); chứng chỉ dịch vụ riêng khi bật mTLS ([ADR #76](#adr-76)).
- **Bí mật chỉ ở OpenBao:** dịch vụ đăng nhập AppRole lúc khởi động và đọc bí mật theo chính sách đặc quyền tối thiểu.
- **Cô lập công ty:** mọi bảng nghiệp vụ có `tenant_id`, khóa kép và phân quyền theo dòng ([ADR #14](#adr-14)).
- **Tự phục hồi:** healthcheck, tự khởi động lại, dịch vụ dùng thưa tự ngủ và được đánh thức khi có yêu cầu ([ADR #53](#adr-53)).

### 2.2. Thành phần theo cụm

Tên dịch vụ là tên trong `compose.yaml` (gộp `infra/compose/*.yml`); nhóm tùy chọn ghi trong ngoặc.

| Cụm | Dịch vụ | Sản phẩm | Vai trò |
|---|---|---|---|
| Biên | `gateway` | Apache APISIX 3.19 + Coraza WAF (OWASP CRS) | Điểm vào duy nhất `:8000`: định tuyến, kiểm token tại biên (forward-auth), WAF, giới hạn tần suất, `X-Request-Id`, span OpenTelemetry |
| Định danh | `keycloak` | Keycloak 26.8 | OIDC + PKCE, MFA (OTP bắt buộc cho quản trị), một tài khoản nhiều công ty ([ADR #30](#adr-30)) |
| Két sắt | `openbao`, `openbao-init`, `openbao-unseal` | OpenBao 2.7 | Bí mật KV, AppRole, transit mã hóa dữ liệu nhạy cảm và ký Ed25519, PKI nội bộ cấp chứng chỉ dịch vụ; tự mở khóa khi khởi động lại |
| Dữ liệu có cấu trúc | `db`, `migrate` | PostgreSQL 17 + PostGIS | Nguồn sự thật; ràng buộc nghiệp vụ, chuỗi duyệt, kiểm toán chuỗi hash nằm trong CSDL ([Thiết kế CSDL](03-thiet-ke-csdl.md)) |
| | `hasura` | Hasura GraphQL Engine v2 CE | API GraphQL tự sinh, phân quyền theo dòng, subscription thời gian thực, Action gọi sang `actions` |
| Nghiệp vụ dùng chung | `actions` | FastAPI (Python 3.13) | Hasura Action, webhook xác thực, `/setup`, `/ingest`, `/hooks`, `/api/v1`, `/ext`, `/ext-api`, `/metrics` |
| Quy trình | `flowable`, `flow-sync` | Flowable REST 8 | BPMN, chạy quy trình duyệt và quy trình tự động; `flow-sync` đồng bộ CSDL ↔ Flowable, xử lý external task, hẹn giờ |
| Dữ liệu phi cấu trúc | `seaweedfs` | SeaweedFS 4.48 (S3) | Bucket `bms-quarantine` (chờ quét), `bms-documents` (đã nhận), `bms-lakehouse` |
| | `tika-core`, `gotenberg-core` | Apache Tika 4, Gotenberg 8 | Trích văn bản từ tệp; dựng PDF từ mẫu HTML (phiếu, quyết định, báo cáo) |
| | `meilisearch`, `search-sync` | Meilisearch 1.54 | Chỉ mục toàn văn và vector (tìm theo ý nghĩa), đồng bộ từ hàng đợi `search.*` |
| | `clamav` (scan) | ClamAV 1.4 | Quét virus thêm cho bộ quét nội bộ và CDR |
| Sự kiện, Lakehouse | `kafka`, `debezium` | Kafka 4.3 (KRaft), Debezium Server 3.7 | CDC từ PostgreSQL ra Kafka, SASL/ACL theo dịch vụ |
| | `lakehouse-sink`, `trino-core`, `trino-init` | Apache Iceberg, Trino 483 | Bronze (Iceberg) → silver (view Trino) → lớp ngữ nghĩa báo cáo |
| AI cục bộ | `ollama-core`, `ollama-init`, `ai-worker` | Ollama 0.35 (Qwen3 4B Instruct, bge-m3) | Trợ lý RAG, tìm theo ý nghĩa, tác tử AI, bước AI trong quy trình; dữ liệu không rời hệ thống |
| | `ocr-core`, `ocr-init` | PaddleOCR + VietOCR | OCR tiếng Việt cho bản quét, ảnh chứng từ |
| IoT | `mosquitto`, `iot-bridge` | Eclipse Mosquitto 2 | MQTT (TLS/mTLS), số đo thiết bị vào bản sao số; REST NGSI-LD qua `actions` |
| Truyền thông | `mailpit` (dev) | Mailpit | Hộp thư thử; production dùng máy chủ SMTP thật. Hàng đợi `msg.queue` và định tuyến kênh nằm trong `actions` |
| Vận hành | `sleeper` | tự viết | Đánh thức/cho ngủ Trino, Tika, Gotenberg, Ollama, OCR; bật/tắt container theo mô-đun đã cài |
| | `backup`, `bootstrap`, `seed` | tự viết | Sao lưu theo lịch; nạp metadata Hasura, quy trình, realm Keycloak; dữ liệu demo |
| | `vector` (logs) | Vector 0.46 | Gom nhật ký container vào `obs.log_event` |
| | `otel-collector`, `jaeger`, `prometheus`, `grafana` (observability) | OpenTelemetry, Jaeger 2, Prometheus 3, Grafana 13 | Truy vết, số liệu, bảng điều khiển, cảnh báo ([ADR #75](#adr-75)) |

### 2.3. Đường đi của một yêu cầu

```text
Trình duyệt ── HTTPS ──► gateway (APISIX)
   1. request-id: gắn X-Request-Id; opentelemetry: mở span, gắn traceparent
   2. WAF Coraza (OWASP CRS) chặn tấn công phổ biến → 403
   3. /graphql: forward-auth → actions GET /auth/gateway kiểm token Keycloak → 401 nếu sai/hết hạn
   4. limit-count theo IP hoặc theo khóa API → 429
   └─► hasura (/v1/graphql)
         5. webhook xác thực GET actions /auth/hasura: token + x-bamboo-tenant → biến phiên
            (x-hasura-role, x-hasura-tenant-id, x-hasura-person-id)
         6a. query/mutation/subscription bảng → PostgreSQL với luật phân quyền theo dòng
         6b. Action → actions POST /actions/<tên> (khóa x-actions-secret, chuyển tiếp traceparent)
               └─► Flowable · OpenBao (transit) · SeaweedFS · Meilisearch · Gotenberg · Ollama · Trino
         7. trigger trong CSDL: ràng buộc nghiệp vụ, chuỗi duyệt, nhật ký kiểm toán chuỗi hash, live.event
```

Một trace OpenTelemetry đi liền từ cổng API qua Hasura tới `actions` và câu lệnh SQL; `X-Request-Id` nối trace với nhật ký
tập trung.

### 2.4. Luồng dữ liệu chính

| Luồng | Các bước |
|---|---|
| Tải tệp | `get_upload_url` → trình duyệt PUT thẳng vào `bms-quarantine` bằng link có chữ ký (qua cổng API) → `confirm_upload` → bộ quét nội bộ (+ ClamAV) → CDR dựng lại ảnh, Office, PDF ([ADR #70](#adr-70)) → `bms-documents` → hàng đợi chỉ mục → Tika → Meilisearch (văn bản và đoạn cho RAG) |
| Phê duyệt | Lưu chứng từ → CSDL tính chuỗi duyệt từ cây tổ chức, bổ nhiệm, ủy quyền, hạn mức → `flow-sync` khởi chạy quy trình Flowable → việc duyệt vào Hộp việc → quyết định ghi lịch sử và kiểm toán → bước kế hoặc hoàn tất |
| Thay đổi dữ liệu | PostgreSQL (logical replication) → Debezium → Kafka (topic theo bảng) → `lakehouse-sink` → Iceberg bronze trên S3 → view silver trên Trino (lọc theo công ty) → lớp ngữ nghĩa, Phân tích BI, `/api/v1/metrics` |
| Thời gian thực | Trigger ghi `live.event` → subscription GraphQL → trang tải lại phần dữ liệu đổi (gộp 1,5 giây) |
| Thông báo | Sự kiện nghiệp vụ → `collab.notification` → `msg.queue` (thử lại, hàng chết) → email, SMS, webhook theo kênh từng người → biên nhận Ed25519 gắn mã băm nội dung |
| AI | Câu hỏi → `ai-worker` tìm đoạn liên quan (Meilisearch, bge-m3) trong phạm vi quyền của người hỏi → Qwen3 trả lời kèm nguồn; tác tử AI nhận sự kiện nghiệp vụ, lập kế hoạch, hệ thống kiểm từng hành động trước khi làm |
| IoT | Thiết bị → MQTT (tài khoản theo công ty) → `iot-bridge` → chuỗi đo, ngưỡng, sự cố trong `iot.*` → Bản sao số, Trung tâm điều hành |

### 2.5. Bảo mật

| Lớp | Biện pháp |
|---|---|
| Biên | Một điểm vào, WAF, kiểm token trước khi tới Hasura, giới hạn tần suất, chặn realm `master` và API quản trị của Hasura, Keycloak |
| Định danh | OIDC + PKCE, MFA; token không mang claim Hasura, quyền đọc từ CSDL ([ADR #32](#adr-32)); cảnh báo đăng nhập thiết bị mới cho chủ sở hữu và quản trị viên |
| Nội bộ | Mạng Docker riêng; mỗi dịch vụ một tài khoản và AppRole; mTLS cho MQTT và các chặng HTTP giữa cổng API, Hasura, `actions`, Keycloak, Flowable khi chạy production (`infra/compose/mtls.yml`, [ADR #76](#adr-76)) |
| Dữ liệu | Phân quyền theo dòng; mã hóa trường nhạy cảm bằng OpenBao transit; che PII bằng Presidio ([ADR #43](#adr-43)); nhật ký xem dữ liệu nhạy cảm |
| Tệp | Bucket kiểm dịch, quét, CDR; link tải có chữ ký, hết hạn |
| Toàn vẹn | Nhật ký kiểm toán chuỗi hash theo công ty, neo có chữ ký công bố ra ngoài CSDL ([ADR #33](#adr-33), [ADR #46](#adr-46)); văn bản phát hành ký PAdES bằng chứng thư tổ chức qua HSM hoặc dịch vụ ký số từ xa ([ADR #94](#adr-94)) |

### 2.6. Vận hành và triển khai

- **Một lệnh:** `make up` (hoặc `docker compose up -d`); `tools/ram_profile.sh` chọn nhóm dịch vụ theo RAM; nhóm tùy chọn
  `observability`, `logs`, `scan`.
- **Production:** `BAMBOO_ENV=production` từ chối mật khẩu mặc định, tự thêm `infra/compose/mtls.yml`, bật GitOps
  (`tools/gitops/reconcile.sh`, [ADR #83](#adr-83)); danh sách kiểm tra ở [Triển khai](../van-hanh/trien-khai.md).
- **Image dựng sẵn:** `ghcr.io/thanhnlt/bamboo-*` và tệp compose phát hành dạng OCI artifact; chạy không cần mã nguồn.
- **Kubernetes:** manifest Kustomize sinh từ compose (`infra/k8s`), Argo CD tự đồng bộ ([ADR #95](#adr-95)).
- **Sao lưu:** `backup` theo lịch, diễn tập khôi phục có kiểm chuỗi hash.

## 3. Tầng 2 – Không gian Năng lực số

### 3.1. Kiến trúc ứng dụng web

| Thành phần | Thiết kế |
|---|---|
| Khung | Refine 5 + React 19 + Ant Design 5, dựng bằng Vite; image `web` (nginx, cổng 8080) phục vụ tệp tĩnh sau cổng API |
| Cấu hình | `config.js` sinh lúc chạy container (địa chỉ Keycloak, `/graphql`, `/setup`, `/ext`) nên một image dùng cho mọi môi trường |
| Đăng nhập | Keycloak OIDC + PKCE (client `bms-web`); chọn công ty sau đăng nhập, gửi `x-bamboo-tenant` mọi yêu cầu |
| Dữ liệu | GraphQL qua `/graphql` (query, mutation, Action); subscription qua websocket cùng địa chỉ cho dữ liệu thời gian thực và hiện diện |
| Phân quyền | Luật CASL dựng từ quyền của người dùng trong CSDL; menu và nút ẩn theo quyền, máy chủ vẫn kiểm lại |
| Mô-đun | Mục menu gắn `module` (`nav.ts`), route bọc `RequireModule`; mô-đun chưa bật thì ẩn menu và trang báo "chưa bật" ([ADR #56](#adr-56)) |
| Ngôn ngữ | Tiếng Việt và tiếng Anh; danh mục chuỗi kiểm bằng lint, không để câu chưa dịch |
| Thiết bị | Bố cục co giãn, thanh điều hướng nhanh trên điện thoại, cài như ứng dụng (PWA) ([ADR #65](#adr-65)) |

Mã nguồn: `apps/web/src/pages/<trang>` (mỗi trang một thư mục: `api.ts` gọi GraphQL, `components/`, trang chính), route
khai trong `App.tsx`, menu trong `nav.ts`, chuỗi giao diện trong `src/i18n/`.

### 3.2. Bản đồ màn hình theo không gian H-P-D-I

| Không gian | Route | Thư mục `pages/` | Mô-đun |
|---|---|---|---|
| [H] Con người số | `/p/tasks`, `/p/inbox` Hộp việc | `inbox` | lõi |
| | `/h/chat` Tin nhắn | `chat`, `messaging` | lõi |
| | `/h/calendar` Lịch công tác | `work-calendar` | lõi |
| | `/h/drive` Ổ đĩa tài liệu (P.A.R.A) | `document-drive` | `files` |
| | `/h/library` Thư viện tri thức | `knowledge-library` | `knowledge` |
| | `/h/onboarding`, `/h/transfer`, `/h/decisions` Nhân sự | `onboarding`, `transfer`, `personnel-decision` | `hr` |
| | `/settings/notifications` Kênh nhận thông báo | `messaging` | lõi |
| [P] Quy trình số | `/p/documents` **Đề nghị mua sắm** (ứng dụng chính) | `purchase-requests` | `procurement` |
| | `/p/ic-orders` Đơn hàng nội bộ | `ic-orders` | `ic` |
| | `/p/payables` Nhận hàng & công nợ: phiếu nhận hàng, hóa đơn, thanh toán, đối trừ nội bộ | `payables` | `procurement` |
| | `/p/records` Hồ sơ | `records` | `approval` |
| | `/p/process` Thiết kế quy trình, quy trình tự động | `process-design`, `process` | `process` |
| | `/p/projects` Dự án và kế hoạch | `projects` | `project` |
| | `/admin/*` Tổ chức, người dùng, vai trò, danh mục, mô-đun, công ty | `admin` | lõi |
| | `/admin/approval-rules` Hạn mức duyệt | `approval-rules` | lõi |
| [D] Dữ liệu số | `/d/ops`, `/d/map` Trung tâm điều hành | `operations-center` | lõi |
| | `/d/services` Dịch vụ dữ liệu | `data-services` | `data` |
| | `/d/twin` Bản sao số | `digital-twin` | lõi |
| | `/d/lineage` Phả hệ và chất lượng dữ liệu | `data-lineage` | `data` |
| | `/d/api` Cổng dịch vụ API | `api-portal` | lõi |
| | `/d/ledger` Sổ cái | `ledger` | `ledger` |
| | `/admin/audit-logs` Kiểm toán | `audit` | lõi |
| [I] Trí tuệ số | `/i/search` Tìm kiếm toàn văn và ngữ nghĩa | `search` | `search` |
| | `/i/assistant` Trợ lý RAG | `ai-assistant` | `ai` |
| | `/i/bi` Phân tích BI | `bi-analytics` | `data` |
| | `/i/ocr` Nhập liệu OCR | `ocr-input` | `ai` |
| | `/i/agents` Tác tử AI | `ai-agents` | `ai` |
| Tầng 3 | `/x/<mã>/*` Trang của mô-đun ngoài | `external` | mô-đun ngoài |

Ánh xạ từng màn hình sang bảng và Action: [API của nền tảng](08-api-giao-dien.md).

### 3.3. Ứng dụng chính: Đề nghị mua sắm – thanh toán

| Bước | Tầng 2 | Tầng 1 |
|---|---|---|
| Lập đề nghị | Form chọn vị trí đứng tên, nhà cung cấp, dòng hàng; nhập từ OCR | `proc.purchase_request`, kiểm ràng buộc trong CSDL |
| Đính kèm | Tải báo giá, xem trạng thái quét | Luồng tải tệp (mục 2.4) |
| Gửi duyệt | Nút "Lưu và gửi duyệt" | Chuỗi duyệt tính theo hạn mức và cây tổ chức; Flowable khởi chạy quy trình |
| Duyệt | Hộp việc: duyệt, trả lại có ý kiến, từ chối | Việc duyệt, lịch sử, nhật ký kiểm toán, thông báo |
| Phát hành | In phiếu PDF có mã kiểm tra, ký số tổ chức nếu có | Gotenberg, ký PAdES |
| Nhận hàng, hóa đơn | Nhận hàng & công nợ: phiếu nhận theo dòng, hóa đơn đối chiếu ba bên, thanh toán, đối trừ nội bộ | `proc.goods_receipt`, `fin.invoice`, `fin.payment`, `fin.netting` |
| Theo dõi | Hồ sơ, Trung tâm điều hành, Phân tích BI | CDC → Lakehouse → lớp ngữ nghĩa |

### 3.4. Mở rộng Tầng 2

Thêm trang mới: thư mục trong `pages/`, route trong `App.tsx` (bọc `RequireModule` nếu thuộc mô-đun), mục menu trong `nav.ts`,
chuỗi giao diện vào danh mục i18n; dữ liệu mới thêm bằng migration và metadata Hasura (`services/actions/app/hasura_metadata.py`),
nghiệp vụ phức tạp viết thành Hasura Action trong `actions`.

## 4. Tầng 3 – Nền tảng Kinh doanh số

### 4.1. Ba cách cắm ứng dụng ngành

| Cách | Khi dùng | Giao tiếp với Tầng 1 |
|---|---|---|
| **Mô-đun ngoài** ([ADR #58](#adr-58)) | Ứng dụng ngành hiện ngay trong giao diện Bamboo, dùng chung đăng nhập, công ty, menu | Trang nhúng `/x/<mã>` → `/ext/<mã>/s/<phiên>/…` (yêu cầu đã ký HMAC); gọi lại `/ext-api/v1` bằng khóa mô-đun `bmk_…` |
| **Ứng dụng độc lập** | Hệ thống ngành có giao diện riêng (OMS, WMS, EMR...) | Đăng nhập Keycloak (OIDC), gọi `/graphql` với quyền của người dùng; lấy số liệu qua `/api/v1` bằng khóa API `bak_…`; nhận sự kiện từ Kafka (CDC) |
| **Tích hợp máy với máy** | Đẩy dữ liệu, khởi chạy quy trình | `/ingest/*` (NDJSON, CSV, chạy thử, nguyên tử), `/hooks/*` (webhook khởi chạy quy trình tự động), MQTT, REST NGSI-LD cho thiết bị |

### 4.2. Mô-đun ngoài

**Vòng đời**

1. Bên thứ ba viết dịch vụ HTTP (ví dụ đầy đủ: `examples/mo-dun-mau`, mô-đun "Nhắc việc" chỉ dùng thư viện chuẩn Python),
   chạy trong mạng mà `actions` gọi được.
2. Quản trị nền tảng đăng ký manifest (`code` dạng `x_…`, `base_url`, `entry_path`, `health_path`, `depends`, `scopes`,
   `menu`) ở **Quản trị → Quản lý chức năng** hoặc Action `ext_register`; nhận khóa mô-đun một lần.
3. Từng công ty bật/tắt như mô-đun dựng sẵn; mô-đun dựng sẵn trong `depends` được bật kèm.
4. Người dùng mở menu → `ext_launch` cấp phiên 8 giờ → trang nhúng `<iframe sandbox>`.
5. Đổi khóa (`ext_rotate_key`), cập nhật phiên bản (đăng ký lại cùng `code`), gỡ khỏi máy khi không còn công ty bật.

**Hợp đồng**

| Hướng | Nội dung |
|---|---|
| Bamboo → mô-đun | `X-Bamboo-Tenant`, `X-Bamboo-Person`, `X-Bamboo-Person-Name`, `X-Bamboo-Timestamp`, `X-Bamboo-Base`, `X-Bamboo-Signature` = HMAC-SHA256(khóa mô-đun, `timestamp\nMETHOD\npath?query\ntenant\nperson`); cookie và `Authorization` của trình duyệt không đi qua |
| Mô-đun → Bamboo | `GET /ext-api/v1/org-units` (`org.read`), `GET /ext-api/v1/people` (`people.read`), `POST /ext-api/v1/notifications` (`notify.send`); `Authorization: Bearer bmk_…`, `X-Bamboo-Tenant`; 300 yêu cầu/phút |
| Lỗi | `{message, code}`: `unauthorized` 401, `module-disabled` 403, `forbidden` 403, `not-found` 404 |

**Cô lập:** mô-đun không có tài khoản CSDL, S3 hay Flowable; chỉ thấy dữ liệu qua phạm vi đã khai; trang chạy trong iframe
sandbox với Content-Security-Policy; xin thêm phạm vi khi cập nhật thì mô-đun bị tắt ở mọi công ty cho tới khi bật lại.

### 4.3. Ánh xạ ứng dụng ngành vào dịch vụ Tầng 1

| Ứng dụng ngành | Dùng lại từ Tầng 1 | Phần riêng của ứng dụng |
|---|---|---|
| OMS, WMS (Chip X, Điện thoại X, Gia dụng X) | Tổ chức, danh mục vật tư và nhà cung cấp, đơn hàng nội bộ, chuỗi duyệt, tệp chứng từ, CDC | Tồn kho theo vị trí, lệnh xuất nhập, vận chuyển |
| MES/SCADA | Bản sao số, MQTT, NGSI-LD, sự cố theo ngưỡng, lô sản xuất (`mfg`) | Lệnh sản xuất, OEE, điều khiển thiết bị |
| EMR (Bệnh viện X, tenant riêng) | Định danh, phân quyền theo dòng, mã hóa trường nhạy cảm, che PII, kiểm toán | Hồ sơ bệnh án, chuẩn FHIR |
| CRM | Danh mục đối tác, thông báo đa kênh, Trợ lý AI, tìm kiếm | Cơ hội bán hàng, chăm sóc khách hàng |

Hệ thống nguồn mở tham khảo cho từng nhóm: [Yêu cầu và kiến trúc, mục 7](../tong-quan/01-yeu-cau-va-kien-truc.md).

## 5. Ma trận giao tiếp giữa các tầng

| Từ \ Tới | Cổng API | Keycloak | Hasura `/graphql` | `actions` (`/setup`, `/ingest`, `/hooks`, `/api/v1`, `/ext-api`) | S3 `/bms-*` | Kafka |
|---|---|---|---|---|---|---|
| Tầng 2 (web) | luôn | đăng nhập | toàn bộ nghiệp vụ | `/setup` (đăng ký) | tải lên/tải về có chữ ký | – |
| Tầng 3 mô-đun ngoài | luôn | dùng phiên Bamboo | – | `/ext-api/v1` | – | – |
| Tầng 3 ứng dụng độc lập | luôn | OIDC riêng | theo quyền người dùng | `/api/v1`, `/ingest`, `/hooks` | link có chữ ký | tài khoản riêng (CDC) |
| Thiết bị IoT | – | – | – | REST NGSI-LD | – | MQTT qua `mosquitto` |

Ô "–" nghĩa là không được phép; mọi ô còn lại đi qua cổng API (trừ MQTT và Kafka có tài khoản, ACL riêng).
