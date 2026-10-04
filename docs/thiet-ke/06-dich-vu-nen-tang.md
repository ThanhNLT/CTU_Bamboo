# Dịch vụ nền tảng: OpenBao, SeaweedFS, Flowable

Cấu hình các dịch vụ lõi Tầng 1 ngoài CSDL. Tất cả tự khởi tạo khi `docker compose up -d`
bằng các job trong `services/bootstrap/` (image dùng chung `docker/python.Dockerfile`).

## 1. OpenBao – két sắt secret (ADR #25)

### Chế độ chạy

- **Lưu bền**: integrated storage (raft) một node trên volume `openbao-data` (`platform/openbao/config.hcl`). OpenBao 2.x không còn backend `file`.
- **Job `openbao-init`** (`services/bootstrap/openbao_init.py`) chạy mỗi lần `docker compose up`:
  1. Lần đầu: khởi tạo với 1 khóa unseal (chỉ cho dev), lưu khóa và root token vào volume `openbao-keys`, không in ra log.
  2. Mỗi lần: unseal nếu đang sealed, đợi raft bầu leader, rồi cấu hình lại một cách idempotent (chạy nhiều lần không tạo trùng).
- Khởi động lại container `openbao` thì nó ở trạng thái sealed cho tới khi `openbao-init` chạy lại (`docker compose up -d`). Môi trường thật dùng auto-unseal (KMS/HSM) thay cho file khóa.

### Nội dung

| Thành phần | Đường dẫn | Ghi chú |
|---|---|---|
| KV v2 | `secret/bms/postgres`, `bms/hasura`, `bms/keycloak`, `bms/flowable`, `bms/actions` | Đồng bộ từ `.env` mỗi lần chạy (môi trường dev khai báo ở `.env`) |
| KV v2 | `secret/bms/seaweedfs` | Khóa S3 (admin và ứng dụng) do OpenBao **tự sinh một lần**, là nguồn duy nhất |
| Transit | `transit/keys/pii` (AES-256-GCM) | Mã hóa dữ liệu nhạy cảm (CCCD, lương...); ứng dụng chỉ giữ bản mã `vault:v1:...` |
| AppRole | `auth/approle/role/actions` | Dịch vụ `actions` đăng nhập bằng role-id + secret-id |

### Đặc quyền tối thiểu

Policy `actions` chỉ cho đọc `bms/postgres`, `bms/flowable`, `bms/seaweedfs`, `bms/actions` và mã hóa/giải mã bằng khóa `pii`. Không đọc được secret quản trị Keycloak, Hasura (có kiểm thử).

Mỗi dịch vụ có volume secret riêng, chỉ mount vào đúng dịch vụ đó: `openbao-init` ghi AppRole vào `actions-secrets` (`/run/bms/approle.json` trong container `actions`, uid 10001, quyền 0400) và cấu hình S3 vào `seaweedfs-secrets`. Dịch vụ này không nhìn thấy secret của dịch vụ kia. Đây là mô hình giống Vault Agent / External Secrets Operator sẽ dùng trên Kubernetes.

Dịch vụ hạ tầng (PostgreSQL, Keycloak, Hasura) vẫn nhận mật khẩu qua biến môi trường vì Docker Compose không có cơ chế inject secret từ OpenBao; trên k3s dùng External Secrets Operator đọc từ OpenBao.

### Lệnh

```bash
make test-secrets     # 6 kiểm tra: AppRole, đặc quyền tối thiểu, transit
make bao-token        # in root token (dev) để vào UI http://localhost:8200
```

Dùng trong code Python (`services/actions/openbao.py`):

```python
from openbao import bao
bao().secret("bms/flowable")        # {"username": ..., "password": ...}
bao().encrypt("079123456789")       # "vault:v1:..."
```

## 2. SeaweedFS – lưu trữ đối tượng S3 (ADR #26)

### Cấu hình

- **Không còn truy cập ẩn danh.** `openbao-init` sinh `s3.json` từ khóa trong `secret/bms/seaweedfs` và ghi vào volume `seaweedfs-secrets`; SeaweedFS chạy với `-s3.config=/etc/bms/s3.json`.
- Hai định danh:
  - `admin`: toàn quyền, chỉ job khởi tạo dùng.
  - `bms-app`: chỉ `Read/Write/List/Tagging` trên `bms-quarantine` và `bms-documents`, không tạo/xóa bucket (có kiểm thử).
- **CORS**: `-s3.allowedOrigins=${WEB_ORIGIN}` (mặc định `http://localhost:5173`, ứng dụng Refine) để trình duyệt tải tệp thẳng lên S3.
- **Job `storage-init`** (`services/bootstrap/storage_init.py`) tạo bucket nếu chưa có.

| Bucket | Dùng cho |
|---|---|
| `bms-quarantine` | Tệp vừa tải lên, chờ quét virus. Không bao giờ cấp link tải về từ bucket này |
| `bms-documents` | Tệp đã quét sạch |

### Luồng đính kèm (Hasura Actions → `services/actions/storage.py`)

```text
get_upload_url ──► trình duyệt PUT tệp lên bms-quarantine (link có chữ ký, 15 phút)
      │
confirm_upload ──► kiểm tra kích thước, tính sha256, quét ClamAV, chuyển sang bms-documents
      │
get_download_url ─► link GET có chữ ký (chỉ tệp CLEAN, chỉ người xem được chứng từ gốc)
```

| Action | Kiểm tra |
|---|---|
| `get_upload_url(entity_type, entity_id, file_name, content_type, size_bytes)` | Chứng từ cùng tenant và người gọi xem được (`collab.entity_can_read`); loại tệp trong danh sách cho phép (PDF, ảnh, DOCX, XLSX, TXT); tối đa 25 MB. Tạo `core.attachment` trạng thái `PENDING` |
| `confirm_upload(attachment_id)` | Chỉ người tải lên; tệp INFECTED bị xóa ngay |
| `get_download_url(attachment_id)` | Cùng tenant, xem được chứng từ gốc, trạng thái `CLEAN` |
| `delete_attachment(attachment_id)` | Chỉ người tải lên |

- Loại chứng từ đính kèm được: `purchase_request`, `quotation`, `invoice`, `ic_order`, `incident` (`ENTITY_TABLES` trong `storage.py`).
- **ClamAV chưa chạy**: khi chưa đặt `CLAMAV_HOST`, `confirm_upload` ghi `extracted.scan = "bỏ qua: ClamAV chưa được cấu hình"` và vẫn chuyển tệp sang `bms-documents`. Khi thêm ClamAV (gateway, ngày 10/10) chỉ cần đặt `CLAMAV_HOST`, mã quét INSTREAM đã có sẵn.
- Link có chữ ký dùng `S3_PUBLIC_ENDPOINT` (mặc định `http://localhost:8333`); khi có APISIX đổi thành route của gateway.
- Hasura gọi action kèm header `X-Actions-Secret` (= `secret/bms/actions`); dịch vụ `actions` từ chối mọi lời gọi không có secret này.
- Dịch vụ `actions` ghi CSDL bằng thông tin từ OpenBao và đặt `hasura.user` theo session nên `created_by`, nhật ký kiểm toán ghi đúng người dùng.

### Lệnh

```bash
make test-storage     # 15 kiểm thử: tải lên, quét, tải về, phân quyền, chặn loại tệp, xóa
make test-secrets     # gồm cả kiểm tra khóa S3 của ứng dụng không tạo được bucket
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

Kết quả `PurchaseRequestActionResult { request_id, status, purchase_request }`. Lỗi nghiệp vụ trả về `400 {message, extensions.code}`; Hasura chuyển nguyên thông báo cho giao diện. Gọi Action phải kèm header `x-actions-secret` (Hasura gửi từ biến `ACTIONS_SECRET`).

Giao diện chỉ gọi Hasura (Quy tắc 1). Flowable REST chỉ dịch vụ `actions` gọi được.

### Lệnh

```bash
make test-actions     # pytest: Actions, quyền xem qua Hasura, đồng bộ Flowable (Hasura và Flowable thật)
make test-all         # test-db + test-actions
```

Flowable REST (dev): http://localhost:8082/flowable-rest, tài khoản `FLOWABLE_ADMIN` / `FLOWABLE_ADMIN_PASSWORD` (mặc định `rest-admin` / `test`).
