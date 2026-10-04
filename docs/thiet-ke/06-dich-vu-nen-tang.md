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

## 3. Flowable – quy trình duyệt đề nghị mua sắm (ADR #27)

### Quy trình `purchase_request`

File `platform/flowable/purchase_request.bpmn20.xml` (có sơ đồ DI cho bpmn-js):

```text
Gửi đề nghị ─► [Duyệt đề nghị mua sắm] ─► ◇ Quyết định?
                     ▲                      ├─ duyệt, còn cấp trên ─► (stepIndex + 1) ─┘
                     │                      ├─ duyệt, cấp cuối ────► ● Đã duyệt
                     │                      ├─ từ chối ────────────► ● Từ chối
                     │                      └─ trả về ─────────────► ● Trả về người lập
```

- **Không viết cứng người duyệt.** Khi gửi, dịch vụ `actions` tính chuỗi người duyệt bằng `wf.resolve_pr_approvers` (cây tổ chức + bảng hạn mức `wf.approval_rule`, [ADR #17](#adr-17)) và truyền vào quy trình: `approvers` (danh sách person.id), `approverCount`, `stepIndex`. User task giao cho `${approvers.split(',')[stepIndex]}`. **Cần đổi theo [ADR #28](#adr-28):** truyền danh sách vị trí, tìm người giữ vị trí khi đến từng bước.
- Hạn mức nằm ở `wf.approval_rule` (doanh nghiệp tự cấu hình, có kiểm thử SQL), không nằm trong bảng DMN của Flowable. Nếu cần trình diễn DMN, có thể sinh bảng DMN từ `wf.approval_rule` (chỉ để hiển thị).
- **Job `flowable-init`** (image `actions`, `services/actions/flowable_init.py`) chạy mỗi lần `up`:
  1. Deploy BPMN khi nội dung đổi (tên deployment kèm sha256, không deploy trùng).
  2. Gắn quy trình Flowable thật cho các đề nghị đang chờ duyệt trong dữ liệu mẫu, đúng bước đang chờ, nên demo duyệt tiếp được ngay (ví dụ đề nghị AOI chờ Tổng giám đốc).

### Hasura Actions (`services/actions/procurement.py`)

| Action | Làm gì |
|---|---|
| `start_process(request_id)` | Chỉ người lập; đề nghị DRAFT/RETURNED và có dòng hàng; tìm đủ người duyệt. Chuyển SUBMITTED → IN_APPROVAL, ghi lịch sử SUBMIT, khởi tạo quy trình, sao task vào `wf.task` (trigger gửi thông báo cho người duyệt và người nhận ủy quyền) |
| `complete_task(task_id, decision, comment)` | `task_id` là `wf.task.id` (lấy từ `wf_v_inbox`). Chỉ người có việc trong hộp việc (kể cả qua ủy quyền); từ chối/trả về bắt buộc lý do. Hoàn thành task Flowable, ghi lịch sử (người duyệt, duyệt thay ai), rồi: còn cấp trên → task mới cho cấp tiếp theo; hết → APPROVED / REJECTED / RETURNED (trigger báo người lập) |

Flowable giữ trạng thái quy trình; CSDL là bản phản chiếu cho giao diện (trạng thái đề nghị, hộp việc, lịch sử, thông báo). Nếu ghi CSDL lỗi sau khi đã khởi tạo quy trình, `actions` xóa quy trình vừa tạo để không để lại quy trình mồ côi.

Giao diện chỉ gọi Hasura (Quy tắc 1). Flowable REST chỉ dịch vụ `actions` gọi được, bằng tài khoản quản trị lấy từ OpenBao.

### Lệnh

```bash
make test-flow        # 25 kiểm thử: 1 cấp, trả về/gửi lại/từ chối, 2 cấp, ủy quyền, dữ liệu mẫu
make test-all         # chạy mọi bộ kiểm thử
```

Flowable REST (dev): http://localhost:8082/flowable-rest, tài khoản `FLOWABLE_ADMIN` / `FLOWABLE_ADMIN_PASSWORD` trong `.env`.
