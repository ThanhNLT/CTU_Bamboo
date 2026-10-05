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
| [28](#adr-28) | 02/10/2026 | Chuỗi duyệt chốt theo vị trí, tìm người khi đến bước |
| [29](#adr-29) | 02/10/2026 | Bổ nhiệm hợp đồng; quyền theo ngày, không theo khung giờ |
| [30](#adr-30) | 02/10/2026 | Một tài khoản cho nhiều tenant cùng công ty mẹ |
| [31](#adr-31) | 02/10/2026 | CSDL là nguồn sự thật của luồng duyệt; Flowable phản chiếu |
| [32](#adr-32) | 02/10/2026 | Hasura xác thực bằng webhook: Keycloak token + tenant đã chọn |
| [33](#adr-33) | 04/10/2026 | Chuỗi hash nhật ký kiểm toán theo từng tenant |
| [34](#adr-34) | 04/10/2026 | Cổng API APISIX standalone là điểm vào duy nhất |
| [35](#adr-35) | 04/10/2026 | Mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu |
| [36](#adr-36) | 05/10/2026 | Tìm kiếm toàn văn: Meilisearch + Tika, quyền xem kiểm tra lại trong CSDL |
| [37](#adr-37) | 05/10/2026 | Phiếu PDF: mẫu HTML (Jinja2) in bằng Gotenberg Chromium, lưu theo mã nội dung |
| [38](#adr-38) | 05/10/2026 | CDC bằng Debezium Server → Kafka KRaft, publication theo schema, nhịp tim giữ slot |

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
- **Ghi chú (02/10/2026):** Gán vai trò thẳng cho người vẫn được phép, nhưng là ngoại lệ bắt buộc có thời hạn, chỉ dành cho người không nằm trong cây tổ chức (kiểm toán viên bên ngoài, quản trị nền tảng, người vận hành tác tử AI). Chỉ kiểm tra lúc gán: người được bổ nhiệm vào cây tổ chức sau đó vẫn giữ vai trò đến hết thời hạn.

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
- **Ghi chú (04/10/2026):** Hiện thực là một tệp `docker-compose.yml` ở gốc (chưa tách `compose.yaml` + `platform/*` + `versions.env`), đã gồm cả giao diện (`web`, cổng 5173). Mọi dịch vụ chạy lâu có healthcheck và `restart: unless-stopped`; job khởi tạo chạy theo thứ tự `migrate` → `seed`, `openbao-init` → `seaweedfs` → `bootstrap`. Thể lệ OLP 2026 không ghi trực tiếp yêu cầu "một lệnh"; tiêu chí gần nhất là "Building From Source" (cài đặt, cấu hình được trước khi dịch, không sửa tay tệp). CI (`.github/workflows/ci.yml`) chạy đúng `docker compose up -d` trên máy sạch rồi chạy mọi bộ kiểm thử. Người không có mã nguồn chạy bằng image dựng sẵn: `docker compose -f oci://ghcr.io/thanhnlt/bamboo:<phiên bản> up -d -y` (`.github/workflows/images.yml` build image đa kiến trúc, sinh `compose.release.yml` từ `docker-compose.yml` bằng `scripts/release/compose_release.py`, phát hành dạng OCI artifact và chạy thử lệnh này trên máy sạch); vì vậy mọi tệp cấu hình runtime đóng gói vào image, không bind mount.

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
- **Ghi chú:** "`sub` = `core.person.id`" đã được thay ở [ADR #30](#adr-30) cho người làm ở nhiều tenant; token không còn mang claim Hasura ([ADR #32](#adr-32)), `person.id` tra theo `idp_subject`. Id cố định bằng `uuid5` và realm sinh từ danh sách dùng chung vẫn hiệu lực.

(adr-24)=
## ADR #24: Sinh metadata Hasura bằng script

- **Ngày:** 01/10/2026
- **Quyết định:** Metadata Hasura sinh bằng script: quan hệ suy ra từ khóa ngoại, phân quyền khai báo trong script; quyền chi tiết là hàm SQL dùng làm computed field `can_read`; tự nạp bằng image `cli-migrations-v3`
- **Lý do:** Logic quyền nằm ở CSDL nên kiểm thử được bằng SQL và không lệch với Flowable/dịch vụ khác; 238 quan hệ không phải viết tay; một lệnh `docker compose up` là có API
- **Đã loại:** Viết tay metadata qua Console; lặp lại logic quyền bằng điều kiện JSON trong Hasura
- **Ghi chú (02/10/2026):** Script sinh metadata là `services/actions/app/hasura_metadata.py`, ghi `platform/hasura/metadata.json`; job `bootstrap` nạp bằng API `replace_metadata` thay cho image `cli-migrations-v3` (cùng một đường nạp cho chạy thật và kiểm thử, không cần CLI Hasura).

(adr-25)=
## ADR #25: OpenBao lưu bền, AppRole đặc quyền tối thiểu

- **Ngày:** 01/10/2026
- **Quyết định:** OpenBao chạy lưu bền (raft một node) với job `openbao-init` tự khởi tạo/unseal mỗi lần `up`; dịch vụ đọc secret bằng AppRole + policy đặc quyền tối thiểu; khóa S3 do OpenBao sinh và là nguồn duy nhất
- **Lý do:** Gần cách triển khai thật, demo được Zero-Trust (mỗi dịch vụ chỉ đọc đúng secret của mình); khởi động lại không mất secret
- **Đã loại:** Chế độ dev (mất dữ liệu khi restart); để secret trong `.env` cho mọi dịch vụ
- **Ghi chú (04/10/2026):** Hiện thực ở `services/actions/app/openbao_init.py` (job) và `openbao.py` (client). Hai AppRole: `actions` (dịch vụ actions, flow-sync) và `bootstrap` (tạo bucket bằng khóa S3 admin, nạp metadata Hasura); dịch vụ Python thay giá trị env bằng secret đọc được lúc khởi động.

(adr-26)=
## ADR #26: Tệp đính kèm qua bucket cách ly và link có chữ ký

- **Ngày:** 01/10/2026
- **Quyết định:** Tệp đính kèm: trình duyệt tải thẳng lên S3 bằng link có chữ ký vào bucket cách ly `bms-quarantine`; Action `confirm_upload` quét rồi chuyển sang `bms-documents`; chỉ cấp link tải về cho tệp sạch và người xem được chứng từ gốc
- **Lý do:** Tệp lớn không đi qua Hasura/dịch vụ; tệp chưa quét không bao giờ tải về được; quyền tải tệp dùng chung logic `can_read` với dữ liệu
- **Đã loại:** Tải tệp qua Hasura Action (base64); bucket công khai; quét bất đồng bộ không chặn tải về
- **Ghi chú (04/10/2026):** Hiện thực ở `services/actions/app/attachments.py`. `confirm_upload` kiểm tra thêm kích thước thực so với khai báo và chữ ký đầu tệp so với loại tệp (sai thì `REJECTED`, xóa tệp) trước khi quét; ClamAV là tùy chọn (profile `scan`). Khóa S3 lấy từ OpenBao ([ADR #25](#adr-25)).

(adr-27)=
## ADR #27: BPMN duyệt tuần tự theo danh sách người duyệt

- **Ngày:** 01/10/2026
- **Quyết định:** BPMN duyệt tuần tự theo danh sách người duyệt truyền vào khi gửi (tính từ `wf.resolve_pr_approvers`); dịch vụ `actions` điều phối Flowable và phản chiếu trạng thái vào CSDL (`wf.task`, lịch sử, trạng thái đề nghị) trong cùng giao dịch; dữ liệu mẫu đang chờ được gắn quy trình thật
- **Lý do:** BPMN không phụ thuộc cây tổ chức của doanh nghiệp nào; một nơi duy nhất cập nhật trạng thái nên hộp việc không lệch (rủi ro "đồng bộ task Flowable phức tạp" trong timeline); demo duyệt tiếp được ngay
- **Đã loại:** Hạn mức trong bảng DMN của Flowable (trùng nguồn với `wf.approval_rule`); BPMN gọi HTTP lấy người duyệt; đồng bộ task bằng job định kỳ
- **Ghi chú:** "Danh sách người duyệt" đã được thay bằng danh sách vị trí ở [ADR #28](#adr-28); "phản chiếu trạng thái vào CSDL" đổi chiều ở [ADR #31](#adr-31): CSDL là nguồn sự thật, Flowable phản chiếu.

(adr-28)=
## ADR #28: Chuỗi duyệt chốt theo vị trí, tìm người khi đến bước

- **Ngày:** 02/10/2026
- **Quyết định:** Khi gửi duyệt, chốt chuỗi duyệt là danh sách **vị trí** theo `wf.approval_rule` hiệu lực lúc đó và truyền vào BPMN; khi đến lượt mỗi bước, dịch vụ `actions` mới tìm người đang giữ vị trí (người giữ chính, rồi quyền trưởng; không có ai hoặc trùng người lập thì đẩy lên trưởng đơn vị cấp trên gần nhất). Các bước liền nhau rơi vào cùng một người thì gộp thành một lần duyệt; khi bổ nhiệm vào vị trí thay đổi, việc đang chờ của vị trí tự chuyển sang người giữ mới (việc đã đẩy lên cấp trên thì giữ nguyên, không kéo về); người giữ chính hoặc quyền trưởng nhận việc, người được ủy quyền thấy cùng việc trong hộp việc của mình, ai duyệt trước thì việc đóng và lịch sử ghi "duyệt thay"; lịch sử duyệt ghi rõ việc đẩy lên, gộp và chuyển. Hết cấp trên mà vẫn không có người hợp lệ thì việc nằm chờ tại vị trí (chưa có người nhận) và tự giao khi có người được bổ nhiệm. Việc chuyển chạy lúc commit (trigger deferred) nên kết thúc người cũ và bổ nhiệm người mới trong cùng giao dịch không qua trạng thái ghế trống; bổ nhiệm hết hạn theo lịch được xử lý bằng `wf.refresh_all()` chạy định kỳ, và người nhận việc phải còn giữ vị trí lúc duyệt
- **Lý do:** Quyền gắn với vị trí ([ADR #5](#adr-5)): bổ nhiệm mới giữa chừng thì người mới nhận việc; quy tắc hạn mức chốt lúc gửi nên kết quả không đổi khi cấu hình bị sửa giữa chừng
- **Đã loại:** Chốt danh sách người lúc gửi ([ADR #27](#adr-27) bản đầu: người cũ vẫn nhận việc sau khi bàn giao); tính lại toàn bộ chuỗi ở mỗi bước (đổi quy tắc hạn mức làm đổi số bước của đề nghị đang chạy); chặn hoặc treo việc khi vị trí trống; bắt cùng một người duyệt hai lần; giữ việc ở người cũ chờ chuyển tay; báo lỗi khi không còn ai để duyệt (chặn luôn thao tác nhân sự); chuyển việc ngay từng câu lệnh; kéo việc đã đẩy lên về vị trí vừa có người (phải tách bước đã gộp); gắn việc vào vị trí không lưu người nhận

(adr-29)=
## ADR #29: Bổ nhiệm hợp đồng; quyền theo ngày, không theo khung giờ

- **Ngày:** 02/10/2026
- **Quyết định:** Thêm loại bổ nhiệm thứ tư **hợp đồng** cho người được công ty khác thuê ngoài giờ: bắt buộc có ngày kết thúc, gắn số hợp đồng/đối tác, không tính định biên, không được giữ vị trí trưởng nên không bao giờ vào chuỗi duyệt. Quyền hiệu lực theo ngày; khung giờ làm việc là dữ liệu chấm công, không phải điều kiện phân quyền. Vị trí theo hợp đồng báo cáo cho người quản lý hợp đồng bên thuê. Hợp đồng kết thúc thì chứng từ người đó lập chưa duyệt xong (nháp, chờ duyệt, bị trả về) tự hủy, ghi lý do; chứng từ đã duyệt là cam kết của công ty nên chạy tiếp. Đây là ngoại lệ: các bổ nhiệm khác kết thúc (luân chuyển, nghỉ việc) thì chứng từ chưa duyệt xong chuyển cho người giữ vị trí kế tiếp, vì đó là nhu cầu của đơn vị
- **Lý do:** Phân biệt quan hệ thuê với kiêm nhiệm; người thuê ngoài không tự quyết chi tiền cho bên thuê; quyền theo khung giờ phải làm mới bảng quyền tính sẵn theo lịch ([ADR #21](#adr-21) đã loại) và khóa người dùng giữa chừng
- **Đã loại:** Dùng kiêm nhiệm kèm ghi chú; gán vai trò thẳng cho người (chỉ cho người không có ghế, [ADR #5](#adr-5)); quyền chỉ hiệu lực trong khung giờ hợp đồng; chuyển chứng từ dang dở cho vị trí người đó từng giữ; giữ quyền cho người lập sau khi hết hạn

(adr-30)=
## ADR #30: Một tài khoản cho nhiều tenant cùng công ty mẹ

- **Ngày:** 02/10/2026
- **Quyết định:** Một cá nhân làm ở nhiều tenant có quan hệ qua `core.tenant_relation` (cùng công ty mẹ) dùng **một tài khoản Keycloak**, mỗi tenant một bản ghi `core.person` riêng ánh xạ qua `idp_subject`; khi đăng nhập chọn tenant, token mang đúng một `x-hasura-tenant-id` và `x-hasura-user-id` là `person.id` trong tenant đó. Tenant không liên quan thì tài khoản riêng
- **Lý do:** Người dùng trong tập đoàn không phải giữ nhiều tài khoản; dữ liệu vẫn cách ly theo tenant vì mỗi phiên chỉ một tenant và `person` vẫn có `tenant_id` (giữ khóa kép [ADR #14](#adr-14))
- **Đã loại:** Hai tài khoản riêng kể cả trong cùng tập đoàn; `person` toàn nền tảng không có `tenant_id` (phá khóa kép ADR #14); token mang nhiều tenant cùng lúc

(adr-31)=
## ADR #31: CSDL là nguồn sự thật của luồng duyệt; Flowable phản chiếu

- **Ngày:** 02/10/2026
- **Quyết định:** Trạng thái luồng duyệt (chuỗi duyệt, việc duyệt, người nhận, kết quả) chỉ được quyết định trong CSDL (`wf.approval_step`, `wf.task`, ADR #28). Mỗi lần gửi duyệt có một tiến trình Flowable lặp theo danh sách vị trí, mỗi bước một user task; dịch vụ `flow-sync` đối chiếu CSDL → Flowable (khởi tạo, đổi người nhận, hoàn thành, hủy) theo bảng `wf.flow_sync` đánh dấu bằng trigger và `pg_notify`. Mọi thao tác chuyển trạng thái đi qua Hasura Action gọi hàm CSDL; nháp ghi thẳng qua Hasura
- **Lý do:** Logic đẩy lên, gộp bước, chuyển việc lúc commit, hủy khi hết hợp đồng đã nằm và được kiểm thử trong CSDL; hai bộ máy trạng thái dễ lệch nhau. Đối chiếu theo trạng thái (không theo sự kiện) nên mất tín hiệu hay Flowable tạm ngừng cũng tự khớp lại
- **Đã loại:** Flowable là nguồn sự thật, BPMN gọi `actions` lấy người duyệt từng bước (hai bộ máy trạng thái); bỏ Flowable khỏi luồng duyệt; gọi Flowable đồng bộ trong Action (không áp dụng được cho chuyển việc do trigger lúc commit)

(adr-32)=
## ADR #32: Hasura xác thực bằng webhook: Keycloak token + tenant đã chọn

- **Ngày:** 02/10/2026
- **Quyết định:** Keycloak chỉ xác thực, access token chỉ cần `sub`. Hasura chạy chế độ auth webhook (`/auth/hasura` trong dịch vụ `actions`): kiểm tra token bằng JWKS của Keycloak, đọc tenant đã chọn ở header `x-bamboo-tenant`, tra `core.account_tenants(sub)` để lấy `person.id` trong tenant đó. Chưa chọn tenant thì role `account` (chỉ gọi query `my_tenants`); đã chọn thì role `user`; realm role `platform_admin` của Keycloak cho phép xin role `platform_admin`. Tài khoản `platform_admin` bắt buộc OTP
- **Lý do:** Một tài khoản ứng với nhiều `person.id` ([ADR #30](#adr-30)) mà Keycloak không biết tenant người dùng chọn; quyền nằm ở PostgreSQL ([ADR #6](#adr-6)) nên không đồng bộ thông tin tổ chức sang Keycloak; không tự ký token. Hasura CE gọi webhook ở mọi request (không cache; `Cache-Control` chỉ đặt hạn kết nối websocket theo hạn token), nên webhook giữ JWKS và kết quả tra tenant trong bộ nhớ (60 giây)
- **Đã loại:** Claim Hasura trong token Keycloak (Keycloak Organizations + mapper, phải lưu `person.id` từng tenant trong Keycloak); dịch vụ riêng tự ký JWT sau khi chọn tenant (tự quản lý khóa, refresh); realm role `hospital_staff` (trùng cách ly theo tenant)

(adr-33)=
## ADR #33: Chuỗi hash nhật ký kiểm toán theo từng tenant

- **Ngày:** 04/10/2026
- **Quyết định:** Hiện thực [ADR #18](#adr-18) bằng một chuỗi hash **mỗi tenant**: `audit.log` có số thứ tự `seq` liên tục trong tenant, `hash = sha256(prev_hash || nội dung jsonb)`; đầu chuỗi giữ ở `audit.chain_head` và khóa theo giao dịch nên các giao dịch ghi cùng tenant xếp hàng ở bước ghi nhật ký. `audit.verify_chain(tenant)` phát hiện dòng bị sửa, thiếu dòng, lệch đầu chuỗi; Action `verify_audit_chain` cho người có quyền `audit.read` (quyền cấp tenant, không xét phạm vi đơn vị). Người thực hiện lấy từ `hasura.user`
- **Lý do:** Kiểm toán viên của tenant đối soát được chuỗi của mình mà không cần đọc dữ liệu tenant khác; seq liên tục phát hiện được cả việc xóa; khóa đầu chuỗi đảm bảo chuỗi không rẽ nhánh khi ghi đồng thời
- **Đã loại:** Một chuỗi toàn nền tảng (khóa chung mọi tenant, đối soát phải đọc chéo tenant); băm theo lô định kỳ (khoảng hở chưa niêm phong); ghi nhật ký bất đồng bộ qua `pg_notify` (mất sự kiện thì mất nhật ký)

(adr-34)=
## ADR #34: Cổng API APISIX standalone là điểm vào duy nhất

- **Ngày:** 04/10/2026
- **Quyết định:** Mọi truy cập từ trình duyệt đi qua một cổng Apache APISIX (cổng 8000), chạy chế độ standalone: route khai báo trong `platform/apisix/apisix.yaml` (Git là nguồn duy nhất, không có Admin API lúc chạy). Route: `/graphql` → Hasura `/v1/graphql`; `/realms`, `/resources` → Keycloak; `/bms-quarantine/*` (chỉ `PUT`) và `/bms-documents/*` (chỉ `GET`/`HEAD`) → SeaweedFS; `/` → web; đường dẫn khác trả 404. Token Keycloak được kiểm **tại biên** bằng plugin `forward-auth` gọi `actions` `/auth/gateway` (cùng bộ kiểm token với Hasura webhook); websocket subscription đi route riêng không kiểm header vì trình duyệt không gửi được `Authorization` khi nâng cấp kết nối, Hasura kiểm token trong `connection_init`. WAF Coraza (OWASP CRS, paranoia 1, chặn theo ngưỡng điểm) dạng Proxy-Wasm trên giao diện, Keycloak và GraphQL; GraphQL bỏ nhóm luật SQLi. Realm `master` bị chặn ở cổng; trang quản trị Keycloak dùng cổng riêng `127.0.0.1:8080` (`KC_HOSTNAME_ADMIN`). Giới hạn tần suất theo IP: GraphQL 600/phút, đăng nhập 60/phút. Web và SeaweedFS không mở cổng ra ngoài; các cổng quản trị còn lại chỉ nghe `127.0.0.1`
- **Lý do:** Đề bắt buộc dịch vụ cổng API và nguyên lý Zero-Trust; một origin bỏ được CORS giữa giao diện và API; request không có token dừng ở biên, không tới Hasura; route theo tên bucket (không dùng tiền tố `/files`) vì chữ ký link S3 tính trên đường dẫn và host gốc, đổi đường dẫn ở cổng làm sai chữ ký; `forward-auth` dùng lại mã kiểm token đã có kiểm thử thay vì cấu hình lại issuer/audience trong plugin `openid-connect`; standalone không cần etcd và hợp với GitOps
- **Đã loại:** Plugin `openid-connect` của APISIX (trùng logic kiểm token, khó khớp `aud` của Keycloak); APISIX có etcd và Admin API (thêm một dịch vụ, cấu hình lúc chạy lệch Git); tiền tố `/files` cho S3 (sai chữ ký); WAF trên route tải tệp (nội dung nhị phân tới 25 MB, đã kiểm tra và quét virus ở `confirm_upload`); mỗi dịch vụ một tên miền công khai

(adr-35)=
## ADR #35: Mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu

- **Ngày:** 04/10/2026
- **Quyết định:** Superuser `bms` (chủ mọi schema nghiệp vụ) chỉ dùng cho job `migrate` và `seed`. Job `migrate` tạo và cập nhật mật khẩu cho các role sau mỗi lần chạy (`db/roles`), không role nào là superuser, tạo được CSDL/role, replication hay bỏ qua RLS. `bamboo_hasura` và `bamboo_actions` thuộc nhóm `bamboo_app`: được đọc/ghi bảng, dùng sequence và gọi hàm trong các schema nghiệp vụ của CSDL `bms`, chỉ được **đọc** schema `audit`, không đọc `public.schema_migration`, không TRUNCATE, không đổi cấu trúc. `bamboo_keycloak`, `bamboo_flowable` và `bamboo_hasura` lần lượt là chủ CSDL `keycloak`, `flowable` và `hasura_meta` (dịch vụ tự migrate schema của mình), và chỉ chủ sở hữu kết nối được vào CSDL đó. Trigger `audit.log_change` chạy `SECURITY DEFINER` với `search_path` cố định, nên vẫn ghi được chuỗi hash khi người gọi không có quyền ghi vào `audit`. Quyền được cấp lại sau mỗi lần migrate (`grants.sql`), nên bảng và schema mới tự có quyền. Máy nâng cấp từ bản cũ được chuyển chủ sở hữu tự động (`reown.sql`). Mật khẩu: `HASURA_DB_PASSWORD`, `ACTIONS_DB_PASSWORD` (OpenBao `bms/postgres` cho actions), `KEYCLOAK_DB_PASSWORD`, `FLOWABLE_DB_PASSWORD`
- **Lý do:** Superuser đọc được tệp và chạy lệnh trên máy chủ CSDL (`COPY ... TO PROGRAM`), tắt được trigger chỉ-ghi-thêm của nhật ký kiểm toán và đọc mọi CSDL. Lộ chuỗi kết nối của một dịch vụ (Hasura, actions là hai dịch vụ nhận request từ ngoài) thì phạm vi thiệt hại chỉ còn là dữ liệu dịch vụ đó được phép ghi. Toàn vẹn nhật ký kiểm toán (ADR #18, #33) không còn phụ thuộc vào việc ứng dụng tự giác. Kiểm thử tích hợp chạy actions và Hasura bằng role này, nên quyền còn thiếu lộ ra trong CI thay vì trên production
- **Đã loại:** Role riêng theo từng bảng cho Hasura và actions (Hasura đã phân quyền theo hàng; hai bộ quyền gần như trùng nhau mà tốn công giữ đồng bộ); `REASSIGN OWNED` khi nâng cấp (`bms` là superuser khởi tạo, sở hữu cả catalog hệ thống); OpenBao database secrets engine cấp mật khẩu động (Keycloak, Flowable, Hasura chỉ đọc mật khẩu từ biến môi trường lúc khởi động; để sau khi có External Secrets); Row Level Security trong PostgreSQL (cách ly tenant đã nằm trong khóa kép và quyền của Hasura, ADR #14, #32)

(adr-36)=
## ADR #36: Tìm kiếm toàn văn: Meilisearch + Tika, quyền xem kiểm tra lại trong CSDL

- **Ngày:** 05/10/2026
- **Quyết định:** Chỉ mục toàn văn bằng Meilisearch bản Community (image `getmeili/meilisearch`, MIT; không dùng bản `-enterprise` có phần BUSL-1.1), trích chữ tệp đính kèm bằng Apache Tika server. Trigger trên đề nghị, dòng hàng, tệp và tên (nhà cung cấp, người lập, đơn vị) đánh dấu `search.pending` và phát `pg_notify('search_sync')`; dịch vụ `search-sync` đọc trạng thái hiện tại rồi ghi hoặc xóa tài liệu trong index `documents`, lỗi thì thử lại với thời gian chờ tăng dần (tối đa 5 phút); index trống thì đánh dấu lại toàn bộ. Chỉ tệp `CLEAN` mới vào chỉ mục, đọc từ bucket tài liệu bằng định danh S3 `bms-search` chỉ đọc. Action `search_documents` lọc theo tenant của phiên trong Meilisearch, rồi kiểm tra **từng kết quả** bằng `wf.entity_can_read` (và tệp còn, sạch) trong CSDL trước khi trả về; đoạn trích được escape HTML, chữ khớp bọc `<mark>`. Khóa chủ Meilisearch do OpenBao sinh một lần (`bms/meilisearch-admin`, chỉ `bootstrap` đọc), `openbao-init` ghi vào tệp cấu hình của Meilisearch; hai khóa API (chỉ tìm cho `actions`, ghi chỉ mục cho `search-sync`) suy ra từ khóa chủ và uid cố định bằng HMAC-SHA256 như Meilisearch tự tính, nên OpenBao giữ được giá trị trước khi `bootstrap` tạo khóa. AppRole mới `search` cho `search-sync`. Meilisearch và Tika không mở cổng ra ngoài
- **Lý do:** Quyền xem chứng từ phụ thuộc vị trí, ủy quyền, bổ nhiệm theo ngày và chuỗi duyệt (ADR #5, #28, #29), không chép được thành danh sách người đọc trong chỉ mục mà không lệch; kiểm tra lại trong CSDL giữ CSDL là nguồn sự thật, chỉ mục cũ chưa kịp đồng bộ không làm lộ dữ liệu. Meilisearch tìm được tiếng Việt gõ không dấu (bỏ dấu cả chữ `đ`), chịu lỗi gõ, một tệp chạy, ít RAM; Tika đọc PDF, DOCX, XLSX. Đánh dấu bằng trigger và đối chiếu theo trạng thái giống `flow-sync` (ADR #31): chạy lại không sai, không mất thay đổi khi dịch vụ dừng
- **Đã loại:** Full-text search của PostgreSQL (`tsvector`): không có cấu hình tiếng Việt, không bỏ dấu và chịu lỗi gõ sẵn, phải tự trích chữ tệp; OpenSearch/Elasticsearch (JVM, cần vài GB RAM riêng cho chỉ mục, quá nặng cho máy dev chạy cả hệ thống); lưu danh sách người đọc vào chỉ mục rồi lọc trong Meilisearch (lệch khi đổi bổ nhiệm, ủy quyền); tenant token của Meilisearch cấp cho trình duyệt (giao diện gọi thẳng dịch vụ lõi, trái Quy tắc 1, và vẫn không lọc được theo quyền chi tiết); Debezium/Kafka để đồng bộ (chưa có trục sự kiện, trigger đủ cho khối lượng hiện tại); OCR ảnh (PaddleOCR, việc riêng của tuần 4)

(adr-37)=
## ADR #37: Phiếu PDF: mẫu HTML (Jinja2) in bằng Gotenberg Chromium, lưu theo mã nội dung

- **Ngày:** 05/10/2026
- **Quyết định:** Action `get_purchase_request_pdf` (chỉ người xem được chứng từ) đọc dữ liệu từ CSDL, dựng HTML từ mẫu Jinja2 (`services/actions/app/templates`, escape tự động, CSS nhúng sẵn) rồi gọi Gotenberg (`gotenberg/gotenberg:8.37.0-chromium`, chỉ mạng nội bộ) in ra PDF khổ A4. Phiếu không chứa giờ in nên cùng nội dung thì cùng HTML: tệp lưu ở bucket tài liệu với khóa `<tenant>/proc.purchase_request/<id>/forms/<sha256 của HTML>.pdf`, có rồi thì không in lại; trả về link tải có chữ ký như tệp đính kèm. Chân trang in số chứng từ, 16 ký tự đầu của mã nội dung (mã kiểm tra) và số trang. Chưa duyệt xong thì có chữ chìm trạng thái. Gotenberg chạy với JavaScript tắt, chặn mọi địa chỉ mạng (riêng và công khai), tắt tải tệp từ URL và webhook
- **Lý do:** Dữ liệu người dùng đi vào phiếu (tiêu đề, mô tả, tên nhà cung cấp) nên mẫu phải escape; Jinja2 làm sẵn việc này và đội đã quen HTML/CSS. Chromium dàn trang tiếng Việt tốt, image Gotenberg có sẵn phông Noto/DejaVu, bản `-chromium` nhẹ hơn bản đủ (không LibreOffice). Lưu theo mã nội dung: in lại không tốn Gotenberg, phiếu đã phát hành đối chiếu được với hệ thống (sửa chứng từ thì ra mã khác). Chặn mạng của Chromium để HTML không thể là đường SSRF vào dịch vụ nội bộ
- **Đã loại:** Mẫu DOCX + docxtemplater/Carbone rồi LibreOffice chuyển PDF (cần thêm dịch vụ Node hoặc bản Gotenberg có LibreOffice nặng gấp đôi; dàn trang bảng dài kém ổn định; để dành khi người dùng nghiệp vụ cần tự sửa mẫu trong Word); WeasyPrint trong image Python (thêm Pango/Cairo vào image dùng chung, không có lý do bỏ dịch vụ đã nằm trong kiến trúc); sinh PDF ở trình duyệt (react-pdf: phiếu không đối chiếu được với máy chủ, lộ logic in); lưu phiếu thành tệp đính kèm `core.attachment` (phiếu sinh lại được bất kỳ lúc nào, không phải chứng cứ người dùng tải lên); chữ ký số PAdES (cần PKI, việc mở rộng)

(adr-38)=
## ADR #38: CDC bằng Debezium Server → Kafka KRaft, publication theo schema, nhịp tim giữ slot

- **Ngày:** 05/10/2026
- **Quyết định:** PostgreSQL chạy `wal_level=logical`. Migration 012 tạo publication `bms_cdc` `FOR TABLES IN SCHEMA core, mdm, wf, proc, ic, collab, cdc` (bảng tạo sau tự vào), không gồm `audit`, `search`, `public`. Debezium Server (`quay.io/debezium/server`, connector PostgreSQL, plugin `pgoutput`) đọc bằng role `bamboo_cdc` (REPLICATION, chỉ `SELECT` các schema trong publication và `UPDATE cdc.heartbeat`, không thuộc nhóm ứng dụng) và ghi vào Kafka (`apache/kafka`, KRaft một node) topic `bms.<schema>.<bảng>`, JSON không kèm schema, số tiền dạng chuỗi, giữ 7 ngày. Lần đầu chụp ảnh toàn bộ; vị trí đọc lưu ở volume `debezium-data`. Mỗi 10 giây Debezium ghi `cdc.heartbeat` để slot `bms_debezium` luôn tiến; `max_slot_wal_keep_size=1GB` chặn trường hợp Debezium dừng lâu làm đầy đĩa. Kafka và Debezium chỉ mạng nội bộ; Kafka chưa bật xác thực vì chỉ Debezium ghi. Cấu hình Debezium bằng biến môi trường trong compose (không bind mount, chạy được từ image dựng sẵn)
- **Lý do:** Nguyên lý 1 (dữ liệu nóng sang Lakehouse) và ứng dụng Tầng 3 cần trục sự kiện; CDC lấy thay đổi từ WAL nên không phải sửa ứng dụng, không bỏ sót thay đổi do trigger hay hàm CSDL tạo ra. Debezium Server một tiến trình, nhẹ hơn Kafka Connect (không có REST API quản lý connector, không topic cấu hình riêng), cấu hình theo Git. Publication theo schema nên bảng mới không phải sửa publication. Nhiều CSDL (keycloak, flowable, hasura_meta) chung máy chủ vẫn sinh WAL khi bảng nghiệp vụ không đổi; thiếu nhịp tim thì slot giữ WAL đó mãi. Không đẩy `audit` (đã có chuỗi hash và đối soát riêng, ADR #33) và `search` (hàng đợi nội bộ). Giữ ADR #22: chỉ CSDL `bms`
- **Đã loại:** Kafka Connect + connector Debezium (thêm JVM, cấu hình connector lúc chạy qua REST lệch Git); bảng outbox cho sự kiện nghiệp vụ (để dành khi ứng dụng Tầng 3 cần sự kiện có nghĩa nghiệp vụ thay vì thay đổi dòng); `REPLICA IDENTITY FULL` (WAL lớn hơn; Lakehouse ghi đè theo khóa chính, không cần ảnh trước khi sửa); Avro + Schema Registry (thêm dịch vụ; JSON đủ cho bước đầu); Redpanda (BSL, ADR #2); Kafka nhiều node (một máy dev)

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
