# Nhật ký quyết định kiến trúc (ADR)

Mỗi quyết định ghi: ngày, quyết định, lý do, phương án đã loại. Thêm mục mới ở cuối theo [mẫu](#adr-mau).

## Danh sách

| # | Ngày | Quyết định |
|---|---|---|
| [1](#adr-1) | 01/10/2026 | Chỉ dùng phần mềm có giấy phép OSI |
| [2](#adr-2) | 01/10/2026 | OpenBao, Kafka (KRaft), SeaweedFS thay cho phần mềm BSL |
| [3](#adr-3) | 01/10/2026 | Hasura v2 làm lớp API; Flowable bọc bằng Hasura Actions |
| [4](#adr-4) | 01/10/2026 | Frontend Refine Core v5 + React + Ant Design |
| [5](#adr-5) | 01/10/2026 | Cơ cấu tổ chức là dữ liệu; quyền gắn với vị trí |
| [6](#adr-6) | 01/10/2026 | Keycloak chỉ xác thực, quyền chi tiết ở PostgreSQL |
| [7](#adr-7) | 01/10/2026 | Kịch bản tập đoàn đa ngành hư cấu |
| [8](#adr-8) | 01/10/2026 | Mô hình tenant lai |
| [9](#adr-9) | 01/10/2026 | Ứng dụng chính: Đề nghị mua sắm – thanh toán |
| [10](#adr-10) | 01/10/2026 | Quản lý phụ thuộc Python và image |
| [11](#adr-11) | 01/10/2026 | Hasura bản Community Edition (`-ce`) |
| [12](#adr-12) | 01/10/2026 | Mã nguồn đặt trong hệ thống file WSL2 |
| [13](#adr-13) | 01/10/2026 | Khởi động toàn bộ lõi bằng một lệnh |
| [14](#adr-14) | 01/10/2026 | Schema theo miền, khóa kép chặn tham chiếu chéo tenant |
| [15](#adr-15) | 01/10/2026 | Bệnh án ở database riêng `bms_hospital` |
| [16](#adr-16) | 01/10/2026 | Tự nạp dữ liệu mẫu bằng service `seed` |
| [17](#adr-17) | 01/10/2026 | Hạn mức duyệt theo loại đơn vị trong `wf.approval_rule` |
| [18](#adr-18) | 01/10/2026 | Nhật ký kiểm toán nối chuỗi hash |
| [19](#adr-19) | 01/10/2026 | Đổi tên kịch bản thành Tập đoàn X |
| [20](#adr-20) | 01/10/2026 | Hộp việc `wf.task` và thông báo bằng trigger |
| [21](#adr-21) | 01/10/2026 | Quyền hiệu lực tính sẵn trong materialized view |
| [22](#adr-22) | 01/10/2026 | CDC chỉ cho database `bms` |
| [23](#adr-23) | 01/10/2026 | Id cố định bằng `uuid5`, khớp Keycloak và CSDL |
| [24](#adr-24) | 01/10/2026 | Sinh metadata Hasura bằng script |
| [25](#adr-25) | 01/10/2026 | OpenBao lưu bền, AppRole đặc quyền tối thiểu |
| [26](#adr-26) | 01/10/2026 | Tệp đính kèm qua bucket cách ly và link có chữ ký |
| [27](#adr-27) | 01/10/2026 | BPMN duyệt tuần tự theo danh sách người duyệt |

(adr-1)=
## ADR #1: Chỉ dùng phần mềm có giấy phép OSI

- **Ngày:** 01/10/2026
- **Quyết định:** Chỉ dùng phần mềm có giấy phép OSI
- **Lý do:** Thư nộp bài yêu cầu cam kết tuân thủ phần mềm tự do nguồn mở
- **Đã loại:** Vault, Redpanda, n8n, MongoDB, Directus, MinIO bản build sẵn

(adr-2)=
## ADR #2: OpenBao, Kafka (KRaft), SeaweedFS thay cho phần mềm BSL

- **Ngày:** 01/10/2026
- **Quyết định:** OpenBao thay Vault; Kafka (KRaft) thay Redpanda; SeaweedFS làm kho S3
- **Lý do:** Thay thế tương đương có giấy phép OSI
- **Đã loại:** Vault (BSL), Redpanda (BSL), MinIO

(adr-3)=
## ADR #3: Hasura v2 làm lớp API; Flowable bọc bằng Hasura Actions

- **Ngày:** 01/10/2026
- **Quyết định:** Hasura v2 làm lớp API tự sinh + phân quyền theo dòng; Flowable được bọc bằng Hasura Actions
- **Lý do:** UI chỉ cần một endpoint GraphQL qua APISIX
- **Đã loại:** Data provider riêng cho Flowable

(adr-4)=
## ADR #4: Frontend Refine Core v5 + React + Ant Design

- **Ngày:** 01/10/2026
- **Quyết định:** Frontend dùng Refine Core v5 + React + Ant Design thay Nuxt/Vue
- **Lý do:** Có sẵn provider cho Hasura, auth, access control, i18n; hợp với ứng dụng nặng CRUD; giấy phép MIT
- **Đã loại:** Nuxt 3/Vue 3

(adr-5)=
## ADR #5: Cơ cấu tổ chức là dữ liệu; quyền gắn với vị trí

- **Ngày:** 01/10/2026
- **Quyết định:** Cơ cấu tổ chức, vai trò, người duyệt là dữ liệu; quyền gắn với vị trí + phạm vi cây tổ chức
- **Lý do:** Nền tảng trung lập ngành, doanh nghiệp toàn quyền cấu hình
- **Đã loại:** Viết cứng phòng ban / role trong Keycloak

(adr-6)=
## ADR #6: Keycloak chỉ xác thực, quyền chi tiết ở PostgreSQL

- **Ngày:** 01/10/2026
- **Quyết định:** Keycloak chỉ xác thực; quyền chi tiết trong PostgreSQL
- **Lý do:** Keycloak không phù hợp cây đơn vị có thời hạn và quan hệ ma trận; tránh JWT phình to
- **Đã loại:** Đồng bộ toàn bộ cơ cấu vào Keycloak groups

(adr-7)=
## ADR #7: Kịch bản tập đoàn đa ngành hư cấu

- **Ngày:** 01/10/2026
- **Quyết định:** Kịch bản Tập đoàn Sao Việt (hư cấu): mẹ + điện thoại, chip, gia dụng, bệnh viện
- **Lý do:** Phủ đủ 4 nhóm Tầng 3, mỗi công ty có điểm nhấn kỹ thuật
- **Đã loại:** Doanh nghiệp đơn ngành; dùng tên Samsung
- **Ghi chú:** Tên "Tập đoàn Sao Việt" đã được thay bằng "Tập đoàn X" ở [ADR #19](#adr-19); phần còn lại vẫn hiệu lực.

(adr-8)=
## ADR #8: Mô hình tenant lai

- **Ngày:** 01/10/2026
- **Quyết định:** Mô hình tenant lai: tập đoàn + 3 công ty công nghiệp chung 1 tenant; bệnh viện tenant riêng
- **Lý do:** Liên thông nội bộ chặt; dữ liệu sức khỏe cần cách ly cứng
- **Đã loại:** Mỗi công ty một tenant; tất cả chung một tenant

(adr-9)=
## ADR #9: Ứng dụng chính: Đề nghị mua sắm – thanh toán

- **Ngày:** 01/10/2026
- **Quyết định:** Ứng dụng chính: Đề nghị mua sắm – thanh toán (Procure-to-Pay), duyệt hạn mức bằng DMN
- **Lý do:** Dùng chung mọi ngành, phủ đủ H-P-D-I, tận dụng lược đồ tổ chức
- **Đã loại:** "Tiếp nhận và phê duyệt hồ sơ" chung chung

(adr-10)=
## ADR #10: Quản lý phụ thuộc Python và image

- **Ngày:** 01/10/2026
- **Quyết định:** Python: pip + `constraints.txt` chung ghim phiên bản, mỗi dịch vụ một `requirements.txt` chỉ ghi tên gói, một `docker/python.Dockerfile` dùng chung (build arg `APP_DIR`); OCR ghim riêng. Image bên thứ ba ghim trong `platform/versions.env`; compose chia profile
- **Lý do:** Một nơi quản lý phiên bản nhưng mỗi image chỉ chứa thư viện cần dùng: tránh xung đột (paddle vs numpy mới), image nhỏ, ít lỗ hổng khi quét Trivy
- **Đã loại:** Một `requirements.txt` cho toàn dự án; uv/Poetry; image Bitnami

(adr-11)=
## ADR #11: Hasura bản Community Edition (`-ce`)

- **Ngày:** 01/10/2026
- **Quyết định:** Hasura dùng tag `-ce` (Community Edition)
- **Lý do:** Image không có `-ce` là bản EE chứa thành phần không phải nguồn mở
- **Đã loại:** Image Hasura mặc định

(adr-12)=
## ADR #12: Mã nguồn đặt trong hệ thống file WSL2

- **Ngày:** 01/10/2026
- **Quyết định:** Mã nguồn đặt trong hệ thống file WSL2 (`~/projects/BMS`), không đặt trên ổ Windows
- **Lý do:** Bind mount Docker, file watcher (Vite HMR), `pnpm install` nhanh hơn nhiều; giữ LF và quyền thực thi
- **Đã loại:** Ổ `C:`/`D:` truy cập qua `/mnt/c`

(adr-13)=
## ADR #13: Khởi động toàn bộ lõi bằng một lệnh

- **Ngày:** 01/10/2026
- **Quyết định:** Chạy toàn bộ lõi bằng một lệnh `docker compose up -d`: `compose.yaml` ở gốc include các file trong `platform/` kèm `versions.env`; lõi không gắn profile; biến có giá trị mặc định giả; migration chạy tự động bằng service `migrate` có bảng theo dõi
- **Lý do:** Yêu cầu đề thi chạy bằng một lệnh; giám khảo clone về chạy được ngay, không cần tạo `.env` hay chạy migration thủ công
- **Đã loại:** Bắt buộc `make`; script cài đặt riêng; bắt buộc `--profile core`; chạy migration qua `docker-entrypoint-initdb.d` (chỉ chạy một lần khi volume trống)

(adr-14)=
## ADR #14: Schema theo miền, khóa kép chặn tham chiếu chéo tenant

- **Ngày:** 01/10/2026
- **Quyết định:** CSDL chia schema theo miền (`core`, `mdm`, `wf`, `proc`, `ic`, `mfg`, `hr`, `audit`); mọi khóa ngoại nghiệp vụ là khóa kép `(tenant_id, id)` để chặn tham chiếu chéo tenant ngay trong CSDL
- **Lý do:** Cách ly tenant không phụ thuộc vào việc ứng dụng hay Hasura cấu hình đúng; schema theo miền dễ phân quyền và track trên Hasura
- **Đã loại:** Một schema `public`; chỉ kiểm tra tenant ở tầng ứng dụng; Row Level Security (Hasura v2 không truyền session vào truy vấn đọc)

(adr-15)=
## ADR #15: Bệnh án ở database riêng `bms_hospital`

- **Ngày:** 01/10/2026
- **Quyết định:** Bệnh án ở database riêng `bms_hospital`; ra ngoài chỉ qua view khử định danh gắn role riêng; doanh nghiệp chỉ nhận kết luận đủ/không đủ
- **Lý do:** Dữ liệu sức khỏe là dữ liệu cá nhân nhạy cảm, cần cách ly cứng và chứng minh được trước giám khảo
- **Đã loại:** Schema riêng trong cùng database `bms`

(adr-16)=
## ADR #16: Tự nạp dữ liệu mẫu bằng service `seed`

- **Ngày:** 01/10/2026
- **Quyết định:** Dữ liệu mẫu nạp tự động bằng service `seed` sau `migrate`, bỏ qua nếu đã có; tắt bằng `SEED_DEMO=false`
- **Lý do:** Chạy một lệnh là có ngay dữ liệu demo
- **Đã loại:** Nạp tay bằng `make seed`; SQL seed tĩnh

(adr-17)=
## ADR #17: Hạn mức duyệt theo loại đơn vị trong `wf.approval_rule`

- **Ngày:** 01/10/2026
- **Quyết định:** Hạn mức duyệt lưu ở `wf.approval_rule`, mỗi bước chỉ định **loại đơn vị** của cấp duyệt; người duyệt tìm theo cây (`core.resolve_approver`), người lập không tự duyệt
- **Lý do:** Cây mỗi công ty sâu khác nhau nên "lên N cấp" cho kết quả sai; doanh nghiệp tự cấu hình mà không sửa BPMN
- **Đã loại:** Đếm số cấp (`find_unit_head`); viết cứng hạn mức trong DMN

(adr-18)=
## ADR #18: Nhật ký kiểm toán nối chuỗi hash

- **Ngày:** 01/10/2026
- **Quyết định:** Nhật ký kiểm toán bằng trigger, nối chuỗi hash SHA-256, chỉ cho ghi thêm; đồng bộ immudb qua cột `sealed_at`
- **Lý do:** Chứng minh nguyên lý quản trị dữ liệu (nguồn gốc, toàn vẹn) ngay cả khi immudb chưa chạy
- **Đã loại:** Chỉ ghi log ở tầng ứng dụng; dùng pgAudit (không có chuỗi hash)

(adr-19)=
## ADR #19: Đổi tên kịch bản thành Tập đoàn X

- **Ngày:** 01/10/2026
- **Quyết định:** Đổi tên kịch bản từ "Tập đoàn Sao Việt" thành "Tập đoàn X" (Bệnh viện X, Công ty Chip X...)
- **Lý do:** Trung tính hoàn toàn, tránh trùng tên doanh nghiệp có thật
- **Đã loại:** Giữ tên Sao Việt ([ADR #7](#adr-7))

(adr-20)=
## ADR #20: Hộp việc `wf.task` và thông báo bằng trigger

- **Ngày:** 01/10/2026
- **Quyết định:** Hộp việc dùng bảng `wf.task` sao chép task Flowable; thông báo sinh bằng trigger CSDL và phát `pg_notify`
- **Lý do:** Giao diện chỉ cần Hasura (query + subscription realtime), không gọi thẳng Flowable (Quy tắc 1); thông báo không phụ thuộc ứng dụng nào ghi dữ liệu
- **Đã loại:** Refine gọi REST Flowable lấy task; mỗi ứng dụng tự gửi thông báo

(adr-21)=
## ADR #21: Quyền hiệu lực tính sẵn trong materialized view

- **Ngày:** 01/10/2026
- **Quyết định:** Quyền hiệu lực tính sẵn trong materialized view lưu kèm thời hạn; làm mới một lần khi commit thay đổi phân quyền; trong giao dịch đang sửa thì đọc trực tiếp
- **Lý do:** Đo được nhanh 7,7 lần; lưu thời hạn nên không cần làm mới định kỳ; luôn đúng kể cả trong giao dịch chưa commit
- **Đã loại:** Làm mới định kỳ bằng cron (sai lệch giữa hai lần chạy); bảng duy trì từng dòng bằng trigger (phức tạp, dễ sai)

(adr-22)=
## ADR #22: CDC chỉ cho database `bms`

- **Ngày:** 01/10/2026
- **Quyết định:** CDC (Debezium) chỉ cho database `bms`; `bms_hospital` không có publication
- **Lý do:** Bệnh án không được đi vào Kafka/Lakehouse dạng thô; công ty mẹ chỉ nhận số liệu tổng hợp qua view khử định danh
- **Đã loại:** CDC cả hai database rồi che PII ở Kafka

(adr-23)=
## ADR #23: Id cố định bằng `uuid5`, khớp Keycloak và CSDL

- **Ngày:** 01/10/2026
- **Quyết định:** Id tài khoản demo và tenant cố định bằng `uuid5`; Keycloak user id = token `sub` = `core.person.id`; realm sinh bằng script từ danh sách dùng chung, mật khẩu lấy từ biến môi trường lúc import
- **Lý do:** CSDL và Keycloak khớp nhau mà không cần gọi API lẫn nhau; Hasura so `x-hasura-user-id` trực tiếp với các cột person; không commit mật khẩu
- **Đã loại:** Seed gọi Admin API Keycloak tạo user; ánh xạ qua `idp_subject` ở mọi permission

(adr-24)=
## ADR #24: Sinh metadata Hasura bằng script

- **Ngày:** 01/10/2026
- **Quyết định:** Metadata Hasura sinh bằng script: quan hệ suy ra từ khóa ngoại, phân quyền khai báo trong script; quyền chi tiết là hàm SQL dùng làm computed field `can_read`; tự nạp bằng image `cli-migrations-v3`
- **Lý do:** Logic quyền nằm ở CSDL nên kiểm thử được bằng SQL và không lệch với Flowable/dịch vụ khác; 238 quan hệ không phải viết tay; một lệnh `docker compose up` là có API
- **Đã loại:** Viết tay metadata qua Console; lặp lại logic quyền bằng điều kiện JSON trong Hasura

(adr-25)=
## ADR #25: OpenBao lưu bền, AppRole đặc quyền tối thiểu

- **Ngày:** 01/10/2026
- **Quyết định:** OpenBao chạy lưu bền (raft một node) với job `openbao-init` tự khởi tạo/unseal mỗi lần `up`; dịch vụ đọc secret bằng AppRole + policy đặc quyền tối thiểu; khóa S3 do OpenBao sinh và là nguồn duy nhất
- **Lý do:** Gần cách triển khai thật, demo được Zero-Trust (mỗi dịch vụ chỉ đọc đúng secret của mình); khởi động lại không mất secret
- **Đã loại:** Chế độ dev (mất dữ liệu khi restart); để secret trong `.env` cho mọi dịch vụ

(adr-26)=
## ADR #26: Tệp đính kèm qua bucket cách ly và link có chữ ký

- **Ngày:** 01/10/2026
- **Quyết định:** Tệp đính kèm: trình duyệt tải thẳng lên S3 bằng link có chữ ký vào bucket cách ly `bms-quarantine`; Action `confirm_upload` quét rồi chuyển sang `bms-documents`; chỉ cấp link tải về cho tệp sạch và người xem được chứng từ gốc
- **Lý do:** Tệp lớn không đi qua Hasura/dịch vụ; tệp chưa quét không bao giờ tải về được; quyền tải tệp dùng chung logic `can_read` với dữ liệu
- **Đã loại:** Tải tệp qua Hasura Action (base64); bucket công khai; quét bất đồng bộ không chặn tải về

(adr-27)=
## ADR #27: BPMN duyệt tuần tự theo danh sách người duyệt

- **Ngày:** 01/10/2026
- **Quyết định:** BPMN duyệt tuần tự theo danh sách người duyệt truyền vào khi gửi (tính từ `wf.resolve_pr_approvers`); dịch vụ `actions` điều phối Flowable và phản chiếu trạng thái vào CSDL (`wf.task`, lịch sử, trạng thái đề nghị) trong cùng giao dịch; dữ liệu mẫu đang chờ được gắn quy trình thật
- **Lý do:** BPMN không phụ thuộc cây tổ chức của doanh nghiệp nào; một nơi duy nhất cập nhật trạng thái nên hộp việc không lệch (rủi ro "đồng bộ task Flowable phức tạp" trong timeline); demo duyệt tiếp được ngay
- **Đã loại:** Hạn mức trong bảng DMN của Flowable (trùng nguồn với `wf.approval_rule`); BPMN gọi HTTP lấy người duyệt; đồng bộ task bằng job định kỳ

(adr-mau)=
## Mẫu cho quyết định mới

Sao chép khối dưới đây xuống cuối file, đổi số thứ tự `NN`:

```markdown
(adr-NN)=
## ADR #NN: Tiêu đề ngắn

- **Ngày:** dd/mm/yyyy
- **Quyết định:** ...
- **Lý do:** ...
- **Đã loại:** ...
```
