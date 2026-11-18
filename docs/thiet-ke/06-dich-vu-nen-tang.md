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

# Dịch vụ nền tảng Tầng 1

Cấu hình và hoạt động của các dịch vụ lõi Tầng 1 ngoài CSDL. Tầng 1 không có giao diện người dùng cuối: ứng dụng chỉ gọi
qua cổng API (mục 4). Mọi dịch vụ tự khởi tạo khi `docker compose up -d` (hoặc `make up`) bằng các job trong
`services/actions/app/` (`openbao_init.py`, `bootstrap.py`); image Python dùng chung là `infra/docker/python.Dockerfile`.
Giao diện web của OpenBao (`ui = false`) và Hasura Console (`HASURA_ENABLE_CONSOLE=false`) tắt mặc định
([ADR #82](#adr-82)); công cụ quản trị có sẵn trong các sản phẩm upstream còn lại (Keycloak Admin, SeaweedFS, Mailpit, Trino)
chỉ nghe `127.0.0.1` trên máy chủ, không đi qua cổng API và dành cho người vận hành.

| Mục | Dịch vụ | Cụm dịch vụ trong đề thi |
|---|---|---|
| 1 | OpenBao | Két sắt mật mã, ký số |
| 2, 12 | SeaweedFS, quét tệp | Lưu trữ đối tượng, kiểm dịch tệp |
| 3, 18 | Flowable, quy trình tự động | Quy trình BPMN, kịch bản ngầm |
| 4 | APISIX | Cửa ngõ API, WAF |
| 5, 6, 20 | Meilisearch + Tika, Gotenberg, văn bản mẫu | Chỉ mục toàn văn, trộn mẫu |
| 7, 8, 9, 21 | Debezium + Kafka, Iceberg, Trino, lớp ngữ nghĩa | Streaming, lịch sử dữ liệu, lớp ngữ nghĩa |
| 10 | Presidio | Rà soát và che PII |
| 11, 13 | Ollama, OCR | Trí tuệ số |
| 14 | `sleeper` | Tiết kiệm tài nguyên |
| 15 | Hàng đợi tin nhắn, thông báo đa kênh | Truyền thông, chống chối bỏ |
| 16, 17 | Neo kiểm toán, nhật ký tập trung, sao lưu, GitOps | Vận hành, giám sát, kiểm toán |
| 19 | API nạp lô | Thu nhận dữ liệu theo lô |

## 1. OpenBao – két sắt secret (ADR #25)

### Chế độ chạy

- **Lưu bền**: integrated storage (raft) một node ở `/openbao/file` trên volume `openbao-data` (`infra/platform/openbao/config.hcl`). Entrypoint của image tự thêm `-config=/openbao/config` và chown `/openbao/file`.
- **Job `openbao-init`** (`python -m app.openbao_init`) chạy mỗi lần `docker compose up`, chạy lại không tạo trùng:
  1. Lần đầu: khởi tạo với 1 khóa unseal (chỉ cho dev), lưu khóa và root token vào volume `openbao-keys` (`init.json`, quyền 0600), không in ra log. Lệnh khởi tạo raft có thể mất hơn 10 giây nên chờ tới 5 phút: hết giờ chờ giữa chừng là mất khóa.
  2. Mỗi lần: unseal nếu đang sealed, đợi raft có leader, rồi cấu hình lại mount, khóa transit, policy, AppRole.
  3. OpenBao đã khởi tạo mà không có `init.json` thì dừng với thông báo rõ (khôi phục file khóa hoặc xóa volume `openbao-data`).
- Khởi động lại container `openbao` thì nó sealed tới khi `openbao-init` chạy lại (`docker compose up -d`). Môi trường thật dùng auto-unseal (KMS/HSM).

### Nội dung

| Thành phần | Đường dẫn | Ghi chú |
|---|---|---|
| KV v2 | `secret/bms/postgres`, `bms/hasura`, `bms/keycloak`, `bms/flowable`, `bms/actions` | Chép từ `.env` mỗi lần chạy, chỉ ghi khi khác bản đang có |
| KV v2 | `secret/bms/seaweedfs` (`bms-app`), `secret/bms/seaweedfs-admin` (`bms-admin`), `secret/bms/seaweedfs-search` (`bms-search`) | Khóa S3 do OpenBao **sinh một lần**, là nguồn duy nhất; `openbao-init` ghi `s3.json` cho SeaweedFS từ đây |
| KV v2 | `secret/bms/meilisearch-admin` (khóa chủ), `bms/meilisearch-search`, `bms/meilisearch-indexer` | Khóa chủ Meilisearch **sinh một lần**; hai khóa API suy ra từ khóa chủ (mục 5); `openbao-init` ghi tệp cấu hình Meilisearch |
| KV v2 | `secret/bms/keycloak-provisioner` | Secret của client Keycloak `bms-provisioner` (tạo tài khoản nhân viên mới, ADR #41), **sinh một lần**; `bootstrap` đặt cho client |
| Transit | `transit/keys/pii` (AES-256-GCM) | Mã hóa dữ liệu nhạy cảm: CCCD, số tài khoản, địa chỉ của hồ sơ tiếp nhận nhân sự, mật khẩu tạm (ADR #41); CSDL chỉ giữ bản mã `vault:v1:...` và bản che |
| AppRole | `auth/approle/role/actions`, `auth/approle/role/bootstrap`, `auth/approle/role/search` | Token 1 giờ, secret-id không hết hạn (dev) |

### Đặc quyền tối thiểu

| AppRole | Dùng bởi | Được đọc | Bị chặn (có kiểm thử) |
|---|---|---|---|
| `actions` | `actions`, `flow-sync` | `bms/postgres`, `bms/flowable`, `bms/seaweedfs`, `bms/actions`, `bms/meilisearch-search`, `bms/keycloak-provisioner`; mã hóa/giải mã bằng khóa `pii` | `bms/keycloak`, `bms/hasura`, `bms/seaweedfs-admin`, `bms/meilisearch-admin`, `bms/meilisearch-indexer`, mọi thao tác ghi |
| `bootstrap` | job `bootstrap` | `bms/seaweedfs-admin` (tạo bucket), `bms/flowable`, `bms/hasura`, `bms/meilisearch-admin` (tạo index, khóa API), `bms/keycloak`, `bms/keycloak-provisioner` (client tạo tài khoản) | `bms/postgres`, khóa `pii` |
| `search` | `search-sync` | `bms/postgres`, `bms/seaweedfs-search`, `bms/meilisearch-indexer` | `bms/seaweedfs`, `bms/meilisearch-admin`, `bms/meilisearch-search`, `bms/actions`, `bms/keycloak-provisioner`, khóa `pii` |

Mỗi dịch vụ có volume secret riêng chỉ mount vào đúng dịch vụ đó: `openbao-init` ghi file AppRole (role-id + secret-id, quyền 0400) vào `actions-secrets`, `bootstrap-secrets` và `search-secrets`, cấu hình S3 vào `seaweedfs-config`, cấu hình Meilisearch (quyền 0600) vào `meilisearch-config`. Dịch vụ nào cũng thấy `/run/bms/approle.json` của riêng mình, không thấy secret của dịch vụ kia. Mô hình giống Vault Agent / External Secrets Operator sẽ dùng trên Kubernetes.

Dịch vụ Python đọc secret lúc khởi động (`config.load()`): có `BAO_ADDR` và `BAO_APPROLE_FILE` thì đăng nhập AppRole và thay giá trị env bằng secret đọc được (`SECRET_FIELDS` trong `config.py`); đường dẫn bị policy chặn thì giữ giá trị env. OpenBao chưa sẵn sàng (đang khởi động, đang khóa chờ `openbao-unseal` mở) thì chờ tối đa `BAO_WAIT_SECONDS` (120 giây) rồi mới thoát; sai AppRole (lỗi 4xx) thì thoát ngay. Chạy ngoài compose (kiểm thử native) không đặt hai biến này thì dùng env.

Dịch vụ hạ tầng (PostgreSQL, Keycloak, Hasura, Flowable) vẫn nhận mật khẩu qua biến môi trường vì Docker Compose không có cơ chế inject secret từ OpenBao; trên k3s dùng External Secrets Operator đọc từ OpenBao.

### Lệnh

```bash
make test-actions T=tests/test_openbao.py   # khởi tạo lặp lại, đặc quyền tối thiểu, transit, cấu hình đọc từ két
make bao-token                              # in root token (dev) để vào UI http://localhost:8200
```

Dùng trong code Python (`packages/py-common/src/bamboo_common/openbao.py`, gói `bamboo-common`):

```python
from bamboo_common.openbao import Bao
bao = Bao.from_approle_file("http://openbao:8200", "/run/bms/approle.json")
bao.read("bms/flowable")        # {"username": ..., "password": ...}
bao.encrypt("079123456789")     # "vault:v1:..."
```

## 2. SeaweedFS – lưu trữ đối tượng S3 (ADR #26)

### Cấu hình

- **Không có truy cập ẩn danh.** `openbao-init` ghi `s3.json` (khóa lấy từ OpenBao) vào volume `seaweedfs-config`; SeaweedFS chạy với `-s3.config=/etc/bms/s3.json`.
- Ba định danh:
  - `admin` (`secret/bms/seaweedfs-admin`): toàn quyền, chỉ job `bootstrap` dùng để tạo bucket.
  - `bms-app` (`secret/bms/seaweedfs`): chỉ `Read/Write/List/Tagging` trên `bms-quarantine` và `bms-documents`, không tạo/xóa bucket (có kiểm thử).
  - `bms-search` (`secret/bms/seaweedfs-search`): chỉ `Read` trên `bms-documents` (dịch vụ `search-sync` đọc tệp để trích chữ).
- `openbao-init` chỉ ghi lại `s3.json` khi nội dung đổi; healthcheck của SeaweedFS thấy tệp mới hơn lần nạp trước thì gửi `SIGHUP` cho `weed` để nạp lại định danh, nên nâng cấp thêm định danh không phải khởi động lại SeaweedFS.
- **Truy cập từ trình duyệt** qua cổng API ([ADR #34](#adr-34)): route `/bms-quarantine/*` chỉ cho `PUT`, `/bms-documents/*` chỉ cho `GET`/`HEAD`; SeaweedFS không mở cổng ra ngoài. CORS (`-s3.allowedOrigins=${CORS_ORIGINS}`) chỉ cần cho `pnpm dev` ở nguồn khác.
- Volume nhỏ (`-master.volumeSizeLimitMB=256 -volume.max=64`): mỗi bucket là một collection cần volume riêng; mặc định 30 GB/volume làm máy dev hết chỗ cấp volume. Mỗi lần một collection cần chỗ, master cấp một lúc 7 volume (bản sao `000`); với các bucket tài liệu, cách ly, phiếu PDF, lakehouse và nhật ký của filer, 32 volume không đủ ("Not enough data nodes", ghi S3 lỗi `InternalError`). Volume cấp thưa nên 64 không chiếm thêm đĩa khi chưa có dữ liệu.
- Job `bootstrap` tạo bucket nếu chưa có (`storage.ensure_buckets`).

| Bucket | Dùng cho |
|---|---|
| `bms-quarantine` | Tệp vừa tải lên, chờ kiểm tra. Không bao giờ cấp link tải về từ bucket này |
| `bms-documents` | Tệp đã kiểm tra sạch |

### Luồng đính kèm (`services/actions/app/attachments.py`, `storage.py`)

```text
get_upload_url ──► core.attachment PENDING; link PUT có chữ ký vào bms-quarantine (15 phút)
      │            trình duyệt PUT tệp, header Content-Type đúng như đã khai báo
confirm_upload ──► kích thước khớp khai báo? chữ ký đầu tệp khớp loại tệp? ── không ─► REJECTED, xóa tệp
      │            sha256; bộ quét nội bộ (+ ClamAV nếu bật, mục 12) ── có vấn đề ─► INFECTED / REJECTED, xóa tệp
      │            sạch ─► chuyển sang bms-documents, CLEAN (ghi scan_engines, scan_report)
get_download_url ─► link GET có chữ ký 5 phút, tên tệp tiếng Việt (RFC 5987)
```

| Action | Kiểm tra |
|---|---|
| `get_upload_url(entity_type, entity_id, file_name, content_type, size_bytes)` | Chứng từ cùng tenant và người gọi xem được (`wf.entity_can_read`); loại tệp: PDF, PNG, JPEG, DOCX, XLSX, TXT; tối đa 25 MB; tên tệp bỏ phần đường dẫn |
| `confirm_upload(attachment_id)` | Chỉ người tải lên; chưa PUT thì báo `not-uploaded` và giữ PENDING; ClamAV đã bật mà không trả lời, hoặc `SCAN_REQUIRE_CLAMAV=true` mà chưa có ClamAV, thì báo `scanner-unavailable` (503), tệp ở lại bucket cách ly để thử lại |
| `get_download_url(attachment_id)` | Cùng tenant, xem được chứng từ gốc, trạng thái `CLEAN` |
| `delete_attachment(attachment_id)` | Chỉ người tải lên; đề nghị đã có kết quả (duyệt, từ chối, hủy) thì giữ tệp làm chứng cứ (CSDL chặn) |

- Loại chứng từ đính kèm được: `proc.purchase_request`, `hr.onboarding_request`, `collab.kb_document` (`ENTITY_TYPES` trong `storage.py`); thêm loại mới thì bổ sung cả `collab.entity_tenant` và `wf.entity_can_read`.
- Giao diện xem danh sách tệp qua quan hệ `attachments` của đề nghị hoặc bảng `core_attachment` (không có cột `storage_key`; tệp đã xóa không hiện).
- **Quét tệp**: bộ quét nội bộ luôn chạy; ClamAV tùy chọn (`docker compose --profile scan up -d`, `CLAMAV_HOST=clamav`). Chi tiết ở mục 12.
- Link có chữ ký dùng `S3_PUBLIC_ENDPOINT` (mặc định `http://localhost:8000`, cổng API). Cổng giữ nguyên đường dẫn và host khi chuyển tới SeaweedFS, vì chữ ký tính trên hai giá trị này.
- Lỗi S3 trả về `storage-unavailable` (503).

### Lệnh

```bash
make test-actions T=tests/test_tep_dinh_kem.py   # tải lên, quét (clamd giả), tải về, phân quyền, chặn loại tệp, xóa, đặc quyền tối thiểu
```

## 3. Flowable – quy trình duyệt đề nghị mua sắm (ADR #27, #28, #31)

### Nguồn sự thật

CSDL quyết định toàn bộ luồng duyệt: chuỗi duyệt chốt theo vị trí, người nhận việc, đẩy lên cấp trên, gộp bước, chuyển việc, hủy ([ADR #28](#adr-28)). Flowable là **bản phản chiếu** ([ADR #31](#adr-31)): mỗi lần gửi duyệt một tiến trình, dùng để trình diễn sơ đồ, trạng thái hiện tại và lịch sử quy trình.

### Quy trình `purchaseRequestApproval`

File `infra/platform/flowable/purchase_request.bpmn20.xml` (có sơ đồ DI để giao diện vẽ):

```text
Gửi duyệt ─► [Duyệt bước i/n] ─► ◇ Quyết định?
                  ▲                ├─ APPROVE, còn bước ─┘ (stepIndex = i + 1)
                                   ├─ APPROVE, bước cuối ─► ● Đã duyệt
                                   ├─ REJECT ─────────────► ● Từ chối
                                   └─ RETURN ─────────────► ● Trả về người lập
```

Biến tiến trình: `entityType`, `entityId`, `round`, `stepCount`, `stepIndex`, `positions` (danh sách vị trí của chuỗi duyệt); khi hoàn thành task: `decision`, `actedBy`, `onBehalfOf`, `note`. Business key `<id đề nghị>:<lần gửi>`.

### Đồng bộ CSDL → Flowable (`services/actions/app/flow_sync.py`)

- Trigger trên `wf.approval_step`, `wf.task` đánh dấu `wf.flow_sync` (một dòng mỗi lần gửi duyệt) và phát `pg_notify('wf_flow_sync')`.
- Service `flow-sync` nghe kênh, đối chiếu theo trạng thái: bước hiện tại trong Flowable (`stepIndex`) so với bước đó trong CSDL – đã duyệt thì hoàn thành task, từ chối/trả về thì hoàn thành với quyết định đó, bị hủy thì xóa tiến trình, đang chờ thì đặt người nhận theo việc duyệt đang mở. Chạy lại bao nhiêu lần cũng cho cùng kết quả; lỗi ghi `last_error`, thử lại tối đa 20 lần.
- Mỗi phút chạy `wf.refresh_all()` cho bổ nhiệm hết hạn theo lịch.
- Job `bootstrap` deploy BPMN khi nội dung đổi (tên deployment kèm sha256) và nạp metadata Hasura.
- Flowable chạy với `FLOWABLE_REST_APP_CREATE_DEMO_DEFINITIONS=false` (không nạp quy trình mẫu).

### Hasura Actions (`services/actions/app/main.py`)

| Action | Làm gì |
|---|---|
| `submit_purchase_request(request_id)` | Gọi `proc.submit_purchase_request` dưới tên người gọi (`x-hasura-user-id`); chứng từ phải cùng tenant với phiên |
| `act_on_task(task_id, decision, note)` | `decision`: `APPROVE` / `REJECT` / `RETURN`; từ chối/trả về bắt buộc lý do. Gọi `wf.act` (kiểm tra người nhận việc hoặc người được ủy quyền) |
| `cancel_purchase_request(request_id, reason)` | Người lập hủy đề nghị nháp, chờ duyệt hoặc bị trả về; bắt buộc lý do. Gọi `proc.cancel_purchase_request` |
| `process_state(request_id)` (query) | Sơ đồ BPMN và các phần tử đã đi qua/đang đứng của lần gửi duyệt gần nhất, đọc từ Flowable (`source = "flowable"`); Flowable chưa đồng bộ hoặc không truy cập được thì suy ra từ trạng thái trong CSDL (`source = "database"`). Chỉ người xem được chứng từ |
| `verify_audit_chain` (query) | Đối soát chuỗi hash nhật ký kiểm toán của tenant trong phiên ([ADR #33](#adr-33)); cần quyền `audit.read` |

Kết quả `PurchaseRequestActionResult { request_id, status, purchase_request }`. Lỗi nghiệp vụ trả về `400 {message, extensions.code}`; Hasura chuyển nguyên thông báo cho giao diện. Gọi Action phải kèm header `x-actions-secret` (Hasura gửi từ biến `ACTIONS_SECRET`).

Giao diện chỉ gọi Hasura qua cổng API; Flowable REST chỉ dịch vụ `actions` gọi được.

### Lệnh

```bash
make test-actions     # pytest: Actions, quyền xem qua Hasura, đồng bộ Flowable (Hasura và Flowable thật)
make test-all         # test-db + test-actions
```

Flowable REST (dev): http://localhost:8082/flowable-rest, tài khoản `FLOWABLE_ADMIN` / `FLOWABLE_ADMIN_PASSWORD` (mặc định `rest-admin` / `test`).

## 4. Cổng API – Apache APISIX (ADR #34)

Điểm vào duy nhất từ trình duyệt (`127.0.0.1:8000`). Chế độ standalone: `infra/platform/apisix/config.yaml` (chế độ chạy, WAF) và `infra/platform/apisix/apisix.yaml` (route), đóng gói vào image `bamboo-gateway`; không có Admin API, đổi route bằng commit rồi build lại image.

| Route | Tới | Kiểm soát |
|---|---|---|
| `/graphql` (HTTP) | Hasura `/v1/graphql` | `forward-auth` → `actions` `/auth/gateway` (token Keycloak hợp lệ mới qua), 600 request/phút/IP, tối đa 1 MB, WAF (bỏ nhóm luật SQLi) |
| `/graphql` (websocket) | Hasura | 120 kết nối/phút/IP; Hasura kiểm token trong `connection_init` |
| `/realms/*`, `/resources/*` | Keycloak | WAF; `/realms/master` trả 403; đăng nhập/cấp token 60 request/phút/IP |
| `/bms-quarantine/*` | SeaweedFS | Chỉ `PUT`, tối đa 26 MB |
| `/bms-documents/*` | SeaweedFS | Chỉ `GET`, `HEAD` |
| `/` | web | Chỉ `GET`, `HEAD`; WAF |
| còn lại | | 404 |

- **WAF**: Coraza (Proxy-Wasm) với OWASP CRS nhúng sẵn, mức paranoia 1, chặn (403) khi vượt ngưỡng điểm bất thường. Không áp cho route tải tệp (nhị phân, đã kiểm tra và quét ở `confirm_upload`) và websocket.
- **Truy vết**: mọi phản hồi có `X-Request-Id`; log truy cập ra stdout của container.
- **Số liệu**: plugin `prometheus` xuất ở `gateway:9091` (chỉ mạng nội bộ).
- **Keycloak sau cổng**: `KC_HOSTNAME` là địa chỉ qua cổng (issuer của token), trang quản trị dùng `KC_HOSTNAME_ADMIN` (`127.0.0.1:8080`).

### Lệnh

```bash
make test-gateway   # 25 kiểm tra trên stack đang chạy: token tại biên, WAF, chặn dịch vụ nội bộ, giới hạn tần suất
```

## 5. Tìm kiếm toàn văn – Meilisearch + Apache Tika (ADR #36)

Tìm đề nghị mua sắm (số chứng từ, tiêu đề, mô tả, dòng hàng, nhà cung cấp, người lập, đơn vị) và **nội dung** tệp đính kèm đã kiểm tra (PDF, DOCX, XLSX, TXT; ảnh chỉ tìm theo tên tệp). Gõ không dấu vẫn tìm được (`tu dien` khớp "Tụ điện", `dong a` khớp "Đông Á"), chịu lỗi gõ (trừ số chứng từ).

```text
trigger (đề nghị, dòng hàng, tệp CLEAN/xóa, đổi tên NCC/người/đơn vị)
   └─► search.pending + pg_notify('search_sync')
          └─► search-sync: đọc trạng thái hiện tại ─► Meilisearch index `documents` (ghi / xóa)
                 tệp: S3 bms-documents (bms-search, chỉ đọc) ─► Tika /tika ─► chữ (tối đa 100.000 ký tự)

search_documents(query) ─► Meilisearch: filter tenant_id = tenant của phiên
                        ─► CSDL: wf.entity_can_read(...) từng kết quả; tệp còn và CLEAN ─► trả về
```

### Thành phần

| Dịch vụ | Image | Ghi chú |
|---|---|---|
| `meilisearch` | `getmeili/meilisearch:v1.54.3` (Community, MIT) | Chỉ mạng nội bộ. Cấu hình `/etc/meilisearch/config.toml` do `openbao-init` ghi (`env = "production"`, khóa chủ). Dữ liệu ở volume `meilisearch-data`, dựng lại được từ CSDL nên không cần sao lưu |
| `tika` | `apache/tika:4.1.0-1` | Chỉ mạng nội bộ, chỉ `search-sync` gọi. Tệp hỏng hoặc có mật khẩu (Tika trả 422) thì chỉ tìm theo tên |
| `search-sync` | image `actions` (`python -m app.search_sync`) | AppRole `search`. Chạy lại không sai: mỗi tài liệu đọc lại từ CSDL. Lỗi thì `attempts`, `last_error`, thử lại sau 1, 2, 4… tối đa 300 giây. Index trống lúc khởi động (volume mới) thì `search.mark_all()` |

### Khóa Meilisearch

| Khóa | uid | Quyền | Ai dùng |
|---|---|---|---|
| Khóa chủ | | toàn quyền | job `bootstrap`: tạo index `documents`, đặt cấu hình, tạo hai khóa dưới |
| `bamboo-search` | `8f1d6a52-…2c01` | `search` trên `documents*` | `actions` (Action `search_documents`) |
| `bamboo-indexer` | `2b7e4c90-…7b12` | `documents.add/get/delete`, `indexes.get`, `tasks.get`, `stats.get` trên `documents*` | `search-sync` |

Giá trị khóa API = HMAC-SHA256(khóa chủ, uid) dạng hex, đúng cách Meilisearch tự tính; `openbao-init` ghi sẵn vào `bms/meilisearch-search` và `bms/meilisearch-indexer`. Kiểm thử dùng index `documents_test` (cùng khóa).

### Tài liệu trong index `documents`

| Trường | Đề nghị (`kind = purchase_request`) | Tệp (`kind = attachment`) |
|---|---|---|
| `id` | `proc_purchase_request-<id>` | `core_attachment-<id>` |
| `tenant_id`, `entity_type`, `entity_id` | chính đề nghị | chứng từ chứa tệp |
| Nội dung tìm | `doc_no`, `title`, `items`, `partner`, `requester`, `org_unit`, `description` | `file_name`, `content` |
| Lọc / sắp xếp | `tenant_id`, `kind`, `entity_type`, `status`; `created_at` | |

Nội dung đề nghị lấy từ hàm `search.purchase_request_doc(id)`. Thêm loại chứng từ mới: mở rộng `search.pending.entity_type`, thêm trigger và hàm tạo tài liệu, `wf.entity_can_read` đã xử lý quyền.

### Action `search_documents`

`search_documents(query: String!, kind: SearchKind, limit: Int = 20 (≤ 50), offset: Int = 0) → [SearchHit!]!`

- `SearchHit`: `kind`, `entity_type`, `entity_id`, `attachment_id`, `file_name`, `matched_field`, `snippet`, `score`; quan hệ `purchase_request` và `attachment` (Hasura áp quyền xem như query thường).
- `snippet` là HTML an toàn: nội dung đã escape, chữ khớp bọc `<mark>…</mark>`; giao diện hiển thị bằng `dangerouslySetInnerHTML` được.
- Kết quả theo độ khớp. Lọc quyền sau khi tìm nên mỗi lần tìm xét tối đa 1.000 ứng viên trong tenant.
- Lỗi: `query-required` (từ khóa trống), `search-unavailable` (503, Meilisearch không truy cập được).

### Lệnh

```bash
make test-actions T=tests/test_tim_kiem.py   # không dấu, nội dung DOCX, lọc quyền, tenant, gỡ tệp đã xóa, khóa API
docker compose exec db psql -U bms -d bms -c "SELECT entity_type, entity_id, attempts, last_error FROM search.pending WHERE dirty"
docker compose exec db psql -U bms -d bms -c "SELECT search.mark_all()"   # dựng lại toàn bộ chỉ mục
```

## 6. Phiếu PDF – Gotenberg (ADR #37)

```text
get_purchase_request_pdf(request_id)
  ├─ người gọi xem được chứng từ? (wf.entity_can_read) ── không ─► not-found
  ├─ dữ liệu: đề nghị, công ty (đơn vị pháp nhân gần nhất), người lập, nhà cung cấp, dòng hàng,
  │           chuỗi duyệt của lần gửi gần nhất (giờ Việt Nam do PostgreSQL định dạng)
  ├─ HTML = Jinja2(templates/phieu_de_nghi_mua_sam.html), escape tự động; mã nội dung = sha256(FORM_VERSION + HTML)
  ├─ bms-documents/<tenant>/proc.purchase_request/<id>/forms/<mã>.pdf đã có? ── có ─► cached = true
  │     └─ chưa: Gotenberg /forms/chromium/convert/html (A4, chân trang chan_trang.html) ─► lưu
  └─► link GET có chữ ký 5 phút, tên tệp <số chứng từ>.pdf
```

| Mục | Nội dung |
|---|---|
| Đầu phiếu | Công ty (đơn vị pháp nhân chứa đơn vị lập), đơn vị, số chứng từ, ngày lập |
| Thân | Tiêu đề, trạng thái, người đề nghị (mã nhân viên), chức danh, cần trước ngày, nhà cung cấp (MST, địa chỉ), nhóm hàng, mô tả; bảng dòng hàng (số kiểu Việt Nam `1.234.567`), tổng cộng, **bằng chữ** (`forms.amount_in_words`) |
| Phê duyệt | Từng bước: vị trí, người thực hiện (kể cả duyệt thay), kết quả, thời điểm, ý kiến |
| Chân trang | Số chứng từ · mã kiểm tra (16 ký tự đầu của mã nội dung) · Trang x/y |
| Chữ chìm | Trạng thái (Bản nháp, Chờ duyệt, Bị trả về, Từ chối, Đã hủy) khi chưa duyệt xong |

- `gotenberg`: image `gotenberg/gotenberg:8.37.0-chromium` (MIT), chỉ mạng nội bộ, chỉ `actions` gọi. Cờ: `--chromium-disable-javascript`, `--chromium-deny-private-ips`, `--chromium-deny-public-ips`, `--api-disable-download-from`, `--webhook-disable`; trang in không tải được tài nguyên mạng nào (có kiểm thử).
- Phiếu không có giờ in nên in lại cùng nội dung trả đúng tệp cũ (`cached`); sửa mẫu theo cách không đổi HTML thì tăng `FORM_VERSION`.
- Tệp phiếu nằm cùng bucket với tệp đính kèm (sao lưu chung `seaweedfs-data`), không có dòng trong `core.attachment`.
- Lỗi: `not-found`, `pdf-unavailable` (503, Gotenberg không truy cập được).

### Lệnh

```bash
make test-actions T=tests/test_phieu_pdf.py   # bằng chữ, escape, in qua Hasura, tái dùng theo nội dung, quyền, chặn mạng
```

## 7. CDC – Debezium Server → Kafka (ADR #22, #38)

```text
PostgreSQL bms (wal_level=logical, publication bms_cdc)
   └─ slot bms_debezium ─► Debezium Server (bamboo_cdc) ─► Kafka (KRaft) topic bms.<schema>.<bảng>
                              └─ mỗi 10 giây: UPDATE cdc.heartbeat (slot luôn tiến)
```

| Dịch vụ | Image | Ghi chú |
|---|---|---|
| `kafka` | `bamboo-kafka` (`apache/kafka:4.3.1` + JAAS, `start.sh`) | KRaft một node (broker + controller), `kafka:9092` SASL_PLAINTEXT (SCRAM-SHA-512) cho mạng nội bộ, `localhost:19092` (listener `HOST`, cùng SCRAM + ACL) cho công cụ trên máy dev; controller và listener `LOCAL` (`localhost:9094`) chỉ trong container. Giữ 7 ngày, heap 512 MB. Dữ liệu ở volume `kafka-data` |
| `debezium` | `quay.io/debezium/server:3.7.0.Final` | Connector PostgreSQL (`pgoutput`), cấu hình bằng biến `DEBEZIUM_*` trong `infra/compose/data.yml`. Vị trí đọc ở volume `debezium-data`; xóa volume thì chụp ảnh lại toàn bộ |

### Sự kiện

- Topic `bms.<schema>.<bảng>` (ví dụ `bms.proc.purchase_request`, `bms.wf.approval_step`), một partition; khóa là khóa chính (`{"id": "…"}`).
- Giá trị: JSON không kèm schema, dạng phong bì Debezium `{before, after, source, op, ts_ms}`; `op`: `r` (chụp ảnh), `c`, `u`, `d`. Thao tác xóa có thêm một bản ghi rỗng (tombstone) cho log compaction.
- `before` của thao tác sửa là `null` (replica identity mặc định); xóa chỉ có khóa chính trong `before`.
- `numeric` (số tiền, số lượng) dạng chuỗi để không mất chính xác; `timestamptz` dạng chuỗi ISO-8601 UTC; `uuid` dạng chuỗi.
- `source` có `db`, `schema`, `table`, `lsn`, `txId`, `ts_ms`; dùng để sắp thứ tự và loại trùng (Debezium bảo đảm ít nhất một lần).
- Không có topic cho `audit`, `search`, `public` (có kiểm thử). Topic `__debezium-heartbeat.bms` và `bms.cdc.heartbeat` chỉ phục vụ nhịp tim.

### Vận hành

- PostgreSQL: `max_slot_wal_keep_size=1GB`. Debezium dừng lâu hơn mức WAL này thì slot bị vô hiệu; xóa volume `debezium-data` và slot (`SELECT pg_drop_replication_slot('bms_debezium')`) để chụp ảnh lại.
- Độ trễ slot: `SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) FROM pg_replication_slots`.
- Xem topic (listener `LOCAL` trong container, không cần mật khẩu): `docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9094 --list`; đọc sự kiện: `docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9094 --topic bms.proc.purchase_request --from-beginning`.
- Kafka → Iceberg: mục 8.

### Xác thực và ACL (ADR #45)

| Tài khoản SCRAM | Mật khẩu | ACL (tiền tố topic) |
|---|---|---|
| `debezium` | `DEBEZIUM_KAFKA_PASSWORD` | `bms.`, `__debezium-heartbeat`: Write, Create, Describe |
| `lakehouse` | `LAKEHOUSE_KAFKA_PASSWORD` (OpenBao `bms/kafka-lakehouse` cho `lakehouse-sink`) | `bms.`: Read, Describe (tự gán partition, không dùng consumer group) |

- `allow.everyone.if.no.acl.found=false`: tài khoản mới hay topic ngoài tiền tố đều bị từ chối. `start.sh` đặt lại mật khẩu và ACL mỗi lần khởi động; đổi mật khẩu: sửa `.env` rồi `docker compose up -d` (Kafka, Debezium, `openbao-init`, `lakehouse-sink` nhận giá trị mới).
- Mật khẩu không được chứa `,` `[` `]` `=` `"` `\` (cú pháp của `kafka-configs` và JAAS); Kafka dừng ngay với thông báo rõ nếu vi phạm.
- Thêm dịch vụ đọc / ghi Kafka: thêm tài khoản và ACL trong `infra/platform/kafka/start.sh`, mật khẩu trong `.env`.
- Xem ACL: `docker compose exec kafka /opt/kafka/bin/kafka-acls.sh --bootstrap-server localhost:9094 --list`.

### Lệnh

```bash
make test-db T=bms_120              # publication, quyền của bamboo_cdc
make test-actions T=tests/test_cdc.py   # nhịp tim đi hết CSDL → Debezium → Kafka; topic nghiệp vụ; không lộ audit;
                                        # client không xác thực bị từ chối, tài khoản chỉ đọc không ghi được
```

## 8. Lakehouse bronze – Kafka → Iceberg (ADR #39)

```text
Kafka bms.<schema>.<bảng>  (core, mdm, wf, proc, ic, mfg, collab; bỏ nhịp tim)
   └─► lakehouse-sink: lô ≤ 5.000 dòng hoặc 30 giây ─► append bronze.<schema>_<bảng>
          snapshot summary "kafka.offsets" = vị trí tiếp theo của từng partition (khởi động lại đọc tiếp từ đây)
Catalog: PostgreSQL CSDL lakehouse (bảng iceberg_tables, iceberg_namespace_properties – JDBC catalog)
Dữ liệu: s3://bms-lakehouse/warehouse/bronze/<bảng>/{metadata,data}/  (Parquet, phân vùng source_date)
```

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `op` | string | `r` chụp ảnh ban đầu, `c` thêm, `u` sửa, `d` xóa |
| `source_ts`, `source_date` | timestamp UTC, date | Thời điểm giao dịch trong CSDL; `source_date` là khóa phân vùng |
| `lsn`, `tx_id` | long | Vị trí WAL, mã giao dịch PostgreSQL (sắp thứ tự, gom theo giao dịch) |
| `tenant_id` | string | Tenant của dòng (lọc theo công ty khi phân tích) |
| `record_key` | string | Khóa chính dạng JSON, ví dụ `{"id":"…"}` |
| `before`, `after` | string (JSON) | Ảnh dòng trước/sau; sửa thì `before` null (replica identity mặc định, ADR #38) |
| `kafka_partition`, `kafka_offset` | int, long | Vị trí sự kiện trong Kafka, duy nhất trong bảng |
| `ingested_at` | timestamp UTC | Lúc ghi vào lakehouse |

- Trạng thái hiện tại của một bảng: view silver (mục 9).
- Đúng một lần theo từng bảng: dữ liệu và vị trí Kafka nằm trong cùng một commit Iceberg. Tombstone (bản ghi rỗng sau xóa) không ghi thành dòng.
- Bảng nguồn mới (topic mới) được nhận trong vòng 60 giây; bảng bronze tạo tự động.
- Lô nhỏ sinh nhiều tệp Parquet nhỏ: gộp bằng Trino `ALTER TABLE lakehouse.bronze.<bảng> EXECUTE optimize` (mục 9).
- Sao lưu: catalog nằm trong `pg_dumpall`, dữ liệu trong volume `seaweedfs-data` (script sao lưu đã gồm cả hai).

| Thành phần | Quyền |
|---|---|
| AppRole `lakehouse` | đọc `bms/lakehouse` (tài khoản catalog), `bms/seaweedfs-lakehouse`; không đọc `bms/postgres`, khóa S3 khác, `pii` |
| Role CSDL `bamboo_lakehouse` | chủ CSDL `lakehouse`; không kết nối được CSDL `bms` |
| Định danh S3 `bms-lakehouse` | `Read/Write/List/Tagging` chỉ trên `bms-lakehouse`; `bms-app`, `bms-search` không vào được bucket này |

### Lệnh

```bash
make test-actions T=tests/test_lakehouse.py   # sự kiện → dòng bronze, ghi từ topic thật, không trùng khi khởi động lại
docker compose logs -f lakehouse-sink
```

## 9. Tầng silver và Trino (ADR #40)

```text
infra/platform/trino/silver.sql  (sinh bằng app.lakehouse_silver từ kiểu cột PostgreSQL, commit vào Git)
   └─ trino-init (mỗi lần khởi động): CREATE TABLE IF NOT EXISTS bronze.* ; CREATE OR REPLACE VIEW silver.*
Trino (catalog lakehouse = JDBC catalog Iceberg của lakehouse-sink) ─► lakehouse.silver.<schema>_<bảng>
```

| Dịch vụ | Image | Ghi chú |
|---|---|---|
| `trino` | `bamboo-trino` (`trinodb/trino:483` + cấu hình, `rules.json`) | Một node, heap 1 GB, HTTPS `trino:8443` (máy dev: `https://127.0.0.1:8085`, giao diện web). Catalog `/etc/trino/bms-catalog/lakehouse.properties` và bí mật `/etc/trino/secrets` (chứng chỉ TLS, `password.db`, khóa ký nội bộ) do `openbao-init` ghi |
| `trino-init` | cùng image | Đăng nhập `bms-admin` qua HTTPS, chạy `infra/platform/trino/silver.sql` rồi thoát |

### View silver

- `lakehouse.silver.<schema>_<bảng>` cho mọi bảng trong publication `bms_cdc` (trừ `cdc`): cột như PostgreSQL, thêm `_changed_at` (thời điểm thay đổi gần nhất), `_lsn`.
- Mỗi khóa chính một dòng: sự kiện mới nhất theo (`kafka_partition`, `kafka_offset`); dòng mới nhất là xóa thì không hiện.
- Ánh xạ kiểu: `uuid` → `uuid`; `numeric(p,s)` → `decimal(p,s)` (không có độ chính xác → `double`); số nguyên → `smallint/integer/bigint`; `date` → `date`; `timestamptz` → `timestamp(6) with time zone`; mảng → `array(varchar)`; `jsonb`, `ltree`, khoảng thời gian (`tstzrange`), `text` → `varchar`.
- Cột sinh tự động (`GENERATED ALWAYS … STORED`, ví dụ `proc.purchase_request_item.amount`) không có trong silver: PostgreSQL 17 không đưa cột này vào replication logic.
- Độ trễ từ lúc ghi CSDL tới silver: khoảng 30 giây (lô của lakehouse-sink).
- Đổi cấu trúc CSDL (migration mới): `make trino-sql` sinh lại `silver.sql` và `rules.json`; kiểm thử `test_tep_sql_khop_csdl`, `test_quyen_trino_khop_csdl` báo lỗi nếu quên.

### Xác thực và quyền theo tenant (ADR #45)

```text
trình duyệt ─► Hasura Action lakehouse_* ─► actions (kiểm data.lakehouse.read ở đơn vị gốc của tenant)
   └─ HTTPS 8443, đăng nhập bms-actions, X-Trino-User: t_<tenant_id> ─► Trino
        rules.json: t_<uuid> chỉ SELECT view silver có cột tenant + row filter tenant_id = <uuid trong tên>
```

| Tài khoản | Dùng cho | Quyền |
|---|---|---|
| `bms-admin` | `trino-init`, quản trị trên máy dev (`make trino-password`) | Toàn quyền |
| `bms-actions` | dịch vụ actions (OpenBao `bms/trino-actions`) | Không đọc được gì; chỉ mượn danh `t_<tenant_id>` |
| `t_<tenant_id>` (mượn danh) | truy vấn thay người dùng của tenant | `SELECT` view silver có cột tenant, row filter theo tenant; không đọc bronze, `system`, `core_permission`, `core_tenant_relation` |

- TLS: chứng chỉ `CN=trino` (SAN `trino`, `localhost`, `127.0.0.1`) do CA nội bộ của OpenBao (`pki/`) cấp, hạn 1 năm, `openbao-init` cấp lại khi còn dưới 30 ngày; client tin CA ở `/run/bms/trino-ca.pem` (actions) hoặc `/etc/trino/secrets/ca.pem`.
- Cổng HTTP 8080 không nhận mật khẩu; chỉ giao tiếp nội bộ (khóa ký `shared-secret`) và `/v1/info` của healthcheck.
- Mật khẩu do OpenBao sinh một lần; quay vòng: ghi mật khẩu mới vào `secret/bms/trino-actions` (hoặc `trino-admin`) rồi `docker compose up -d openbao-init` và khởi động lại `actions`. Trino tự đọc lại `password.db` sau vài giây.

### Truy vấn

```bash
make trino-password     # mật khẩu bms-admin; giao diện web https://127.0.0.1:8085 (chứng chỉ của CA nội bộ)
docker compose exec trino-core bash -c 'TRINO_PASSWORD=$(cat /etc/trino/secrets/admin.password) trino \
  --server https://localhost:8443 --truststore-path /etc/trino/secrets/ca.pem --user bms-admin --password \
  --catalog lakehouse --schema silver'
```

```sql
-- Tổng giá trị đề nghị đã duyệt theo tenant
SELECT t.name, count(*) AS so_de_nghi, sum(r.total_amount) AS tong_tien
FROM lakehouse.silver.proc_purchase_request r JOIN lakehouse.silver.core_tenant t ON t.id = r.tenant_id
WHERE r.status = 'APPROVED' GROUP BY t.name;

-- Lịch sử thay đổi trạng thái của một đề nghị (bronze)
SELECT source_ts, op, json_extract_scalar(after, '$.status') AS status
FROM lakehouse.bronze.proc_purchase_request
WHERE json_extract_scalar(after, '$.doc_no') = 'PR-2026-000001' ORDER BY kafka_offset;

-- Gộp tệp Parquet nhỏ
ALTER TABLE lakehouse.bronze.proc_purchase_request EXECUTE optimize;
```

### Lệnh

```bash
make trino-sql                                  # sinh lại silver.sql sau migration và áp dụng
make test-actions T=tests/test_lakehouse_silver.py   # kiểu cột, tệp SQL và rules.json khớp CSDL, silver khớp CSDL nguồn
make test-actions T=tests/test_lakehouse_query.py    # đăng nhập, mượn danh, row filter theo tenant, Action Dịch vụ dữ liệu
```

## 10. Che dữ liệu cá nhân – Microsoft Presidio (ADR #43)

Thư viện trong tiến trình `actions` (`services/actions/app/pii_guard.py`), không thêm container. Presidio chỉ chạy bộ nhận diện theo mẫu: spaCy `blank("xx")` tách từ, không tải mô hình NER (mô hình tiếng Anh không nhận ra tên người Việt, mô hình lớn tốn khoảng 500 MB). Nạp lười ở luồng nền lúc khởi động (khoảng 2 giây, thêm khoảng 100 MB bộ nhớ); mỗi lần phân tích vài mili giây.

| Loại | Nhận diện | Bản che |
|---|---|---|
| `VN_CCCD` | 12 chữ số bắt đầu bằng 0, cho phép tách nhóm 3 | `•••••••••789` |
| `VN_CMND` | 9 chữ số, chỉ khi có từ khóa "CMND", "chứng minh" đứng trước | `••••••789` |
| `VN_PHONE` | Di động `0[35789]x` + 7 số, cố định `02x` + 8 số, cả dạng `+84`; tách bằng khoảng trắng, chấm, gạch | `0912 *** 678` |
| `VN_BANK_ACCOUNT` | 6–20 chữ số sau "STK", "số tài khoản", "tài khoản ngân hàng" | `••••••••••456` |
| `EMAIL_ADDRESS` | Địa chỉ email | `n***@dienthoai.vn` |
| `CREDIT_CARD` | Bộ nhận diện của Presidio (kiểm tra Luhn) | `••••••••••••1111` |

Không che nhầm số tiền (`12.000.000`, `1500000000`), số chứng từ (`PR-2026-000001`), ngày, mã lô; 12 chữ số bắt đầu bằng 0 luôn coi là CCCD (che thừa an toàn hơn sót).

Dùng ở:

- **Nhật ký kiểm toán**: Hasura không trả `old_data`, `new_data` của `audit_log`; giao diện lấy qua Action `audit_log_detail(log_ids)` (cần `audit.read`), đã che bằng Presidio cộng theo tên cột (`*_enc` → `[bản mã]`, `date_of_birth` → chỉ giữ năm, `phone`, `work_email` luôn che). Trả kèm `masked`: các loại đã che, giao diện hiện nhãn "Đã che: …".
- **Ô trao đổi trên chứng từ**: trước khi gửi, giao diện gọi `check_pii(text)`; có dữ liệu cá nhân thì hỏi gửi bản đã che, sửa lại hay vẫn gửi nguyên văn.

```bash
make test-actions T=tests/test_pii_guard.py     # nhận diện, che, không che nhầm (không cần dịch vụ)
make test-actions T=tests/test_che_pii.py       # Action và Hasura: nhật ký chỉ trả bản che
```

## 11. Mô hình AI cục bộ – Ollama (ADR #51)

Trợ lý RAG hỏi đáp Thư viện tri thức. Mọi thứ chạy trong máy chủ: Ollama phục vụ mô hình sinh `qwen3:4b` và embedding `bge-m3`, vector nằm trong Meilisearch có sẵn, điều phối là lớp mỏng trong `actions`.

| Service | Profile | Việc |
|---|---|---|
| `ollama` | `ai` | `ollama/ollama:0.35.1`, `OLLAMA_NUM_PARALLEL=1`, giữ hai mô hình trong bộ nhớ 30 phút, cổng `127.0.0.1:11434` |
| `ollama-init` | `ai` | Tải `AI_CHAT_MODEL`, `AI_EMBED_MODEL` vào volume `ollama-models` lần đầu (~3,7 GB), sau đó chạy không cần Internet |
| `ai-worker` | `ai` | `python -m app.ai_worker`: trả lời lượt hỏi theo hàng đợi |
| `search-sync` | (mặc định) | Thêm hàng đợi `search.pending_chunk`: chia đoạn, gọi `/api/embed`, ghi `documents_kb_chunk`; chỉ chạy khi Ollama trả lời `/api/tags` |
| `bootstrap` | (mặc định) | Tạo chỉ mục `documents_kb_chunk` (embedder `userProvided`, 1024 chiều) bằng khóa admin |

Biến môi trường (`x-actions-env`, không phải bí mật): `OLLAMA_URL` (mặc định `http://ollama:11434`), `AI_CHAT_MODEL` (`qwen3:4b`), `AI_EMBED_MODEL` (`bge-m3`), `MEILI_CHUNK_INDEX` (`documents_kb_chunk`), `AI_MIN_SCORE` (`0.7`: điểm tối thiểu của đoạn; Meilisearch quy cosine về `(1 + cos) / 2` nên đoạn không liên quan vẫn được khoảng 0,5–0,7), `AI_CPU_MODELS` (`bge-m3`: mô hình phụ được giữ lại khi gỡ mô hình chính, ADR #52); `ai-worker` thêm `OCR_URL` (`http://ocr:8000`). Mô hình chỉ nạp khi có việc: `AI_KEEP_ALIVE` (`5m`, đặt cho `ollama`) và `OCR_IDLE_SECONDS` (`300`, đặt cho `ocr`) là thời gian nhàn rỗi trước khi gỡ. Ollama không truy cập được thì `ai_assistants` trả `ai_enabled = false`, trang `/i/assistant` hiện "Trợ lý AI chưa bật"; các đoạn chờ trong `search.pending_chunk` và được nạp bù khi bật.

### Chỉ mục đoạn

- `app/ai_chunks.py`: văn bản lấy như chỉ mục toàn văn (Tika, `search.TEXT_TYPES`) nhưng giữ xuống dòng; chia theo dòng, rồi theo câu, ~800 token (ước lượng 3,5 ký tự / token), gối ~100 token, không vượt qua ranh giới tiêu đề. Dòng ngắn viết hoa hoặc bắt đầu "Điều", "Chương", "Mục", "Phần", "Phụ lục" là tiêu đề, gắn vào các đoạn sau nó.
- Mỗi tài liệu có thêm đoạn "meta" từ tiêu đề, tóm tắt, mục lục.
- Khóa đoạn `<kb_document_id>_<attachment_id|meta>_<số thứ tự>`; mỗi lần đồng bộ xóa hết đoạn của tài liệu (delete by filter) rồi nạp lại nếu tài liệu còn `APPROVED`. Trigger `search.kb_document_changed`, `search.attachment_changed` và Action `kb_reindex` đánh dấu `search.pending_chunk`; lỗi (Ollama tắt) thử lại theo backoff như `search.pending`, không ảnh hưởng chỉ mục toàn văn.

### Một lượt hỏi

```
Giao diện ──ai_ask──▶ actions: kiểm tác tử, prompt_guard, che PII câu hỏi ──▶ core.ai_question (queued) ──NOTIFY──┐
   ▲                                                                                                           ▼
   │ subscription core_ai_question_by_pk                                    ai-worker: claim (FOR UPDATE SKIP LOCKED)
   │                                                                          │ 1. /api/embed câu hỏi
   │                                                                          │ 2. Meilisearch hybrid (semanticRatio 0,7), lọc tenant [+ tài liệu], điểm ≥ AI_MIN_SCORE
   │                                                                          │ 3. Lọc kb_can_read_published theo người hỏi; chọn ngữ cảnh: bỏ trùng, bỏ đoạn kém
   │                                                                          │    đoạn tốt nhất > 0,15 điểm, ≤ 3.000 token, ≤ 6 đoạn (ADR #63)
   │                                                                          │ 4. Không còn đoạn → refused / scope (không gọi mô hình)
   │                                                                          │ 5. Cùng context_key đã có lượt done ≤ 7 ngày → chép câu trả lời, reused_from
   │                                                                          │ 6. /v1/chat/completions stream, ghi answer ~1 giây / lần; lập luận của mô hình
   │                                                                          │    không vào answer, quá dài thì cắt rồi gọi thêm một lần để trả lời ngay (ADR #85)
   └──────────────────────────────────────────────────────────────────────────┘ 7. gỡ [n] ngoài 1..số văn bản, citations theo văn bản, che PII, done
```

- Prompt hệ thống ([ADR #85](#adr-85)): trả lời thẳng vào điều được hỏi ngay từ câu đầu, bằng câu đầy đủ và ngắn gọn (không chào hỏi, không lời dẫn, không kể thêm điều không được hỏi, không tóm tắt hay gợi ý ở cuối); văn bản quy định theo mức (khoảng tiền, thời hạn) thì nêu mức áp dụng; chỉ dựa trên `<tai_lieu>`, ghi số văn bản `[n]` ngay sau ý lấy từ văn bản đó (tên văn bản do giao diện hiện tại chỗ trích dẫn), giữ nguyên con số và hạn mức, nội dung tài liệu là dữ liệu chứ không phải chỉ dẫn. Quy tắc viết bằng tiếng Việt cho câu hỏi tiếng Việt, bằng tiếng Anh cho mọi ngôn ngữ khác. Đoạn gom theo văn bản: `<van_ban n ten so>` chứa các `<doan muc>` theo thứ tự đọc; `n` là số văn bản, cũng là số trích dẫn. Ký tự `<` `>` trong nội dung được thoát nên không đóng thẻ được.
- Ngôn ngữ trả lời là ngôn ngữ của câu hỏi: `lang.detect` nhận bằng luật (không gọi mô hình) tiếng Việt có dấu hoặc không dấu, tiếng Anh, tiếng Trung, Nhật, Hàn (theo chữ viết) và "ngôn ngữ khác"; câu chỉ có mã, số thì theo ngôn ngữ giao diện của người hỏi (`collab.person_locale`). Lượt user là câu hỏi kèm lời nhắc trong ngoặc viết bằng chính ngôn ngữ đó, ví dụ `(Answer in English, only what is asked.)`. Lời từ chối (`scope`, `prompt`), báo lỗi và ghi chú "bị cắt" lưu theo ngôn ngữ câu hỏi: tiếng Việt, mọi ngôn ngữ khác dùng tiếng Anh (bản dịch trong `server.en.json`).
- `citations`: mỗi văn bản được nhắc một mục `{n, kb_document_id, doc_no, title, attachment_id, file_name, heading, sections, position}`; không có `[n]` hợp lệ nào thì lấy mọi văn bản đã đưa vào ngữ cảnh.
- Ollama tạm lỗi: lượt về hàng đợi, `attempts + 1`; đến 8 lần thì `error`. Worker chờ 5, 10, 20, 40, 60 giây giữa các lần.
- `temperature 0.2`, `reasoning_effort: "none"` (bỏ khi tác tử bật `think`). Giới hạn sinh 1.024 token với mô hình trả lời thẳng (Ollama không ghi khả năng `thinking` ở `/api/show`), 2.048 token gồm cả lập luận với mô hình có thể suy nghĩ.
- Lập luận của mô hình không bao giờ nằm trong câu trả lời ([ADR #85](#adr-85)). Bật `think`: Ollama tách lập luận sang trường riêng, worker lưu vào `thinking`. Tắt `think`: lập luận không được hiện và không được lưu; mô hình không tắt được suy nghĩ (thẻ `qwen3:4b` của kho Ollama hiện là bản thinking, template luôn mở sẵn `<think>`) vẫn viết lập luận vào nội dung rồi đóng bằng `</think>`, nên worker bỏ mọi thứ trước thẻ đóng cuối cùng và chỉ ghi `answer` từ sau thẻ đó. Mô hình có khả năng `thinking` được coi là có thể như vậy cho tới khi một lượt trả lời trọn vẹn không có thẻ đóng (`may_reason_aloud`, nhớ trong tiến trình worker): quá `REASON_MAX_TOKENS` (512) mảnh mà chưa tới thẻ đóng thì lập luận bị cắt (đóng kết nối, Ollama ngừng sinh).
- Lập luận bị cắt, hoặc hết token khi chưa có câu trả lời (kể cả khi bật `think`), thì worker gọi mô hình thêm một lần với lượt assistant mở sẵn `<think>…lập luận dở…</think>` (`close_reasoning`) để nó viết tiếp ngay câu trả lời, tối đa 1.024 token; phần ngữ cảnh đã nằm trong bộ nhớ đệm của Ollama nên lần gọi này chỉ tốn thời gian sinh câu trả lời. Vẫn không có câu trả lời thì lượt hỏi `error` ("suy nghĩ quá dài"); mô hình trả về rỗng cũng là `error` thay vì `done` với câu trả lời trống.
- Lượt `running` quá 10 phút khi worker khởi động lại được đánh dấu `error`.
- Nhật ký kiểm toán `core.ai_question` ghi khi tạo và khi đổi trạng thái, người thao tác là người hỏi; câu hỏi và câu trả lời đã che PII trước khi ghi.

### Guardrail

Đọc từ `core.ai_agent.guardrail_config`, mặc định bật cả ba; `think` mặc định tắt.

| Guardrail | Ở đâu | Làm gì |
|---|---|---|
| `scope_guard` | worker bước 4 | Không còn đoạn nào người hỏi được xem thì trả "Không tìm thấy…", không gọi mô hình |
| `pii_guard` | `ai_ask`, worker | Che câu hỏi trước khi lưu, câu trả lời mỗi lần ghi (mục 10) |
| `prompt_guard` | `ai_ask` | Mẫu cố định `ai_agent.INJECTION_PATTERNS` so trên văn bản bỏ dấu, viết thường ("bỏ qua … hướng dẫn", "ignore … instructions", "system prompt", "bạn bây giờ là", "you are now", "đóng vai" trừ "đóng vai trò", thẻ `tai_lieu`/`doan`, "jailbreak") và "DAN" phân biệt hoa thường; khớp thì lưu `refused / prompt` |

### Giới hạn

Chạy CPU mất vài chục giây đến khoảng hai phút mỗi lượt (bản thinking của `qwen3:4b` luôn lập luận trước khi trả lời, phần này đã giới hạn 512 mảnh); một lượt một lúc nên người sau phải chờ. Hàng đợi chung cho mọi tenant (một mô hình), nên vị trí chờ người hỏi thấy gồm cả lượt của tenant khác (chỉ là con số, không lộ nội dung). Chỉ chạy một `ai-worker`. Mô hình 4B có thể trả lời thiếu ý hoặc trích sai số đoạn; smoke test `tools/ai_smoke.sh` dùng để kiểm bằng mắt. Chỉ lấy tài liệu thư viện đang hiệu lực, không lấy tệp chứng từ hay Ổ đĩa.

```bash
make up                                           # AI chạy cùng hệ thống, tự dùng GPU NVIDIA khi có
make test-actions T=tests/test_tro_ly_ai.py       # chia đoạn, guardrail, worker với Ollama giả
make test-actions T=tests/test_ngon_ngu_tra_loi.py  # ngôn ngữ trả lời, ẩn và giới hạn lập luận (không cần CSDL)
tools/ai_smoke.sh                                 # hỏi thật 39 câu mẫu khi đã tải xong mô hình
```

## 12. Quét tệp trước khi nhận (`packages/py-common/src/bamboo_common/scanner.py`, migration 034)

Mọi tệp tải lên nằm ở bucket `bms-quarantine` cho tới khi quét xong. **Bộ quét nội bộ** luôn chạy trong tiến trình
`actions`: chữ ký thử nghiệm EICAR, tệp thực thi nhúng, cấu trúc đúng chuẩn của từng định dạng, dữ liệu thừa sau ảnh, mã chủ
động trong PDF, macro / đối tượng nhúng / liên kết ngoài trong DOCX và XLSX, bom nén, đường dẫn nguy hiểm, DTD (XXE). Không
quét hết được (hết thời gian, bị mã hóa, nén quá mức) thì tệp **không** được coi là sạch.

Bộ quét nội bộ không có cơ sở dữ liệu mẫu virus nên không thay được ClamAV. Bật ClamAV: `docker compose --profile scan up -d`
với `CLAMAV_HOST=clamav`; `SCAN_REQUIRE_CLAMAV=true` bắt buộc có ClamAV (thiếu thì không nhận tệp nào). CSDL chặn tệp `CLEAN`
không có `scan_engines`; tệp cũ nhận khi chưa có bộ quét được đánh dấu `unscanned`, `flow-sync` quét lại rồi mới cho tải về.
Chưa có xử lý CDR (làm sạch tệp).

## 13. OCR tiếng Việt (`services/ocr`, ADR #52)

Dịch vụ `ocr` không trạng thái (`POST /ocr` một trang ảnh, `POST /unload` gỡ mô hình): PaddleOCR phát hiện và xoay dòng,
VietOCR nhận dạng, chạy trên PyTorch (CUDA nếu có, không thì CPU). `ai-worker` giữ một hàng đợi chung với lượt hỏi AI, OCR ảnh
và trang PDF không có lớp chữ, lưu kết quả ở `core.attachment_ocr` và đưa văn bản vào chỉ mục tìm kiếm. Job `ocr-init` tải
trọng số lần đầu (kiểm sha256). Trang Nhập liệu OCR (`/i/ocr`, Action `ocr_document`) rút nhà cung cấp, mã số thuế, dòng hàng
và số tiền bằng quy tắc (`ocr_fields.py`), không dùng mô hình. Chạy ở mọi mức RAM (ADR #69).

## 14. Dịch vụ tự ngủ – `sleeper` (ADR #53)

`trino-core`, `tika-core`, `gotenberg-core`, `ollama-core`, `ocr-core` chỉ chạy khi có yêu cầu. `sleeper` giữ tên mạng và cổng
cũ (`trino`, `tika`, `gotenberg`, `ollama`, `ocr`), start container thật khi nhận byte đầu tiên, chờ healthcheck rồi chuyển
tiếp nguyên byte TCP; không có lưu lượng quá `SLEEPER_IDLE_SECONDS` (mặc định 300) thì stop. `sleeper` gắn
`/var/run/docker.sock` nhưng chỉ gọi inspect/start/stop trên container thuộc `SLEEPER_TARGETS`. Trạng thái:
`GET :9000/status` trong container.

## 15. Hàng đợi tin nhắn và thông báo đa kênh (`messaging.py`, `delivery.py`, `receipts.py`, migration 035)

- Thông báo trong ứng dụng (`collab.notification`) được chuyển tiếp qua **email** (SMTP), **SMS** (cổng HTTP) và **webhook**
  theo lựa chọn của từng người ở `/settings/notifications` (`collab.notification_pref`).
- Tin vào `msg.queue`; worker trong `flow-sync` thuê tin, gửi, lỗi tạm thì thử lại lùi dần, lỗi vĩnh viễn hoặc hết lượt thì vào
  hàng chết. Quản trị viên xem hàng đợi, đưa tin chết trở lại và xác minh biên nhận ở `/admin/queue`
  (`queue_overview`, `queue_retry`, `queue_verify`).
- **Chống chối bỏ:** mỗi tin giao xong có biên nhận gồm mã băm nội dung, kênh, thời điểm và mã của nhà cung cấp, ký Ed25519 bằng
  khóa transit `receipt` trong OpenBao (khóa riêng không rời két). Môi trường thử không có OpenBao thì dùng HMAC-SHA256 và ghi rõ
  thuật toán.
- Webhook: chỉ `https`, phân giải tên rồi từ chối địa chỉ nội bộ (SSRF) và kết nối thẳng tới IP đã kiểm, không theo chuyển hướng;
  `WEBHOOK_ALLOW_PRIVATE=true` chỉ để thử trên máy dev.
- Chưa cấu hình `SMTP_HOST` thì thư đi vào `mailpit` (hộp thư thử, cổng 8025 trên máy chủ).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | trống, `25`, …, `false` | Máy chủ thư |
| `SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN` | trống | Cổng SMS dạng HTTP |
| `WEBHOOK_ALLOW_PRIVATE` | `false` | Cho phép webhook tới địa chỉ nội bộ |

## 16. Neo chuỗi kiểm toán (`anchoring.py`, migration 036)

Theo chu kỳ `ANCHOR_INTERVAL_SECONDS` (mặc định 300), mỗi tenant có bản ghi kiểm toán mới thì đầu chuỗi hash (tenant, số thứ
tự, mã băm, thời điểm) được ký bằng khóa Ed25519 trong OpenBao, lưu vào `audit.anchor` và công bố ra kho đối tượng; đặt
`ANCHOR_URL` để công bố thêm tới một điểm bên ngoài. Người chỉ có quyền ghi CSDL không ký lại được, nên lịch sử đã neo không
viết lại hay cắt bớt mà không bị phát hiện (`audit.check_anchors`, Action `audit_anchor_verify`). Xem và neo ngay ở
`/admin/ops`.

## 17. Nhật ký tập trung, sao lưu, GitOps

- **Nhật ký** (`obs.py`, migration 037): mọi dịch vụ Python ghi log vào `obs.log_event` qua một luồng riêng (hàng đợi đầy thì bỏ
  bớt, không làm chậm yêu cầu), gắn `trace_id` lấy từ `X-Request-Id` do cổng API cấp, tenant, người dùng, đã che email, số điện
  thoại, CCCD, token. Log container khác vào qua `POST /obs/ingest` từ `vector` (profile `logs`, cấu hình
  `infra/platform/vector/vector.yaml`). Xem ở `/admin/ops`, tab Nhật ký; tắt bằng `OBS_ENABLED=false`. Chưa có OpenTelemetry,
  Prometheus, Grafana.
- **Sao lưu** (`tools/ops/backup-db.sh`, dịch vụ `backup`, migration 038): sao lưu CSDL theo chu kỳ `BACKUP_INTERVAL_HOURS`
  (mặc định 24, giữ `BACKUP_KEEP` = 7 bản) vào volume `backups`; `tools/ops/restore-drill.sh` khôi phục vào CSDL tạm rồi đối
  chiếu số dòng, chuỗi hash và bản neo. Mỗi lần ghi `audit.backup_run`. Sao lưu volume và khôi phục thủ công:
  [Triển khai production](../van-hanh/trien-khai.md).
- **GitOps** (`tools/gitops/reconcile.sh`, [ADR #83](#adr-83)): kéo nhánh `GITOPS_BRANCH`, so cấu hình trong kho mã với trạng
  thái đang chạy, chỉ chạy `docker compose up -d` khi cấu hình đổi hoặc có dịch vụ dừng, lỗi; dùng cùng mức RAM và nhóm dịch vụ
  như `make up` (`tools/ram_profile.sh`), có khóa chống chạy chồng. `tools/gitops/schedule.sh` lên lịch chạy mỗi
  `GITOPS_INTERVAL_MINUTES` phút bằng systemd timer hoặc cron (`make gitops-enable`); `make up` tự bật khi
  `BAMBOO_ENV=production`. Không dùng Argo CD hay Kubernetes. Dịch vụ có healthcheck và `restart: unless-stopped` để tự khởi
  động lại khi lỗi.

## 18. Quy trình tự động và kịch bản ngầm (`process_automation.py`, migration 033, 040)

Phiên bản quy trình đã phát hành chỉ gồm sự kiện, cổng rẽ nhánh, hẹn giờ và tác vụ tự động thì bật **chạy tự động**
(`process_automation_enable`): sơ đồ được chuyển thành định nghĩa Flowable; tác vụ tự động là external job, `flow-sync` nhận
việc qua API tác vụ ngoài của Flowable, thực hiện rồi báo hoàn thành.

- Cách bắt đầu: hẹn giờ ISO-8601 (Flowable tự kích hoạt), khởi chạy tay (`process_automation_start`), webhook
  `POST /hooks/{mã}` qua cổng API (mã chỉ hiện một lần, CSDL giữ SHA-256; giới hạn 60 lần/phút, 64 KB), hoặc sự kiện nghiệp vụ
  `event.*` (`purchase_request.*`, `onboarding.*`, `ic_order.*`, `personnel_decision.issued`) đăng ký bằng
  `process_automation_events`.
- Hành động có sẵn: `notify` (gửi thông báo, thay biến `{doc_no}`...), `setvar` (đặt biến quy trình), `http` (gọi https ra
  ngoài, cùng kiểm SSRF như webhook). Người dùng chưa tự viết mã kịch bản được.
- Mỗi lần chạy ghi `wf.automation_run`; xem ở tab **Chạy tự động** của trang Thiết kế quy trình (`/p/process`).

## 19. API nạp dữ liệu theo lô (`ingest.py`, migration 039)

`POST /ingest/{loại}` qua cổng API (token Keycloak, header `X-Bamboo-Tenant` và `Idempotency-Key` 8–128 ký tự), nội dung
NDJSON hoặc CSV tới 64 MB, 200.000 dòng. Loại: `org_unit`, `position`, `person`, `assignment`, `role`, `role_grant`,
`catalog_item`, `partner`, `item`, `storage_quota`; dùng lại bộ xử lý và kiểm quyền của trang nhập dữ liệu quản trị
([ADR #44](#adr-44)). Tham số `mode=best-effort|atomic` (atomic: có lỗi thì hoàn tác hết), `dry_run=true` (không ghi). Dữ liệu
đi từng lô 500 dòng, lỗi từng dòng ghi vào `core.ingest_job`; theo dõi bằng `GET /ingest/jobs/{id}`. Cổng API giới hạn 30 lần
nạp mỗi phút.

## 20. Văn bản mẫu (`documents.py`, `services/actions/app/templates/`)

Cùng đường ống với phiếu đề nghị (mục 6): mẫu Jinja2 tự escape → Gotenberg/Chromium → PDF lưu trong kho tài liệu theo mã băm
nội dung; nội dung không đổi thì không dựng lại, mã kiểm tra ở chân trang là mã băm đó. Mẫu hiện có: phiếu đề nghị mua sắm,
quyết định nhân sự (`get_personnel_decision_pdf`), báo cáo KPI đã đóng băng (`get_kpi_report_pdf`).

## 21. Lớp ngữ nghĩa trên Lakehouse (`semantic.py`)

Người gọi chọn chỉ số, chiều, độ chi tiết thời gian (ngày, tuần, tháng) và bộ lọc theo tên nghiệp vụ (`semantic_catalog`,
`semantic_query`); hệ thống sinh câu SQL trên view silver của Trino. Chỉ tên trong danh mục mới vào được câu SQL, giá trị lọc
kiểm định dạng chặt, tối đa 1.000 dòng. Truy vấn chạy bằng tài khoản Trino của chính tenant nên luật lọc theo tenant
([ADR #45](#adr-45)) vẫn áp dụng. `metrics` (tối đa 4, cùng nguồn) thay cho `metric` khi cần nhiều chỉ số: mỗi chỉ số một cột
mang tên chỉ số, `measures` mô tả tên và đơn vị. Giao diện **Phân tích BI** (`/i/bi`, ADR #63) dựng biểu đồ trên hai Action
này và lưu định nghĩa biểu đồ ở `kpi.chart` (của mình, hoặc `shared` cho cả công ty xem).

## 22. Mô-đun chức năng (`modules.py`, migration 042, ADR #56)

Phần lõi luôn bật (gồm cả nhắn tin và lịch công tác, [ADR #65](#adr-65)); 12 mô-đun dựng sẵn bật/tắt ở **Quản trị → Quản lý chức năng** (`/admin/modules`).

| Mô-đun | Cần | Container |
|---|---|---|
| `approval` Phê duyệt | – | – |
| `procurement` Mua sắm | `approval` | `flowable` |
| `ic` Đơn hàng nội bộ | `procurement` | – |
| `hr` Nghiệp vụ nhân sự | `approval` | – |
| `process` Thiết kế & tự động hóa quy trình | – | `flowable` |
| `files` Ổ đĩa & tệp đính kèm | – | – |
| `search` Tìm kiếm toàn văn | – | `meilisearch`, `search-sync`, `tika-core` |
| `knowledge` Thư viện tri thức | `approval`, `files`, `search` | – |
| `ledger` Sổ cái | – | – |
| `data` Dữ liệu số | – | `kafka`, `debezium`, `lakehouse-sink`, `trino-core` |
| `ai` Trí tuệ số | `files`, `search` | `ollama-core`, `ocr-core`, `ai-worker` |
| `project` Quản lý dự án ([ADR #66](#adr-66)) | – | – |

- **Hai tầng:** cài trên máy (`core.module_install`, chỉ `platform_admin`; container chạy) và bật cho công ty (`core.tenant_module`, quyền `core.module.manage`). Quản trị nền tảng bấm **Bật** với mô-đun chưa cài thì cài luôn.
- **Chặn khi chưa bật:** Action trả `module-disabled` (403); bảng thuộc riêng mô-đun (`hasura_metadata.MODULE_TABLES`) không đọc, không ghi được qua GraphQL; menu ẩn, trang hiện thông báo "chưa bật".
- **Không tắt được** khi mô-đun đang bật khác dựa vào nó (`module-in-use`) hoặc còn việc dở (`module-busy`: đề nghị chờ duyệt/bị trả về, việc duyệt đang mở, đơn hàng nội bộ chờ xác nhận, quy trình tự động đang bật). **Không gỡ được** khi còn công ty bật.
- **Container:** `sleeper` hỏi `actions` `GET /modules/services` mỗi `SLEEPER_MODULES_EVERY` giây (mặc định 15), start container của mô-đun đã cài, stop container của mô-đun chưa cài; chỉ đụng tới dịch vụ trong `SLEEPER_MANAGED`. Container do compose vừa chạy chỉ bị dừng sau khi `bootstrap` và `seed` chạy xong (`SLEEPER_HOLD_UNTIL=bootstrap,seed`), vì `bootstrap` chờ Flowable, Meilisearch healthy kể cả khi chưa cài mô-đun nào, còn `seed` mới cài mô-đun của dữ liệu demo (dừng trước đó thì tắt nhầm `ai-worker`, Flowable...). Trong lúc hai job này còn chạy, dịch vụ ngủ cũng chưa bị cho ngủ. Dịch vụ ngủ (`trino-core`, `tika-core`, `ollama-core`, `ocr-core`) của mô-đun chưa cài không được đánh thức. Trạng thái container hiện trên trang Quản lý chức năng (với `platform_admin`).
- **Thêm mô-đun dựng sẵn mới:** khai `Module(...)` trong `modules.py` (mã, tên, phụ thuộc, container, Action, việc dở), thêm bảng riêng vào `MODULE_TABLES`, thêm container vào `SLEEPER_MANAGED`, mã vào migration nâng cấp và `DEMO_MODULES` của seed, gắn `module` cho mục menu (`nav.ts`) và `RequireModule` cho route (`App.tsx`). `test_mo_dun.py` báo lỗi nếu thiếu bước nào ở phía máy chủ.

## 23. Đăng ký sử dụng, khởi tạo công ty và chủ sở hữu (`setup.py`, `legal_sign.py`, migration 043, 050, ADR #57, #62)

- **API công khai** `/setup/*` (cổng API, không token, 30 yêu cầu/phút/IP), chỉ mở khi chưa có công ty: `GET /setup/status` (`open`, `window_open`, `signature_ready`, `allow_unverified`, danh mục `modules`); `POST /setup/applications` (dữ liệu trình hướng dẫn đăng ký, trả `application_id`, `token`, mã đơn, `tenant_code`); `GET /setup/applications/{id}/pdf?token=` (đơn PDF, dựng lần đầu khi tải); `POST /setup/applications/{id}/finish` (`token`, `signed_pdf_base64` hoặc bỏ trống để tạo công ty chưa xác thực).
- **Dữ liệu đăng ký (ADR #62)**: `owner` (`full_name`, `birth_year`, `title`, `phone`, `email`, `username`), `company` (`legal_name`, `tax_code` 10/13 chữ số hoặc 12 với hộ kinh doanh, `address`, `industry`, `code` tự sinh từ tên nếu bỏ trống), `size_band` (`1-10`, `11-50`, `51-200`, `200+`), `flow` (`quick`/`detailed`), `units` (luồng chi tiết: `key`, `name`, `type`), `members` (`full_name`, `username`, `email`, `phone`, `title`, `role` = `STAFF`/`MANAGER`/`ACCOUNTANT`/`ADMIN`, `unit`), `modules` (mã công cụ; tự thêm mô-đun phụ thuộc). Tối đa 50 phòng ban, 200 thành viên. Vai trò dựng sẵn → vai trò của `core.create_tenant`: Trưởng bộ phận là trưởng đơn vị (mỗi phòng ban một người) + Quản lý phạm vi `SUBTREE`; Kế toán → Kiểm soát tài chính `TENANT`; Quản trị viên đầu tiên ở đơn vị gốc ngồi ghế Quản trị hệ thống có sẵn. Mỗi phòng ban mới nhận vai trò Nhân viên phạm vi `UNIT`. Chủ sở hữu và quản trị viên bắt buộc OTP; thành viên khác chỉ đổi mật khẩu.
- **Cửa sổ đăng ký thay cho mã thiết lập**: `bootstrap` sinh mã thiết lập (24 giờ) mỗi lần khởi động khi hệ thống trống; trong khi còn mã hiệu lực thì đăng ký không cần nhập mã (`window_open`). Hết hạn thì `make setup-code` (`python -m app.setup_code`) mở lại 24 giờ. Lệnh cũ gửi kèm `setup_code` vẫn được kiểm như trước (SHA-256, khóa sau 10 lần sai).
- **Kiểm chữ ký** (pyHanko): tệp đã ký phải bắt đầu bằng đúng byte đơn đã sinh, chữ ký phủ trọn đơn, chuỗi tới chứng thư gốc ở `SIGNATURE_TRUST_DIR` (mặc định `infra/platform/trust` trong image), kiểm thu hồi khi `SIGNATURE_ONLINE=true`, mã số thuế trong chứng thư (`MST:…` ở UID, OU, CN hoặc serialNumber) trùng mã đã khai. Bằng chứng ở `core.legal_verification`.
- **Chủ sở hữu** (`core.tenant_owner`): trigger `core.guard_admin_change` chỉ cho chủ sở hữu thêm/bớt quyền `core.org.manage`, `core.permission.manage`, `core.module.manage` vào vai trò, cấp/thu hồi vai trò đó, bổ nhiệm vào vị trí có vai trò đó, ủy quyền quản trị. Công ty chưa có chủ sở hữu (dữ liệu cũ) không bị chặn.
- **Đăng nhập hai lớp**: tài khoản tạo khi khởi tạo bắt buộc `CONFIGURE_TOTP`; `flow-sync` đặt yêu cầu này cho người được trao quyền quản trị sau đó (`hr_account.enforce_admin_otp`).
- **Công cụ dùng được ngay**: `core.provision_tenant` (migration 060) cấp đủ quyền cho vai trò dựng sẵn (`NHAN_VIEN`, `QUAN_LY`, `KIEM_SOAT`, `QUAN_TRI_TO_CHUC` = mọi quyền) và quy tắc duyệt mặc định (`PURCHASE_REQUEST`, `ONBOARDING`, `KB_DOCUMENT`) khi đăng ký và khi tạo công ty thành viên; công ty thành viên bật sẵn mô-đun của công ty mẹ. Bootstrap đặt User Profile của realm `bms` giữ thuộc tính quản trị (`unmanagedAttributePolicy = ADMIN_EDIT`) để tài khoản đánh dấu theo đơn dùng lại được khi gửi lại.
- **Xác thực bổ sung**: Action `legal_status`, `legal_application` (đơn PDF base64), `legal_verify` (chỉ chủ sở hữu), `legal_update` (chủ sở hữu bổ sung mã số thuế, tên, địa chỉ còn thiếu sau khi đăng ký; doanh nghiệp đến 200 người được bỏ trống mã số thuế lúc đăng ký; mã số thuế và tên chỉ sửa khi chưa xác thực); trang **Quản trị → Thông tin công ty** (`/admin/company`).
- **Cảnh báo thiết bị mới** (migration 044): webhook `/auth/hasura` gọi `core.record_login` cho chủ sở hữu và quản trị viên; thiết bị (header `x-bamboo-device` giao diện gửi, hoặc mô tả trình duyệt + dải mạng) chưa gặp thì chủ sở hữu nhận thông báo `SECURITY`. Bảng `core.login_device` không mở qua GraphQL.
- **Khôi phục chủ sở hữu**: `POST /setup/recovery` (`tax_code`) → đơn khôi phục PDF (`GET /setup/applications/{id}/pdf`) → `POST /setup/recovery/{id}/finish` (đơn đã ký): mật khẩu tạm mới, gỡ OTP, bắt cài lại; trang `/khoi-phuc`.
- **Chủ sở hữu** gọi được `transfer_ownership(person_id)` và `create_subsidiary(code, name, …, owner)`.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `SIGNATURE_TRUST_DIR` | `/repo/infra/platform/trust` | Thư mục chứng thư gốc tin cậy |
| `SIGNATURE_ONLINE` | `true` | Kiểm thu hồi chứng thư qua OCSP/CRL (chặt) |
| `SETUP_ALLOW_UNVERIFIED` | `true` | Cho tạo công ty chưa xác thực, ký bổ sung sau |
| `SETUP_OPEN_SIGNUP` | `false` (compose: theo `SEED_DEMO`) | Mở trang đăng ký cả khi máy đã có công ty, không cần mã thiết lập; công ty đăng ký thêm không quản lý mô-đun trên máy |


## 24. Thời gian thực, phả hệ tự động, cổng dịch vụ API (migration 052, ADR #64)

**Tín hiệu thay đổi.** Trigger cấp câu lệnh trên các bảng nghiệp vụ ghi `live.event (tenant_id, topic)`. Trình duyệt:

```graphql
subscription Live($t: [String!]) {
  live_event(where: {topic: {_in: $t}}, order_by: {id: desc}, limit: 1) { id at }
}
```

Mã `id` đổi thì gộp 1,5 giây rồi tải lại (`apps/web/src/live/useLive.ts`). Hiện diện: `insert_live_presence_one` với
`on_conflict` mỗi 30 giây, đọc `live_v_online` bằng subscription (`apps/web/src/live/presence.ts`).

**Phả hệ tự động** (`lineage_sync.py`): `lineage_refresh` dựng lại nút/cạnh `auto` (khóa tư vấn chống chạy chồng), kiểm
replication slot (`pg_replication_slots`), đối chiếu số dòng PostgreSQL ↔ silver cho công ty trong phiên bằng một câu
`UNION ALL` trên Trino, ghi `meta.quality_check` (thay kết quả cũ cùng quy tắc) và `meta.pipeline_run` (giữ 200 lần gần nhất
mỗi công ty). Không có Lakehouse hoặc thiếu quyền `data.lakehouse.read` thì vẫn dựng đồ thị, trả `note` giải thích.
`lineage_graph` trả đồ thị `auto` cho API.

**Cổng dịch vụ API** (`api_gateway.py`):

| Endpoint | Phạm vi | Action |
|---|---|---|
| `GET /api/v1/metrics`, `POST /api/v1/metrics/query` | `metrics.read` | `semantic_catalog`, `semantic_query` |
| `GET /api/v1/datasets`, `GET /api/v1/datasets/{dataset}` | `datasets.read` | `lakehouse_datasets`, `lakehouse_preview` |
| `GET /api/v1/kpi/{kpi_key}` | `kpi.read` | `kpi_snapshots` |
| `GET /api/v1/ops/{tab}` | `ops.read` | `ops_dashboard` |
| `GET /api/v1/lineage` | `lineage.read` | `lineage_graph` |
| `GET /api/v1/search` | `search.read` | `search_documents` |
| `GET /api/v1/org-units` | `org.read` | truy vấn trực tiếp `core.org_unit` |

Kiểm khóa: `Authorization: Bearer bak_…` → SHA-256 → còn hạn, chưa thu hồi → IP (phần tử cuối của `X-Forwarded-For` do
APISIX thêm) thuộc dải cho phép → khóa có phạm vi của endpoint. Sai khóa/hết hạn/thu hồi: 401; thiếu phạm vi, IP không được
phép, người tạo thiếu quyền: 403; vượt 300 lượt/phút: 429 (APISIX). Mỗi lượt (kể cả lỗi của Action) cộng vào `api.usage`.
Quản trị: `api_key_create(name, scopes, expires_days, allowed_ips)` trả khóa một lần, `api_key_revoke(id)`, `api_catalog`.

## 25. Mô-đun ngoài (`ext.py`, migration 045, ADR #58)

Mô-đun do bên thứ ba viết, chạy thành dịch vụ HTTP riêng, nối vào Bamboo qua cổng API. Ví dụ đầy đủ: `examples/mo-dun-mau`
(mô-đun "Nhắc việc", chỉ dùng thư viện chuẩn Python).

**Manifest** (dán vào **Quản trị → Quản lý chức năng → Thêm mô-đun ngoài**, hoặc gọi Action `ext_register(manifest)`):

```json
{
  "code": "x_nhac_viec",
  "name": "Nhắc việc",
  "description": "Gửi lời nhắc tới đồng nghiệp",
  "vendor": "Công ty A",
  "version": "1.0.0",
  "base_url": "http://nhac-viec:8080",
  "entry_path": "/",
  "health_path": "/healthz",
  "depends": [],
  "scopes": ["people.read", "notify.send"],
  "menu": [{ "label": "Nhắc việc", "path": "/" }]
}
```

- `code`: `x_` + 2–30 ký tự chữ thường không dấu, số, gạch dưới. `base_url`: địa chỉ `actions` gọi được (tên container trong mạng Docker). `depends`: mô-đun dựng sẵn cần có (cài/bật kèm). `scopes`: `org.read` (đơn vị, vị trí), `people.read` (họ tên, mã nhân viên, vị trí), `notify.send` (gửi thông báo).
- Đăng ký trả **khóa mô-đun** `bmk_…` **một lần**; đặt vào dịch vụ mô-đun (biến `MODULE_KEY` hoặc tệp `MODULE_KEY_FILE` ở ví dụ). Mất khóa thì **Đổi khóa** (`ext_rotate_key`), khóa cũ hết hiệu lực ngay. Đăng ký lại cùng `code` là cập nhật phiên bản, giữ khóa; xin thêm phạm vi thì mô-đun bị tắt ở mọi công ty cho tới khi quản trị công ty bật (đồng ý) lại.
- Công ty bật/tắt như mô-đun dựng sẵn; menu của mô-đun hiện ở thanh bên, mở trang `/x/<mã>/<path>`. **Gỡ khỏi máy** xóa đăng ký.

**Giao diện:** web nhúng `<iframe sandbox>` trỏ tới `/ext/<mã>/s/<phiên>/<path>` (phiên 8 giờ do `ext_launch` cấp). `actions` chuyển yêu cầu tới `base_url` + `<path>` kèm:

| Đầu trang | Nội dung |
|---|---|
| `X-Bamboo-Tenant`, `X-Bamboo-Person` | id công ty, id người đang dùng |
| `X-Bamboo-Person-Name` | họ tên (mã hóa URL) |
| `X-Bamboo-Timestamp` | giây Unix |
| `X-Bamboo-Signature` | hex HMAC-SHA256(khóa mô-đun, `timestamp\nMETHOD\npath?query\ntenant\nperson`) |
| `X-Bamboo-Base` | tiền tố `/ext/<mã>/s/<phiên>` của trang |

Mô-đun **phải** kiểm chữ ký và độ lệch thời gian (ví dụ dùng 300 giây) rồi mới tin định danh; trang dùng đường dẫn tương đối. Chỉ các đầu trang `accept`, `accept-language`, `content-type`, `range`, `if-none-match`, `if-modified-since` đi từ trình duyệt sang mô-đun; cookie, `Authorization` bị bỏ. Phản hồi bị thêm `Content-Security-Policy: sandbox …` nên trang chạy ở origin `null`: không đọc được token, `localStorage` của Bamboo, không đặt được cookie. Thân yêu cầu tối đa 10 MB, 600 yêu cầu/phút/IP.

**API cho mô-đun** `/ext-api/v1` (300 yêu cầu/phút/IP, thân tối đa 1 MB), đầu trang `Authorization: Bearer <khóa mô-đun>` và `X-Bamboo-Tenant: <id công ty>` (lấy từ yêu cầu đã ký); công ty phải đang bật mô-đun:

| Gọi | Phạm vi | Trả |
|---|---|---|
| `GET /ext-api/v1/org-units` | `org.read` | `[{id, code, name, parent_id, type}]` đơn vị còn hiệu lực |
| `GET /ext-api/v1/people?q=` | `people.read` | `[{id, full_name, employee_code, position, org_unit_id}]`, tối đa 500 |
| `POST /ext-api/v1/notifications` `{person_id, title, body?}` | `notify.send` | `{ok: true}`; thông báo loại `EXTERNAL`, tiêu đề có tiền tố `[tên mô-đun]` |

Lỗi trả `{message, code}`: `unauthorized` (401, sai khóa), `module-disabled` (403), `forbidden` (403, thiếu phạm vi), `not-found` (404).

## 26. CDR, P.A.R.A, tác tử tự hành động, kịch bản (migration 056, 057, ADR #70–#73)

- **CDR** (`cdr.py`): `confirm_upload` → quét → `attachments.disarm` → bản dựng lại vào `bms-documents`. `scan_report.cdr` = `{engine, actions, skipped, original_sha256, original_size, size}`; PDF có `/ByteRange` (đã ký số) giữ nguyên.
- **P.A.R.A** (`core.para_of`, computed field `core_attachment.para`): `PROJECTS | AREAS | RESOURCES | ARCHIVES` theo trạng thái chứng từ; loại chứng từ mới `pm.project` nhận tệp.
- **Tác tử tự hành động** (`ai_agent_runner.py`): `wf.emit_event` sinh `core.ai_agent_run` (chống trùng theo `agent_id, dedup_key`) → `ai-worker` (`run_agent`, sau lượt hỏi) → kế hoạch JSON → kiểm → thực hiện. Action `ai_agent_automation(id, triggers, instructions, allowed_actions, autonomy, webhook_url)`, `ai_agent_trigger_options`; Hasura cho quản trị AI đọc `core_ai_agent_run`.
- **Kịch bản** (`script_sandbox.py`): hành động `script` của tác vụ dịch vụ (`bamboo:script`), external task `bamboo.script`; `process_script_test(model_id, script, variables)` chạy thử.

```bash
make test-actions T="tests/test_cdr.py tests/test_tac_tu_tu_hanh_dong.py tests/test_kich_ban.py"
make test-db T=para    # và T=tac_tu
```

## 27. Hội tụ IT/OT: MQTT, NGSI-LD (migration 058, ADR #74, #76)

| Service | Mô-đun | Việc |
|---|---|---|
| `mosquitto` | `data` | Image `bamboo-mosquitto` (`eclipse-mosquitto:2.0.21` kèm `mosquitto.conf`), plugin dynamic-security (`/mosquitto/data/dynamic-security.json` do `openbao-init` ghi lần đầu); cổng 1883 (127.0.0.1), 8883 TLS (`MQTT_BIND`), 8884 mTLS nội bộ |
| `iot-bridge` | `data` | `python -m app.iot_bridge`: nghe `bamboo/+/+/attrs`, gọi `iot.ingest`; mỗi phút `iot.mark_offline(15)` |

- Chủ đề: `bamboo/<mã công ty>/<mã thiết bị hoặc URN NGSI-LD>/attrs`; thân NGSI-LD dạng chuẩn hoặc gọn, tối đa 64 KB, 50 thuộc tính.
- Tài khoản thiết bị: `iot_mqtt_account_create(label)` → `{username, password, topic}` (mật khẩu hiện một lần), `iot_mqtt_account_revoke(username)`; vai trò `tenant-<mã>` chỉ `publishClientSend bamboo/<mã>/#`.
- REST: `GET /api/v1/ngsi-ld/v1/entities`, `GET …/{id}`, `POST …/{id}/attrs` (khóa API phạm vi `iot.read`, `iot.write`; người tạo khóa cần `iot.ingest`).
- Chứng chỉ mTLS: `openbao-init` (`SERVICE_CERT_OUTPUTS`) cấp `mosquitto`, `bamboo-bridge`, `bamboo-admin` từ vai trò PKI `service`, 90 ngày, tự cấp lại khi còn dưới 30 ngày; `MQTT_TLS_DIR=/run/bms/mqtt`.

Gửi thử từ máy chủ (tài khoản tạo ở Cổng dịch vụ API → Thiết bị MQTT):

```bash
mosquitto_pub -h localhost -p 1883 -u <tài khoản> -P <mật khẩu> -t bamboo/TDX/CR-01/attrs \
  -m '{"temperature": {"type": "Property", "value": 21.4}}'
```

## 28. Giám sát (ADR #75)

| Service | Profile | Việc |
|---|---|---|
| `otel-collector` | `observability` | OTLP gRPC 4317 / HTTP 4318 → Jaeger; số liệu của chính nó ở `:8888` |
| `jaeger` | `observability` | Lưu span trong bộ nhớ, giao diện `127.0.0.1:16686` |
| `prometheus` | `observability` | Thu `actions:8000/metrics`, `gateway:9091/apisix/prometheus/metrics`, `keycloak:9000/metrics`, `otel-collector:8888`; luật cảnh báo `infra/platform/observability/alerts.yml`; `127.0.0.1:9090` |
| `grafana` | `observability` | Nguồn Prometheus + Jaeger, bảng điều khiển **Bamboo tổng quan** (`infra/platform/observability/grafana/`); `127.0.0.1:3001`, tài khoản `admin` / `GRAFANA_ADMIN_PASSWORD` |

Số liệu của `actions`: `bamboo_http_requests_total{method,route,status}`, `bamboo_http_request_duration_seconds`, `bamboo_action_calls_total{action,outcome}`, `bamboo_action_duration_seconds`, `bamboo_message_queue{status}`, `bamboo_ai_questions{status}`, `bamboo_ai_agent_runs{status}`, `bamboo_attachments_pending`, `bamboo_ocr_pending`, `bamboo_iot_live_devices{state}`. Truy vết bật khi `OTEL_EXPORTER_OTLP_ENDPOINT` có giá trị (`make up` mức 16 đặt `http://otel-collector:4318`); phản hồi có `X-Trace-Id`, span có `bamboo.request_id`.
