# Dịch vụ nền tảng: OpenBao, SeaweedFS, Flowable, cổng API, tìm kiếm, phiếu PDF

> **Hiện trạng repo (05/10/2026):** cả sáu mục đã có trong repo. Image dùng chung là `docker/python.Dockerfile`; các job khởi tạo nằm trong `services/actions/app/` (`openbao_init.py`, `bootstrap.py`).

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
| Transit | `transit/keys/pii` (AES-256-GCM) | Mã hóa dữ liệu nhạy cảm (CCCD, lương...); ứng dụng chỉ giữ bản mã `vault:v1:...` |
| AppRole | `auth/approle/role/actions`, `auth/approle/role/bootstrap`, `auth/approle/role/search` | Token 1 giờ, secret-id không hết hạn (dev) |

### Đặc quyền tối thiểu

| AppRole | Dùng bởi | Được đọc | Bị chặn (có kiểm thử) |
|---|---|---|---|
| `actions` | `actions`, `flow-sync` | `bms/postgres`, `bms/flowable`, `bms/seaweedfs`, `bms/actions`, `bms/meilisearch-search`; mã hóa/giải mã bằng khóa `pii` | `bms/keycloak`, `bms/hasura`, `bms/seaweedfs-admin`, `bms/meilisearch-admin`, `bms/meilisearch-indexer`, mọi thao tác ghi |
| `bootstrap` | job `bootstrap` | `bms/seaweedfs-admin` (tạo bucket), `bms/flowable`, `bms/hasura`, `bms/meilisearch-admin` (tạo index, khóa API) | `bms/postgres`, khóa `pii` |
| `search` | `search-sync` | `bms/postgres`, `bms/seaweedfs-search`, `bms/meilisearch-indexer` | `bms/seaweedfs`, `bms/meilisearch-admin`, `bms/meilisearch-search`, `bms/actions`, khóa `pii` |

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
- Volume nhỏ (`-master.volumeSizeLimitMB=256 -volume.max=32`): mỗi bucket là một collection cần volume riêng; mặc định 30 GB/volume làm máy dev hết chỗ cấp volume.
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
