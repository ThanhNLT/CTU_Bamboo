# Dịch vụ nền tảng: OpenBao, SeaweedFS, Flowable, cổng API, tìm kiếm, phiếu PDF, CDC, Lakehouse, Trino, AI cục bộ

> **Hiện trạng repo (05/10/2026):** cả chín mục đã có trong repo. Image dùng chung là `docker/python.Dockerfile`; các job khởi tạo nằm trong `services/actions/app/` (`openbao_init.py`, `bootstrap.py`).

Cấu hình các dịch vụ lõi Tầng 1 ngoài CSDL. Tất cả tự khởi tạo khi `docker compose up -d`
bằng các job trong `services/bootstrap/` (image dùng chung `docker/python.Dockerfile`).

## 1. OpenBao – két sắt secret (ADR #25)

### Chế độ chạy

- **Lưu bền**: integrated storage (raft) một node ở `/openbao/file` trên volume `openbao-data` (`platform/openbao/config.hcl`). Entrypoint của image tự thêm `-config=/openbao/config` và chown `/openbao/file`.
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

Dịch vụ Python đọc secret lúc khởi động (`config.load()`): có `BAO_ADDR` và `BAO_APPROLE_FILE` thì đăng nhập AppRole và thay giá trị env bằng secret đọc được (`SECRET_FIELDS` trong `config.py`); đường dẫn bị policy chặn thì giữ giá trị env. Chạy ngoài compose (kiểm thử native) không đặt hai biến này thì dùng env.

Dịch vụ hạ tầng (PostgreSQL, Keycloak, Hasura, Flowable) vẫn nhận mật khẩu qua biến môi trường vì Docker Compose không có cơ chế inject secret từ OpenBao; trên k3s dùng External Secrets Operator đọc từ OpenBao.

### Lệnh

```bash
make test-actions T=tests/test_openbao.py   # khởi tạo lặp lại, đặc quyền tối thiểu, transit, cấu hình đọc từ két
make bao-token                              # in root token (dev) để vào UI http://localhost:8200
```

Dùng trong code Python (`services/actions/app/openbao.py`):

```python
from app.openbao import Bao
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
- **Truy cập từ trình duyệt** qua cổng API ([ADR #34](#adr-34)): route `/bms-quarantine/*` chỉ cho `PUT`, `/bms-documents/*` chỉ cho `GET`/`HEAD`; SeaweedFS không mở cổng ra ngoài. CORS (`-s3.allowedOrigins=${CORS_ORIGINS}`) chỉ cần cho `npm run dev` ở nguồn khác.
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
      │            sha256; quét ClamAV (INSTREAM) ── nhiễm ─► INFECTED, xóa tệp
      │            sạch ─► chuyển sang bms-documents, CLEAN
get_download_url ─► link GET có chữ ký 5 phút, tên tệp tiếng Việt (RFC 5987)
```

| Action | Kiểm tra |
|---|---|
| `get_upload_url(entity_type, entity_id, file_name, content_type, size_bytes)` | Chứng từ cùng tenant và người gọi xem được (`wf.entity_can_read`); loại tệp: PDF, PNG, JPEG, DOCX, XLSX, TXT; tối đa 25 MB; tên tệp bỏ phần đường dẫn |
| `confirm_upload(attachment_id)` | Chỉ người tải lên; chưa PUT thì báo `not-uploaded` và giữ PENDING; ClamAV không trả lời thì báo `scanner-unavailable`, tệp ở lại bucket cách ly để thử lại |
| `get_download_url(attachment_id)` | Cùng tenant, xem được chứng từ gốc, trạng thái `CLEAN` |
| `delete_attachment(attachment_id)` | Chỉ người tải lên; đề nghị đã có kết quả (duyệt, từ chối, hủy) thì giữ tệp làm chứng cứ (CSDL chặn) |

- Loại chứng từ đính kèm được: `proc.purchase_request` (`ENTITY_TYPES` trong `storage.py`); thêm loại mới thì bổ sung cả `collab.entity_tenant` và `wf.entity_can_read`.
- Giao diện xem danh sách tệp qua quan hệ `attachments` của đề nghị hoặc bảng `core_attachment` (không có cột `storage_key`; tệp đã xóa không hiện).
- **ClamAV tùy chọn**: chưa đặt `CLAMAV_HOST` thì `scan_result = "bỏ qua: ClamAV chưa được cấu hình"` và tệp vẫn được nhận sau khi qua kiểm tra kích thước và chữ ký đầu tệp. Bật: `docker compose --profile scan up -d` với `CLAMAV_HOST=clamav`.
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

File `platform/flowable/purchase_request.bpmn20.xml` (có sơ đồ DI cho bpmn-js):

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

Giao diện chỉ gọi Hasura (Quy tắc 1). Flowable REST chỉ dịch vụ `actions` gọi được.

### Lệnh

```bash
make test-actions     # pytest: Actions, quyền xem qua Hasura, đồng bộ Flowable (Hasura và Flowable thật)
make test-all         # test-db + test-actions
```

Flowable REST (dev): http://localhost:8082/flowable-rest, tài khoản `FLOWABLE_ADMIN` / `FLOWABLE_ADMIN_PASSWORD` (mặc định `rest-admin` / `test`).

## 4. Cổng API – Apache APISIX (ADR #34)

Điểm vào duy nhất từ trình duyệt (`127.0.0.1:8000`). Chế độ standalone: `platform/apisix/config.yaml` (chế độ chạy, WAF) và `platform/apisix/apisix.yaml` (route), đóng gói vào image `bamboo-gateway`; không có Admin API, đổi route bằng commit rồi build lại image.

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
| `debezium` | `quay.io/debezium/server:3.7.0.Final` | Connector PostgreSQL (`pgoutput`), cấu hình bằng biến `DEBEZIUM_*` trong `docker-compose.yml`. Vị trí đọc ở volume `debezium-data`; xóa volume thì chụp ảnh lại toàn bộ |

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
- Thêm dịch vụ đọc / ghi Kafka: thêm tài khoản và ACL trong `platform/kafka/start.sh`, mật khẩu trong `.env`.
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
platform/trino/silver.sql  (sinh bằng app.lakehouse_silver từ kiểu cột PostgreSQL, commit vào Git)
   └─ trino-init (mỗi lần khởi động): CREATE TABLE IF NOT EXISTS bronze.* ; CREATE OR REPLACE VIEW silver.*
Trino (catalog lakehouse = JDBC catalog Iceberg của lakehouse-sink) ─► lakehouse.silver.<schema>_<bảng>
```

| Dịch vụ | Image | Ghi chú |
|---|---|---|
| `trino` | `bamboo-trino` (`trinodb/trino:483` + cấu hình, `rules.json`) | Một node, heap 1 GB, HTTPS `trino:8443` (máy dev: `https://127.0.0.1:8085`, giao diện web). Catalog `/etc/trino/bms-catalog/lakehouse.properties` và bí mật `/etc/trino/secrets` (chứng chỉ TLS, `password.db`, khóa ký nội bộ) do `openbao-init` ghi |
| `trino-init` | cùng image | Đăng nhập `bms-admin` qua HTTPS, chạy `platform/trino/silver.sql` rồi thoát |

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
docker compose exec trino bash -c 'TRINO_PASSWORD=$(cat /etc/trino/secrets/admin.password) trino \
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
   │                                                                          │ 3. Lọc kb_can_read_published theo người hỏi, giữ 6 đoạn
   │                                                                          │ 4. Không còn đoạn → refused / scope (không gọi mô hình)
   │                                                                          │ 5. /v1/chat/completions stream, ghi answer ~1 giây / lần
   └──────────────────────────────────────────────────────────────────────────┘ 6. citations theo [n], che PII, done
```

- Prompt hệ thống tiếng Việt: chỉ trả lời từ `<tai_lieu>`, trích `[n]`, nội dung tài liệu là dữ liệu chứ không phải chỉ dẫn. Mỗi đoạn bọc `<doan n tai_lieu tieu_de muc>`, ký tự `<` `>` trong nội dung được thoát nên không đóng thẻ được.
- `temperature 0.2`, `max_tokens 1024`, `reasoning_effort: "none"` (bỏ khi tác tử bật `think`); phần `<think>…</think>` lọt vào nội dung bị bỏ.
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

Chạy CPU mất vài chục giây mỗi lượt; một lượt một lúc nên người sau phải chờ. Hàng đợi chung cho mọi tenant (một mô hình), nên vị trí chờ người hỏi thấy gồm cả lượt của tenant khác (chỉ là con số, không lộ nội dung). Chỉ chạy một `ai-worker`. Mô hình 4B có thể trả lời thiếu ý hoặc trích sai số đoạn; smoke test `scripts/ai_smoke.sh` dùng để kiểm bằng mắt. Chỉ lấy tài liệu thư viện đang hiệu lực, không lấy tệp chứng từ hay Ổ đĩa.

```bash
make up                                           # AI chạy cùng hệ thống (CPU)
make up-gpu                                       # kèm GPU NVIDIA (docs/van-hanh/trien-khai.md)
make test-actions T=tests/test_tro_ly_ai.py       # chia đoạn, guardrail, worker với Ollama giả
scripts/ai_smoke.sh                               # hỏi thật 5 câu mẫu khi đã tải xong mô hình
```
