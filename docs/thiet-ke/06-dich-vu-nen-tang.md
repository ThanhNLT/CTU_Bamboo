# Dịch vụ nền tảng: OpenBao, SeaweedFS, Flowable

> **Hiện trạng repo (04/10/2026):** cả ba mục đã có trong repo. Image dùng chung là `docker/python.Dockerfile`; các job khởi tạo nằm trong `services/actions/app/` (`openbao_init.py`, `bootstrap.py`).

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
| KV v2 | `secret/bms/seaweedfs` (`bms-app`), `secret/bms/seaweedfs-admin` (`bms-admin`) | Khóa S3 do OpenBao **sinh một lần**, là nguồn duy nhất; `openbao-init` ghi `s3.json` cho SeaweedFS từ đây |
| Transit | `transit/keys/pii` (AES-256-GCM) | Mã hóa dữ liệu nhạy cảm (CCCD, lương...); ứng dụng chỉ giữ bản mã `vault:v1:...` |
| AppRole | `auth/approle/role/actions`, `auth/approle/role/bootstrap` | Token 1 giờ, secret-id không hết hạn (dev) |

### Đặc quyền tối thiểu

| AppRole | Dùng bởi | Được đọc | Bị chặn (có kiểm thử) |
|---|---|---|---|
| `actions` | `actions`, `flow-sync` | `bms/postgres`, `bms/flowable`, `bms/seaweedfs`, `bms/actions`; mã hóa/giải mã bằng khóa `pii` | `bms/keycloak`, `bms/hasura`, `bms/seaweedfs-admin`, mọi thao tác ghi |
| `bootstrap` | job `bootstrap` | `bms/seaweedfs-admin` (tạo bucket), `bms/flowable`, `bms/hasura` | `bms/postgres`, khóa `pii` |

Mỗi dịch vụ có volume secret riêng chỉ mount vào đúng dịch vụ đó: `openbao-init` ghi file AppRole (role-id + secret-id, quyền 0400) vào `actions-secrets` và `bootstrap-secrets`, cấu hình S3 vào `seaweedfs-config`. Dịch vụ nào cũng thấy `/run/bms/approle.json` của riêng mình, không thấy secret của dịch vụ kia. Mô hình giống Vault Agent / External Secrets Operator sẽ dùng trên Kubernetes.

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
- Hai định danh:
  - `admin` (`secret/bms/seaweedfs-admin`): toàn quyền, chỉ job `bootstrap` dùng để tạo bucket.
  - `bms-app` (`secret/bms/seaweedfs`): chỉ `Read/Write/List/Tagging` trên `bms-quarantine` và `bms-documents`, không tạo/xóa bucket (có kiểm thử).
- **CORS**: `-s3.allowedOrigins=${WEB_ORIGIN}` (mặc định `http://localhost:5173`) để trình duyệt PUT tệp thẳng lên S3.
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
- Link có chữ ký dùng `S3_PUBLIC_ENDPOINT` (mặc định `http://localhost:8333`); khi có APISIX đổi thành route của gateway.
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
