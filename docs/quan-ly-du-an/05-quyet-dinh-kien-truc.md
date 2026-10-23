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
| [39](#adr-39) | 05/10/2026 | Lakehouse bronze: Kafka → Iceberg bằng pyiceberg, JDBC catalog trong PostgreSQL, vị trí Kafka trong snapshot |
| [40](#adr-40) | 05/10/2026 | Tầng silver là view Trino sinh từ kiểu cột PostgreSQL; Trino một node trên cùng catalog |
| [41](#adr-41) | 05/10/2026 | Tiếp nhận nhân sự: duyệt quyết định bổ nhiệm, chuỗi duyệt tính từ vị trí, dữ liệu nhạy cảm mã hóa bằng OpenBao |
| [42](#adr-42) | 06/10/2026 | Đơn hàng nội bộ: bên mua đặt qua đề nghị mua sắm, bên bán xác nhận kèm lô xuất, tự sinh đơn mua |
| [43](#adr-43) | 06/10/2026 | Che dữ liệu cá nhân bằng Presidio trong tiến trình actions: chỉ bộ nhận diện theo mẫu cho Việt Nam; nhật ký kiểm toán chỉ trả bản che |
| [44](#adr-44) | 12/10/2026 | Quản trị dữ liệu tenant qua giao diện: Action ghi chung có kiểm quyền theo đơn vị, nhập hàng loạt xem trước bằng giao dịch rollback |
| [45](#adr-45) | 13/10/2026 | Bảo mật trục dữ liệu: Kafka SCRAM + ACL; Trino HTTPS bằng CA nội bộ của OpenBao, tài khoản dịch vụ, row filter theo tenant |
| [46](#adr-46) | 13/10/2026 | Sổ cái đối soát tệp bằng chuỗi hash nhật ký kiểm toán thay cho Hyperledger Fabric; phòng đọc chỉ đọc ghi nhật ký truy cập |
| [47](#adr-47) | 13/10/2026 | Thiết kế quy trình trên giao diện: BPMN XML là nguồn sự thật (bpmn-js), kiểm tra ở máy chủ, chạy thử bằng deployment sandbox tạm trên Flowable |
| [48](#adr-48) | 14/10/2026 | Thư viện tri thức: tài liệu vào thư viện qua đề xuất là loại chứng từ mới đi chung chuỗi duyệt; phạm vi đọc tập đoàn / công ty; tìm toàn văn bằng chỉ mục Meilisearch có sẵn |
| [49](#adr-49) | 14/10/2026 | Trung tâm điều hành tính ở máy chủ từ dữ liệu có sẵn; bệnh viện chỉ số tổng hợp hành chính của tenant con; bản đồ cơ sở gộp vào Trung tâm điều hành |
| [50](#adr-50) | 14/10/2026 | Bản sao số, Phả hệ dữ liệu, KPI ghim đọc bảng trong CSDL nạp từ tệp demo; ghi nhận sự cố, báo sự cố dữ liệu, ghim KPI là thao tác thật |
| [51](#adr-51) | 16/10/2026 | Mô hình AI chạy cục bộ bằng Ollama; mô hình nhẹ mặc định chạy được bằng CPU, GPU chỉ để tăng tốc |

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
- **Quyết định:** PostgreSQL chạy `wal_level=logical`. Migration 012 tạo publication `bms_cdc` `FOR TABLES IN SCHEMA core, mdm, wf, proc, ic, collab, cdc` (bảng tạo sau tự vào), không gồm `audit`, `search`, `public`. Debezium Server (`quay.io/debezium/server`, connector PostgreSQL, plugin `pgoutput`) đọc bằng role `bamboo_cdc` (REPLICATION, chỉ `SELECT` các schema trong publication và `UPDATE cdc.heartbeat`, không thuộc nhóm ứng dụng) và ghi vào Kafka (`apache/kafka`, KRaft một node) topic `bms.<schema>.<bảng>`, JSON không kèm schema, số tiền dạng chuỗi, giữ 7 ngày. Lần đầu chụp ảnh toàn bộ; vị trí đọc lưu ở volume `debezium-data`. Mỗi 10 giây Debezium ghi `cdc.heartbeat` để slot `bms_debezium` luôn tiến; `max_slot_wal_keep_size=1GB` chặn trường hợp Debezium dừng lâu làm đầy đĩa. Kafka và Debezium chỉ mạng nội bộ; Kafka chưa bật xác thực vì chỉ Debezium ghi (từ 13/10/2026: SCRAM + ACL, [ADR #45](#adr-45)). Cấu hình Debezium bằng biến môi trường trong compose (không bind mount, chạy được từ image dựng sẵn)
- **Lý do:** Nguyên lý 1 (dữ liệu nóng sang Lakehouse) và ứng dụng Tầng 3 cần trục sự kiện; CDC lấy thay đổi từ WAL nên không phải sửa ứng dụng, không bỏ sót thay đổi do trigger hay hàm CSDL tạo ra. Debezium Server một tiến trình, nhẹ hơn Kafka Connect (không có REST API quản lý connector, không topic cấu hình riêng), cấu hình theo Git. Publication theo schema nên bảng mới không phải sửa publication. Nhiều CSDL (keycloak, flowable, hasura_meta) chung máy chủ vẫn sinh WAL khi bảng nghiệp vụ không đổi; thiếu nhịp tim thì slot giữ WAL đó mãi. Không đẩy `audit` (đã có chuỗi hash và đối soát riêng, ADR #33) và `search` (hàng đợi nội bộ). Giữ ADR #22: chỉ CSDL `bms`
- **Đã loại:** Kafka Connect + connector Debezium (thêm JVM, cấu hình connector lúc chạy qua REST lệch Git); bảng outbox cho sự kiện nghiệp vụ (để dành khi ứng dụng Tầng 3 cần sự kiện có nghĩa nghiệp vụ thay vì thay đổi dòng); `REPLICA IDENTITY FULL` (WAL lớn hơn; Lakehouse ghi đè theo khóa chính, không cần ảnh trước khi sửa); Avro + Schema Registry (thêm dịch vụ; JSON đủ cho bước đầu); Redpanda (BSL, ADR #2); Kafka nhiều node (một máy dev)

(adr-39)=
## ADR #39: Lakehouse bronze: Kafka → Iceberg bằng pyiceberg, JDBC catalog trong PostgreSQL, vị trí Kafka trong snapshot

- **Ngày:** 05/10/2026
- **Quyết định:** Dịch vụ `lakehouse-sink` (Python, pyiceberg + pyarrow; image riêng `bamboo-lakehouse` dựng từ mã `actions` với `requirements-lakehouse.txt`) đọc các topic CDC `bms.<schema>.<bảng>` của các schema nghiệp vụ (bỏ nhịp tim) và ghi thêm vào bảng Iceberg `bronze.<schema>_<bảng>`: mỗi thay đổi một dòng (`op`, `source_ts`, `source_date`, `lsn`, `tx_id`, `tenant_id`, `record_key`, `before`/`after` dạng JSON, `kafka_partition`, `kafka_offset`, `ingested_at`), phân vùng identity theo `source_date`, định dạng Iceberg v2, dữ liệu Parquet ở bucket `bms-lakehouse`. Catalog là CSDL PostgreSQL `lakehouse` (chủ sở hữu `bamboo_lakehouse`) theo cấu trúc JDBC catalog của Iceberg. Ghi theo lô (tối đa 5.000 dòng hoặc 30 giây), mỗi bảng một snapshot mang `kafka.offsets` trong summary; khởi động lại đọc tiếp từ vị trí đó (không dùng offset của consumer group) nên ghi đúng một lần. AppRole `lakehouse` chỉ đọc `bms/lakehouse` và `bms/seaweedfs-lakehouse`; định danh S3 `bms-lakehouse` chỉ vào bucket lakehouse
- **Lý do:** Nguyên lý 1 (dữ liệu lịch sử tự động xuống Lakehouse): tầng bronze giữ toàn bộ lịch sử biến động, kể cả dòng đã sửa hay xóa ở OLTP. JDBC catalog dùng lại PostgreSQL đang có (không thêm dịch vụ catalog), Trino/Spark/DuckDB đọc được cùng catalog. Lưu vị trí Kafka trong cùng giao dịch với dữ liệu (commit snapshot Iceberg) là cách đơn giản nhất để không trùng dòng khi dừng giữa chừng. Cột JSON giữ nguyên bảng nguồn nên đổi cấu trúc CSDL không làm hỏng bronze; tầng silver có kiểu dữ liệu dựng sau bằng Trino. Phân vùng identity theo ngày không cần thư viện Rust `pyiceberg-core` (transform `day` cần)
- **Đã loại:** Nessie, Polaris, Lakekeeper (thêm dịch vụ JVM/Rust chỉ để giữ con trỏ metadata); Kafka Connect Iceberg sink (thêm cụm Connect); Spark Structured Streaming (quá nặng cho một máy); cột có kiểu ngay ở bronze (mỗi lần đổi bảng nguồn phải tiến hóa schema Iceberg theo); pyarrow trong image `actions` dùng chung (thêm khoảng 150 MB cho sáu dịch vụ không cần); upsert/merge theo khóa ở bronze (mất lịch sử, cần delete file)

(adr-40)=
## ADR #40: Tầng silver là view Trino sinh từ kiểu cột PostgreSQL; Trino một node trên cùng catalog

- **Ngày:** 05/10/2026
- **Quyết định:** Trino (`trinodb/trino`, image `bamboo-trino` một node, heap 1 GB) đọc catalog Iceberg mà `lakehouse-sink` ghi (JDBC catalog ở CSDL `lakehouse`, tên catalog `bms`; tệp catalog do `openbao-init` ghi từ OpenBao vào volume `trino-catalog`, quyền 0600 cho uid của Trino). Tầng silver là **view** `lakehouse.silver.<schema>_<bảng>`: mỗi khóa chính một dòng (sự kiện mới nhất theo vị trí Kafka, bỏ dòng có `op = 'd'`), cột có kiểu như PostgreSQL (`uuid`, `decimal(p,s)`, `date`, `timestamp(6) with time zone`, mảng), thêm `_changed_at`, `_lsn`. SQL sinh bằng `app.lakehouse_silver` từ CSDL đã migrate (kiểu cột trong `pg_attribute` của các bảng thuộc publication `bms_cdc`) vào `platform/trino/silver.sql`, commit vào Git (kiểm thử báo lỗi khi tệp cũ so với CSDL); tệp cũng tạo trước bảng bronze còn thiếu (cùng cột với lakehouse-sink) để view luôn tạo được. Job `trino-init` chạy tệp mỗi lần khởi động. Trino không xác thực, chỉ mạng nội bộ và `127.0.0.1:8085` cho máy dev (từ 13/10/2026: xác thực và quyền theo tenant, [ADR #45](#adr-45))
- **Lý do:** View luôn đúng dữ liệu mới nhất mà không cần job làm mới, không nhân đôi dữ liệu; JDBC catalog của Trino không hỗ trợ materialized view. Kiểu cột lấy từ CSDL (nguồn sự thật) thay vì đoán từ JSON, cách làm giống metadata Hasura (ADR #24). Thứ tự theo vị trí Kafka là chính xác vì mỗi khóa luôn vào cùng một partition. Trino đọc được Iceberg do pyiceberg ghi (cùng chuẩn JDBC catalog), đủ cho báo cáo, IOC và gộp tệp nhỏ (`optimize`)
- **Đã loại:** Bảng silver vật lý làm mới định kỳ bằng `MERGE` (thêm job, trễ theo lịch, tốn lưu trữ; để dành khi view chậm); materialized view (JDBC catalog không hỗ trợ); DuckDB trong `actions` (không có máy chủ SQL cho Metabase, IOC); suy kiểu từ JSON (numeric, date của Debezium không tự mô tả); Trino nhiều node, xác thực (một máy dev; khi mở cho người dùng sẽ thêm xác thực và quyền theo tenant)

(adr-41)=
## ADR #41: Tiếp nhận nhân sự: duyệt quyết định bổ nhiệm, chuỗi duyệt tính từ vị trí, dữ liệu nhạy cảm mã hóa bằng OpenBao

- **Ngày:** 05/10/2026
- **Quyết định:** Hồ sơ nhân viên mới đi qua **đề nghị tiếp nhận nhân sự** (`hr.onboarding_request`, số `TN-<năm>-<số>`): phòng nhân sự lập hồ sơ ứng viên kèm đề xuất bổ nhiệm (vị trí, ngày vào làm, loại hợp đồng, lương) và gửi duyệt. Thứ được duyệt là **quyết định bổ nhiệm**, không phải việc nhập liệu. Chuỗi duyệt dùng bộ máy duyệt chung (quy trình `ONBOARDING` trong `wf.approval_rule`, ADR #17, #28) nhưng tính từ **vị trí được bổ nhiệm**: bước 1 là quản lý trực tiếp của vị trí, bước 2 là giám đốc công ty (công ty mẹ: Tổng giám đốc); hai bước rơi vào cùng người thì gộp. Duyệt xong, CSDL tạo người (mã `NV-<năm>-<số>`) và bổ nhiệm giữ chính từ ngày vào làm (chặn khi ghế đã có người), rồi đưa tài khoản vào hàng đợi; flow-sync tạo tài khoản Keycloak bằng client riêng `bms-provisioner` (service account chỉ có `manage-users`, `view-users`, `query-users` của realm `bms`; secret sinh trong OpenBao, bootstrap đặt cho client), mật khẩu tạm bắt đổi ở lần đăng nhập đầu. CCCD, số tài khoản, địa chỉ chỉ lưu **bản mã** của khóa transit `pii` (OpenBao) và **bản che** (`•••••••••789`, `•••, Hà Nội`); ghi qua Action `save_onboarding_private`, xem bản rõ qua `reveal_onboarding_private` (quyền `hr.onboarding.private.read`), mỗi lần xem là một dòng `hr.private_access` có nhật ký kiểm toán. Người lập, phòng nhân sự (vai trò `NHAN_SU`, phạm vi công ty), quản lý cây đơn vị nhận người (`hr.onboarding.read`) và người duyệt xem được hồ sơ bản che. Hồ sơ và tệp đính kèm của nó không vào chỉ mục tìm kiếm; schema `hr` không vào publication CDC/Lakehouse
- **Lý do:** Ở doanh nghiệp, giám đốc và quản lý duyệt quyết định nhận người vào vị trí nào, lương bao nhiêu; kiểm tra dữ liệu nhập là việc nội bộ phòng nhân sự. Tính chuỗi duyệt từ vị trí (không từ người lập) đúng người chịu trách nhiệm về đơn vị nhận người và giữ phân tách trách nhiệm: trưởng phòng A không duyệt người vào phòng B. Dùng lại bộ máy duyệt, hộp việc, thông báo, bình luận, tệp đính kèm chứng minh nền tảng trung lập ngành: thêm loại chứng từ chỉ cần thêm nhánh vào các hàm đa hình. Mã hóa bằng transit giữ khóa ngoài CSDL nên bản sao lưu, nhật ký kiểm toán, người đọc bảng (Hasura, ứng dụng) không thấy bản rõ; bản che đủ để người duyệt đối chiếu (Nghị định 13/2023/NĐ-CP: chỉ xử lý dữ liệu cá nhân trong phạm vi cần thiết). Client riêng cho việc tạo tài khoản thay vì tài khoản admin master: lộ secret chỉ ảnh hưởng người dùng realm `bms`
- **Đã loại:** Duyệt việc nhập dữ liệu (không phải quyết định của quản lý; để phòng nhân sự tự kiểm tra chéo); "mọi quản lý đều duyệt được" (không phân tách trách nhiệm); thêm cột nhạy cảm vào `core.person` (mọi người trong tenant đọc được bảng này); mã hóa bằng `pgcrypto` (khóa phải nằm trong CSDL hoặc đi qua câu SQL, lộ trong nhật ký); tạo tài khoản trong Action duyệt (Keycloak lỗi thì việc duyệt cũng lỗi; hàng đợi chạy lại được); gửi email kích hoạt của Keycloak (chưa có SMTP; phòng nhân sự bàn giao mật khẩu tạm)
- **Giới hạn hiện tại:** Mật khẩu tạm lưu bản mã tới khi phòng nhân sự bàn giao, chưa tự xóa sau lần đổi đầu; người lập rời phòng nhân sự thì hồ sơ dở dang không tự chuyển người (khác đề nghị mua sắm, ADR #29); `manage-users` vẫn đặt lại được mật khẩu mọi tài khoản realm, kể cả quản trị nền tảng (Keycloak chưa có quyền hẹp hơn mà không bật fine-grained permissions)

(adr-42)=
## ADR #42: Đơn hàng nội bộ: bên mua đặt qua đề nghị mua sắm, bên bán xác nhận kèm lô xuất, tự sinh đơn mua

- **Ngày:** 06/10/2026
- **Quyết định:** Giao dịch nội bộ giữa các công ty trong tập đoàn bắt đầu từ **bên mua**: đề nghị mua sắm chọn **nhà cung cấp nội bộ** (`mdm.partner.internal_unit_id`) đi qua chuỗi duyệt theo hạn mức như mọi đề nghị. Gửi duyệt bị chặn khi mua của chính công ty mình hoặc chưa có dòng hàng. Duyệt xong, CSDL tự sinh **đơn hàng nội bộ** (`ic.ic_order`, số `IC-<năm>-<số>`, trạng thái `PENDING`) chép dòng hàng của đề nghị, gắn vào đề nghị (`ic_order_id`, người lập không sửa được cột này nữa). Người có quyền `ic.order.confirm` ở công ty bán (vai trò `BAN_HANG_NOI_BO` của khối kinh doanh) xác nhận và ghi **lô xuất** cho từng dòng (`ic.confirm_order`): lô phải của công ty bán, đúng mặt hàng, đang xuất được (`RELEASED`), còn đủ số lượng; mặt hàng bên bán có quản lý lô thì bắt buộc chọn lô. Xác nhận xong tự sinh **đơn mua** (`proc.purchase_order`, `PO-<năm>-<số>`) cho bên mua, dòng hàng mang lô nhận về. Bên bán từ chối, người đặt hủy khi đơn còn chờ, đều phải ghi lý do; mỗi bước có thông báo. Bên mua (người đặt, người xem được đề nghị nguồn) và bên bán (`ic.order.read`, `ic.order.confirm`) xem được đơn; đơn mua chỉ bên mua xem. Lô (`mfg.lot`, schema mới `mfg`) vào publication CDC để truy xuất ở Lakehouse
- **Lý do:** Trong tập đoàn, nhu cầu mua phát sinh ở bên mua và phải qua hạn mức chi tiêu của bên mua; dùng lại đề nghị mua sắm nghĩa là dùng lại toàn bộ chuỗi duyệt, hộp việc, phiếu PDF, tìm kiếm. Bên bán chỉ cần quyết định có giao được không và giao lô nào. Ghi lô ở bước xác nhận là chỗ duy nhất biết chắc lô nào đi sang công ty nào: từ lô wafer lỗi truy xuôi tới đơn mua của công ty điện thoại (bước 3 kịch bản demo). Sinh chứng từ trong cùng giao dịch với việc duyệt / xác nhận nên không có trạng thái nửa vời
- **Đã loại:** Bên bán lập đơn bán rồi bên mua lập đề nghị gắn vào (hai luồng duyệt, demo dài; hàm `wf.conflict_persons` và đơn `DRAFT` vẫn giữ cho trường hợp này); một chứng từ duyệt bởi cả hai bên (trộn hạn mức của hai pháp nhân trong một chuỗi); dòng hàng nhiều lô (để sau, khi cần tách số lượng); trừ tồn kho theo lô (chưa có kho; chỉ chặn xuất quá số lượng lô)
- **Giới hạn hiện tại:** Chưa đối trừ công nợ (`SETTLED`, `ic.settle`), chưa nhận hàng / hóa đơn trên đơn mua, chưa phả hệ lô (wafer → chip → điện thoại); đơn mua chỉ sinh từ đơn hàng nội bộ

(adr-43)=
## ADR #43: Che dữ liệu cá nhân bằng Presidio trong tiến trình actions: chỉ bộ nhận diện theo mẫu cho Việt Nam; nhật ký kiểm toán chỉ trả bản che

- **Ngày:** 06/10/2026
- **Quyết định:** Microsoft Presidio (`presidio-analyzer`, `presidio-anonymizer`) chạy như thư viện trong tiến trình `actions` (`app/pii_guard.py`), nạp lười ở luồng nền. Không dùng mô hình NER: spaCy `blank("xx")` chỉ tách từ; bộ nhận diện riêng cho CCCD, CMND và số tài khoản (hai loại sau chỉ khi có từ khóa đứng trước), số điện thoại Việt Nam, email, cộng bộ nhận diện số thẻ (Luhn) của Presidio. Che từng phần (`0912 *** 678`, `•••••••••789`, `n***@…`) để người đọc vẫn đối chiếu được. Áp dụng: (1) nhật ký kiểm toán: Hasura không trả `old_data`/`new_data`, Action `audit_log_detail` (cần `audit.read`) trả bản che bằng Presidio cộng quy tắc theo tên cột (bản mã, ngày sinh, điện thoại, email); (2) ô trao đổi: Action `check_pii` trước khi gửi, người dùng chọn gửi bản đã che, sửa lại hoặc vẫn gửi nguyên văn
- **Lý do:** Người có `audit.read` (kiểm soát tài chính, pháp chế) đọc thay đổi của mọi bảng trong tenant, kể cả hồ sơ ứng viên: họ cần biết ai sửa gì, khi nào, không cần số điện thoại, ngày sinh của người khác (Nghị định 13/2023/NĐ-CP: xử lý dữ liệu cá nhân trong phạm vi cần thiết). Chuỗi hash vẫn đối soát trên dữ liệu gốc trong CSDL nên che lúc đọc không làm mất tính toàn vẹn. Trao đổi trên chứng từ đến mọi người xem được chứng từ; cảnh báo lúc gõ rẻ hơn gỡ sau. Không có mô hình NER tiếng Việt dùng được ngay; mô hình tiếng Anh nhận nhầm, nặng khoảng 500 MB; mẫu cho số định danh, điện thoại Việt Nam chính xác hơn và chạy vài mili giây. Thư viện trong `actions` thay vì container riêng (image chính thức của Presidio kèm mô hình tiếng Anh, hơn 1 GB): một tiến trình ít bộ nhớ hơn, không thêm đường mạng
- **Đã loại:** Image `presidio-analyzer` chính thức (mô hình tiếng Anh, nặng); che lúc ghi vào `audit.log` (mất dữ liệu gốc để điều tra, phá ý nghĩa nhật ký); che bình luận tự động không hỏi (số điện thoại nhà cung cấp là thông tin công việc hợp lệ); nhận diện họ tên bằng danh sách người trong tenant (tên trong nhật ký, trao đổi là thông tin công việc; để dành cho Lakehouse / BI)
- **Giới hạn hiện tại:** Chưa che địa chỉ, họ tên trong văn bản tự do; chưa áp cho tầng silver / mart BI (yêu cầu BI-05) và chỉ mục tìm kiếm; image `actions` (và `lakehouse`, dùng chung `requirements.txt`) lớn thêm khoảng 250 MB

(adr-44)=
## ADR #44: Quản trị dữ liệu tenant qua giao diện: Action ghi chung có kiểm quyền theo đơn vị, nhập hàng loạt xem trước bằng giao dịch rollback

- **Ngày:** 12/10/2026
- **Quyết định:** Người có quyền `core.org.manage` (cơ cấu, người dùng, bổ nhiệm, loại đơn vị, chức danh), `core.permission.manage` (vai trò, cấp quyền) hoặc `mdm.manage` (nhà cung cấp, vật tư, nhóm vật tư) tự nhập dữ liệu của tenant trên giao diện `/admin/*`. Ghi đi qua Action `admin_save(entity, data)` / `admin_close(entity, id, end_date)` trong `actions` (`app/admin.py`): kiểm quyền bằng `core.has_permission` tại đơn vị đích (thêm đơn vị: tại đơn vị cha; chuyển đơn vị: tại cả nơi đi và nơi đến; cấp vai trò phạm vi cả tenant: tại gốc), đổi mã ↔ id, rồi để trigger và ràng buộc CSDL sẵn có (một trưởng mỗi đơn vị, một người mỗi ghế, hợp đồng không giữ ghế trưởng, vai trò gán cho vị trí thay vì người — [ADR #5](#adr-5), [ADR #29](#adr-29)) quyết định đúng sai và trả nguyên văn thông báo. Không xóa: đơn vị, vị trí, bổ nhiệm, cấp quyền chỉ kết thúc hiệu lực theo ngày (giờ Việt Nam). Nhập hàng loạt `admin_import` đọc CSV/XLSX (`openpyxl`) ở máy chủ và gọi đúng các hàm ghi đó cho từng dòng, mỗi dòng một savepoint; "xem trước" chạy thật rồi rollback, chỉ ghi khi mọi dòng hợp lệ. Tài khoản đăng nhập tạo bằng client `bms-provisioner` (như [ADR #41](#adr-41)) với mật khẩu tạm trả về một lần, hoặc liên kết tài khoản sẵn có cùng công ty mẹ ([ADR #30](#adr-30)). Quản trị viên (view `core.v_admin`) đọc được bảng vai trò và cấp quyền qua Hasura
- **Lý do:** Cơ cấu tổ chức là dữ liệu ([ADR #5](#adr-5)) nhưng tới nay chỉ vào được bằng seed. Luật nghiệp vụ đã nằm trọn ở CSDL; một Action chung giữ một chỗ kiểm quyền và một luật cho cả nhập tay lẫn nhập tệp. Xem trước bằng giao dịch thật bắt được cả lỗi chỉ CSDL biết (trùng ghế, trùng trưởng, vòng lặp cây) mà kiểm tra ở giao diện không thấy
- **Đã loại:** Mở insert/update của Hasura cho role `user` (điều kiện quyền theo phạm vi cây không diễn đạt được bằng bộ lọc Hasura, và phải lặp lại cho từng bảng); mỗi loại dữ liệu một Action có kiểu riêng (trùng lặp, phình metadata); đọc Excel ở trình duyệt (luật kiểm tra phải viết hai lần); cho phép xóa hẳn (mất lịch sử bổ nhiệm mà chuỗi duyệt và nhật ký cần)
- **Giới hạn hiện tại:** Chưa quản lý nhóm (`core.team`) và ủy quyền trên giao diện; chưa tạo tenant mới (vẫn qua seed / quản trị nền tảng); quản trị viên có `core.permission.manage` cấp được cả quyền quản trị cho người khác (tin cậy theo vai trò, mọi thay đổi có nhật ký kiểm toán); nhập tệp tối đa 2 MB / 5000 dòng mỗi lần
- **Ghi chú (14/10/2026):** Thêm ngoại lệ cho người thêm nhầm: Action `delete_person(id)` xóa hẳn người khi không còn giữ vị trí (kể cả bổ nhiệm tương lai) và chưa để lại dấu vết nghiệp vụ. Dấu vết là mọi khóa ngoại tới `core.person` ngoài cấu hình quản trị (đề nghị, đơn hàng, bước / việc / lịch sử duyệt, thông báo, trao đổi, tệp, hồ sơ nhân sự, sự cố, báo lỗi dữ liệu…) và các cột không có khóa ngoại: người thực hiện trong `audit.log`, lượt xem kho lưu trữ, lượt đối soát, thiết kế / phát hành / chạy thử quy trình. Bổ nhiệm đã kết thúc, cấp quyền gán thẳng, thành viên nhóm, ủy quyền và KPI ghim của người đó xóa theo trong cùng savepoint (nhật ký kiểm toán ghi lại từng dòng); gặp khóa ngoại thì hoàn tác và báo loại dữ liệu đang giữ. Không tự xóa chính mình. Tài khoản Keycloak (`idp_subject`) bị vô hiệu hóa (không xóa, khôi phục được) qua client `bms-provisioner` khi không còn người nào ở tenant khác dùng chung ([ADR #30](#adr-30)); máy chủ đăng nhập lỗi thì hoàn tác cả việc xóa. Người đã có dữ liệu vẫn chỉ ngừng hoạt động bằng cách kết thúc bổ nhiệm

(adr-45)=
## ADR #45: Bảo mật trục dữ liệu: Kafka SCRAM + ACL; Trino HTTPS bằng CA nội bộ của OpenBao, tài khoản dịch vụ, row filter theo tenant

- **Ngày:** 13/10/2026
- **Quyết định:** **Kafka** (image `bamboo-kafka`): listener duy nhất mở ra mạng nội bộ là `SASL_PLAINTEXT :9092` với SCRAM-SHA-512; controller và listener `LOCAL` chỉ nghe localhost trong container. Bộ phân quyền `StandardAuthorizer`, không có ACL thì từ chối; `start.sh` của image đặt mật khẩu SCRAM và ACL qua `LOCAL` (người dùng `ANONYMOUS` là super user) mỗi lần khởi động: `debezium` ghi / tạo topic tiền tố `bms.` và nhịp tim, `lakehouse` chỉ đọc `bms.`. Mật khẩu `DEBEZIUM_KAFKA_PASSWORD`, `LAKEHOUSE_KAFKA_PASSWORD` khai ở `.env` (như `CDC_DB_PASSWORD`), `lakehouse-sink` đọc tài khoản từ OpenBao (`bms/kafka-lakehouse`). **Trino**: client chỉ đăng nhập được qua HTTPS 8443 bằng chứng chỉ do CA nội bộ cấp (PKI `pki/` của OpenBao, khóa CA không rời OpenBao, `openbao-init` cấp lại khi còn dưới 30 ngày); tài khoản dịch vụ trong `password.db` (PBKDF2, sinh từ mật khẩu OpenBao): `bms-admin` cho `trino-init`, `bms-actions` cho dịch vụ actions. Cổng HTTP 8080 chỉ còn cho giao tiếp nội bộ (khóa ký `shared-secret`) và healthcheck. Quyền (`rules.json`, sinh cùng `silver.sql` bằng `app.lakehouse_silver`): `bms-actions` không đọc được gì, chỉ được mượn danh người dùng tenant `t_<tenant_id>`; người dùng tenant chỉ `SELECT` view silver có cột `tenant_id` (bảng `core.tenant`: cột `id`), mỗi view kèm row filter `tenant_id = CAST(substr(current_user, 3) AS uuid)`; bronze, catalog `system` và view không có cột tenant bị chặn. Trang **Dịch vụ dữ liệu** `/d/services` gọi Action `lakehouse_datasets`, `lakehouse_preview` (quyền mới `data.lakehouse.read`, migration 016, vai trò demo `PHAN_TICH_DU_LIEU`): actions kiểm quyền ở đơn vị gốc của tenant rồi truy vấn dưới danh nghĩa `t_<tenant_id>`, kết quả che dữ liệu cá nhân bằng `pii_guard` ([ADR #43](#adr-43))
- **Lý do:** Kafka chứa mọi thay đổi của CSDL nghiệp vụ, Trino đọc được toàn bộ Lakehouse: trước đây bất kỳ container nào trong mạng compose cũng đọc / ghi được. Trino 483 chỉ nhận mật khẩu qua HTTPS (cờ `allow-insecure-over-http` chỉ cho xác thực bằng tên, ai cũng xưng được là quản trị), nên cần TLS; CA nội bộ trong OpenBao đi cùng nơi đã giữ mọi bí mật ([ADR #25](#adr-25)), client lấy CA công khai từ tệp do `openbao-init` ghi. Row filter ở Trino là hàng rào thứ hai sau kiểm quyền của actions: câu SQL ở actions có sai sót cũng không đọc được tenant khác, và Metabase / BI sau này dùng lại đúng cơ chế mượn danh. Sinh quyền từ kiểu cột của CSDL như `silver.sql` nên bảng mới tự có row filter, bảng không có tenant tự bị chặn
- **Đã loại:** Token Keycloak của chính người dùng làm xác thực Trino (một tài khoản có nhiều tenant, [ADR #30](#adr-30); cần group provider hoặc OPA để biết tenant đang chọn); Open Policy Agent (thêm một dịch vụ để vận hành cho cùng một luật); `allow-insecure-over-http` (chỉ xác thực bằng tên); chứng chỉ tự ký sinh trong `openbao-init` (khóa nằm ngoài OpenBao, không có chỗ chung cho dịch vụ khác cần TLS); mật khẩu Kafka cho Debezium qua `FileConfigProvider` (SmallRye Config của Debezium Server tự thay biểu thức `${...}` trước Kafka); ACL theo từng topic (bảng mới phải sửa ACL)
- **Giới hạn hiện tại:** Kafka chưa mã hóa đường truyền (SASL_PLAINTEXT trong mạng nội bộ; TLS khi tách máy); mật khẩu Kafka chưa được quay vòng tự động; Trino PBKDF2 dùng HMAC-SHA1 theo định dạng của Trino (mật khẩu là chuỗi ngẫu nhiên 256 bit); bản xem trước tối đa 20 dòng, chưa có kiểm tra chất lượng, phả hệ chỉ ở mức bảng; row filter chưa che cột theo vai trò (column mask) và chưa ẩn ô nhỏ cho dữ liệu bệnh viện (BI-05)

(adr-46)=
## ADR #46: Sổ cái đối soát tệp bằng chuỗi hash nhật ký kiểm toán thay cho Hyperledger Fabric; phòng đọc chỉ đọc ghi nhật ký truy cập

- **Ngày:** 13/10/2026
- **Quyết định:** Trang **Sổ cái** `/d/ledger` dùng dữ liệu thật, không dựng Hyperledger Fabric. **Bản niêm phong** của một tệp đính kèm là dòng `audit.log` ghi lúc tệp được nhận (lần đầu chuyển sang `CLEAN`, kèm SHA-256 tính trên đúng nội dung đã quét ở bucket cách ly, [ADR #26](#adr-26)); dòng đó nằm trong chuỗi hash của tenant ([ADR #33](#adr-33)), số thứ tự `seq` và mã `hash` của nó hiện thay cho "khối" và "giao dịch". Số chứng từ là mã hồ sơ, tệp thứ n của chứng từ là phiên bản `vn`. Action `ledger_verify`: theo số chứng từ thì actions **đọc lại tệp trong bucket tài liệu**, tính SHA-256 và so với bản niêm phong, với cột `sha256` trong CSDL, và kiểm mắt xích của dòng nhật ký (`audit.entry_intact`: hash tính lại khớp, dòng kế tiếp hoặc đầu chuỗi trỏ về đúng hash này); theo tệp thì trình duyệt băm SHA-256 tại chỗ, chỉ gửi mã băm để tìm bản niêm phong có cùng mã. Mọi kết quả chỉ xét tệp của chứng từ người gọi xem được (`wf.entity_can_read`). Người có `audit.read` kiểm được cả chuỗi (`verify_audit_chain`). **Phòng đọc ảo**: hồ sơ lưu trữ là tệp của chứng từ đã kết thúc (duyệt, từ chối, hủy); `ledger_open_archive` ghi nhật ký truy cập rồi trả link xem trực tiếp (`Content-Disposition: inline`) hạn 60 giây, giao diện phủ dấu chìm tên người xem. Lịch sử đối soát (`audit.ledger_check`) và nhật ký phòng đọc (`audit.archive_access`) chỉ ghi thêm, qua hàm `SECURITY DEFINER` (ứng dụng chỉ có quyền đọc schema `audit`, [ADR #35](#adr-35)), nằm ngoài CDC; migration 017
- **Lý do:** Mục tiêu của trang là chứng minh tài liệu không bị sửa sau khi nhận, và hệ thống đã có sẵn hai mảnh cần thiết: SHA-256 của từng tệp và chuỗi hash nhật ký chỉ ghi thêm. Fabric thêm cả một mạng (peer, orderer, CA, chaincode) để vận hành trong khi mọi nút vẫn do một tổ chức giữ, nên không thêm niềm tin so với chuỗi hash; cột `audit.log.sealed_at` vẫn để dành cho bước neo chuỗi ra ngoài (immudb hoặc dịch vụ đóng dấu thời gian) khi cần bên thứ ba làm chứng. Đọc lại tệp từ kho mỗi lần đối soát theo mã phát hiện được tệp bị thay hoặc mất ở tầng lưu trữ, không chỉ ở CSDL
- **Đã loại:** Hyperledger Fabric (vận hành nặng, một tổ chức giữ mọi nút); lưu ảnh trang đã đóng dấu cho phòng đọc (cần dịch vụ dựng ảnh trang PDF/Word; link inline hạn ngắn + dấu chìm ở giao diện đủ cho giai đoạn này); bảng đối soát trong schema `core` (đi vào CDC và Lakehouse, Hasura tự mở bảng); tham số URL `?code=` (trùng tham số `code` của OAuth mà keycloak-js đọc khi tải trang, làm Keycloak báo `redirect_uri` không hợp lệ): dùng `?doc=`, đổi cả liên kết vào Hộp việc
- **Giới hạn hiện tại:** Chuỗi hash chưa được neo ra ngoài, nên người có quyền superuser CSDL có thể dựng lại toàn bộ chuỗi (vẫn bị lộ khi so với bản sao lưu hoặc bằng chứng đã xuất); phòng đọc chỉ xem trực tiếp PDF, ảnh, văn bản (Word, Excel không xem trong phòng đọc), chặn tải xuống chỉ ở giao diện; tệp đã bị xóa mềm không còn đối soát được; số liệu "đối soát hôm nay" tính cho cả tenant

(adr-47)=
## ADR #47: Thiết kế quy trình trên giao diện: BPMN XML là nguồn sự thật (bpmn-js), kiểm tra ở máy chủ, chạy thử bằng deployment sandbox tạm trên Flowable

- **Ngày:** 13/10/2026
- **Quyết định:** Trang **Thiết kế quy trình** `/p/process` soạn BPMN 2.0 bằng **bpmn-js Modeler** (bảng công cụ, kéo thả, hoàn tác); thuộc tính tác vụ dùng thuộc tính chuẩn của Flowable (`flowable:candidateGroups`, `assignee`, `dueDate` dạng ISO-8601, `formKey`; mô tả moddle tối thiểu trong giao diện). Bản nháp (`wf.process_model`: XML + biểu mẫu tác vụ dạng JSON) lưu qua Action `process_model_save`, có nhật ký kiểm toán; **phát hành** chụp bản nháp thành `wf.process_version` bất biến (số phiên bản tăng dần, SHA-256), chỉ khi không còn lỗi. **Kiểm tra** ở máy chủ (`app.process_design.lint`): XML hợp lệ, có điểm bắt đầu / kết thúc, luồng nối đúng phần tử, mọi bước có luồng vào / ra, đi tới được điểm kết thúc, nhánh của cổng rẽ có điều kiện (trừ nhánh mặc định), tác vụ dịch vụ có cách thực thi, hạn xử lý đúng ISO-8601; cảnh báo: tác vụ chưa có người nhận / tên, biểu mẫu chưa định nghĩa, phần tử không đi tới được. **Chạy thử** (`process_sandbox_run`): đổi id tiến trình thành `sandbox_<mã>_<lần chạy>`, thay tác vụ dịch vụ / script bằng biểu thức `${true}`, deploy lên Flowable, khởi chạy với biến mẫu, tự hoàn thành từng tác vụ người dùng với `decision` người thiết kế chọn (Duyệt / Từ chối / Trả về) và `stepIndex` = số tác vụ đã xong, tối đa 50 lượt; ghi các bước đã đi qua vào `wf.sandbox_run`, tô trên sơ đồ, rồi xóa deployment (cascade). Quyền mới `wf.process.design` (kiểm ở đơn vị gốc của tenant), vai trò demo Thiết kế quy trình cho CDO Tập đoàn X và KHTH Bệnh viện X; ai cũng xem được. Migration 019; seed thêm quy trình mẫu Duyệt đề nghị mua sắm
- **Lý do:** BPMN XML là định dạng Flowable deploy được trực tiếp và bpmn-js đã có trong giao diện (trang sơ đồ quy trình của đề nghị mua sắm), nên trình soạn và máy chạy dùng cùng một tệp, không có bước chuyển đổi. Chạy thử bằng deployment tạm với khóa riêng cho kết quả thật của engine (biểu thức điều kiện, cổng rẽ, lỗi parse) mà không đụng tiến trình phản chiếu luồng duyệt (ADR #31); xóa deployment xong thì Flowable không giữ rác. Kiểm tra ở máy chủ để luật là một cho giao diện, lưu và phát hành
- **Đã loại:** Mô hình nút / cạnh tự định nghĩa rồi sinh BPMN (bản minh họa trước đây: mất thông tin khi đọc lại BPMN có sẵn); `bpmn-js-properties-panel` (thêm gói lớn cho vài thuộc tính); mô phỏng trên trình duyệt (không phát hiện lỗi thật của engine); tự deploy phiên bản phát hành thành quy trình nghiệp vụ (luồng duyệt vẫn ở CSDL theo ADR #31; phát hành là phiên bản có kiểm soát để đưa vào Git / CI)
- **Giới hạn hiện tại:** Chạy thử chỉ đi được qua tác vụ người dùng (sự kiện hẹn giờ, tin nhắn thì dừng và báo); mọi tác vụ trong một lần chạy cùng một quyết định; biểu mẫu tác vụ mới là định nghĩa trường, chưa sinh form nhập liệu; `candidateGroups` ghi mã tự do, chưa đối chiếu với vai trò

(adr-48)=
## ADR #48: Thư viện tri thức: tài liệu vào thư viện qua đề xuất là loại chứng từ mới đi chung chuỗi duyệt; phạm vi đọc tập đoàn / công ty; tìm toàn văn bằng chỉ mục Meilisearch có sẵn

- **Ngày:** 14/10/2026
- **Quyết định:** Tài liệu (quy chế, quy trình chuẩn, hướng dẫn, hỏi đáp) vào **Thư viện tri thức** `/h/library` qua một **đề xuất**: bảng `collab.kb_document` (số `TL-<năm>-<số>`, đơn vị ban hành = đơn vị của tư cách lập) là loại chứng từ thứ tư của bộ máy duyệt (`wf.entity_requester`, `set_entity_status`, `entity_can_read`, bình luận, tệp, thông báo, Hộp việc), quy tắc duyệt `KB_DOCUMENT` (demo: trưởng đơn vị của người lập). Người lập soạn nháp qua Hasura, đính kèm tệp (kiểm dịch như mọi tệp; chỉ người lập, lúc còn nháp / bị trả về), gửi duyệt (`submit_kb_document`, bắt buộc có tệp sạch); duyệt xong là **xuất bản**. **Bản thay thế** (`supersedes_id`, phiên bản = bản cũ + 1) xuất bản thì bản cũ chuyển `RETIRED`; người có `kb.document.manage` ngừng hiệu lực kèm lý do và nạp lại chỉ mục. Phạm vi đọc: **tập đoàn** = cả tenant, **công ty** = người đang giữ vị trí trong công ty (pháp nhân) của đơn vị ban hành; bản nháp chỉ người lập, người duyệt, người quản lý thấy. Tài liệu đang hiệu lực và tệp của nó vào chỉ mục Meilisearch có sẵn (ADR #36, `kind = kb_document`), ra khỏi chỉ mục khi ngừng hiệu lực; kết quả tìm vẫn lọc lại theo `wf.entity_can_read`. Action `kb_library` trả tài liệu đọc được kèm tệp, chuỗi phiên bản trước và trạng thái chỉ mục (từ `search.pending`). Quyền mới `kb.document.create`, `kb.document.manage`; vai trò demo Đề xuất tài liệu, Quản lý thư viện. Kèm sửa: dựng lại chỉ mục (`search.mark_all`) không còn đánh dấu tệp của hồ sơ nhân sự. Migration 020
- **Lý do:** Bộ máy duyệt, tệp kiểm dịch, bình luận, thông báo, nhật ký kiểm toán và CDC đã dùng chung cho mọi chứng từ, nên một loại chứng từ mới có ngay luồng duyệt, Hộp việc và lịch sử mà không viết lại. Đặt quyền đọc trong CSDL (`kb_can_read_published`) để Hasura, Action, tìm kiếm và Sổ cái dùng cùng một luật. Dùng lại chỉ mục tìm kiếm có sẵn (Tika trích nội dung tệp) thay vì dựng chỉ mục riêng
- **Đã loại:** Thư viện là thư mục trên Ổ đĩa (không có duyệt, phiên bản, phạm vi đọc); bảng tài liệu riêng không qua chuỗi duyệt (người quản lý tự đăng: không có dấu vết ai duyệt); chỉ mục Meilisearch riêng cho thư viện; cho tải thêm tệp vào tài liệu đã xuất bản (tệp vào thẳng chỉ mục mà không qua duyệt)
- **Giới hạn hiện tại:** Phạm vi đọc chỉ có tập đoàn / công ty (chưa theo đơn vị hay vai trò); một bước duyệt theo quy tắc demo; nội dung chỉ mục là tóm tắt, mục lục và văn bản Tika trích được (ảnh quét chưa OCR); nút hỏi trợ lý AI về tài liệu chờ phần AI

(adr-49)=
## ADR #49: Trung tâm điều hành tính ở máy chủ từ dữ liệu có sẵn; bệnh viện chỉ số tổng hợp hành chính của tenant con; bản đồ cơ sở gộp vào Trung tâm điều hành

- **Ngày:** 14/10/2026
- **Quyết định:** Các bảng **Quy trình**, **Sản xuất**, **Bệnh viện**, **Chất lượng dữ liệu** và khối bản đồ của Trung tâm điều hành `/d/ops` lấy số từ một Action `ops_dashboard(tab, days)` (`app/ops.py`), tính bằng SQL trên dữ liệu có sẵn, không thêm bảng nghiệp vụ. *Quy trình*: sự kiện chuỗi duyệt (`wf.approval_history`), thời gian từ lần gửi cuối tới duyệt xong (trung bình, trung vị, p90), việc đang mở / quá hạn 48 giờ, điểm nghẽn theo vị trí nhận việc; chỉ chứng từ người gọi được xem (`wf.entity_can_read`). *Sản xuất*: lô `mfg.lot` theo công ty / trạng thái / mặt hàng, lô đang giữ, đơn hàng nội bộ (`ic.can_read`), đơn mua. *Bệnh viện*: bệnh viện là tenant con (tách vì dữ liệu y tế, ADR #22) nên công ty mẹ chỉ nhận **số tổng hợp hành chính** (nhân sự, vị trí trống, mua sắm, tiếp nhận, việc duyệt theo khối / khoa, 6 tháng), không có chứng từ hay tên người; cần quyền mới `ops.group.read` ở đơn vị gốc; tenant không có con thì bảng tính cho chính nó. *Chất lượng dữ liệu*: các kiểm tra tổ chức, danh mục, tệp kẹt kiểm dịch, lỗi chỉ mục; tên mẫu chỉ cho người quản trị dữ liệu (`core.v_admin`). **Bản đồ**: bỏ trang `/d/map` riêng (chuyển về `/d/ops`); đơn vị có thêm tỉnh và tọa độ (`core.org_unit.province, lat, lng`, sửa ở Cơ cấu tổ chức hoặc nhập Excel), mỗi đơn vị có tọa độ là một cơ sở với việc đang chờ, quá hạn, lô đang giữ trong nhánh của nó; cơ sở của tenant con chỉ có số tổng hợp. Nền bản đồ là đường biên Việt Nam từ Natural Earth 1:50m đóng gói trong mã (chạy không cần Internet), kèm Hoàng Sa, Trường Sa. Migration 021 (cột vị trí, quyền, `core.child_tenants`, `wf.entity_unit`); seed vai trò Điều hành tập đoàn (TGĐ, CDO; GĐ và KHTH bệnh viện), tọa độ các công ty, vài lô gần đây
- **Lý do:** Người dùng chọn không thêm mô hình vận hành bệnh viện hay kế hoạch sản xuất; số tính được từ chuỗi duyệt, lô, đơn nội bộ đã đủ trả lời "đang tắc ở đâu". Tính ở máy chủ vì cần gộp nhiều bảng, phân vị và số của tenant con mà Hasura không cho đọc chéo tenant. Bản đồ là một trang riêng mà không có dữ liệu thiết bị thì chỉ lặp lại số của Trung tâm điều hành
- **Đã loại:** Bảng vận hành bệnh viện (khoa, giường, lượt khám) nhập tay trước khi có HIS; bảng kế hoạch / sản lượng; danh mục cơ sở riêng tách khỏi đơn vị (đơn vị đã có cây và quyền); bản đồ nền tải từ Internet (OpenStreetMap) hay GeoServer (thêm dịch vụ cho một khối nhỏ); cho công ty mẹ xem chứng từ của bệnh viện
- **Giới hạn hiện tại:** Hạn duyệt vẫn tạm 48 giờ cho mọi bước; sản lượng cộng theo mặt hàng (không quy đổi đơn vị tính); bảng Bệnh viện chỉ có chỉ số hành chính tới khi nối HIS; tọa độ nhập tay

(adr-50)=
## ADR #50: Bản sao số, Phả hệ dữ liệu, KPI ghim đọc bảng trong CSDL nạp từ tệp demo; ghi nhận sự cố, báo sự cố dữ liệu, ghim KPI là thao tác thật

- **Ngày:** 14/10/2026
- **Quyết định:** Chưa có context broker NGSI-LD, OpenMetadata / Soda hay kho KPI, nên ba trang nhóm 5 đọc bảng trong CSDL `bms` (migration 022), nạp từ tệp demo `services/seed/data/demo` bằng `app.demo_load` (seed gọi khi chưa có; `--refresh` nạp lại), mọi mốc thời gian dời theo (bây giờ − REF). Schema `iot`: mô hình thiết bị và ngưỡng, cơ sở gắn đơn vị, thực thể, chuỗi đo (`iot.measurement`, trigger theo câu lệnh giữ giá trị mới nhất trong `iot.entity.state`), sự cố vượt ngưỡng; **Ghi nhận sự cố** (Action `iot_acknowledge`, một lần, bắt buộc hướng xử lý, có nhật ký kiểm toán). Schema `meta`: nút / cạnh phả hệ kèm ánh xạ cột, kiểm tra chất lượng, lần chạy, **sự cố dữ liệu** người dùng báo (`meta.data_issue`). Schema `kpi`: định nghĩa, chuỗi giá trị theo tenant, **ghim** của từng người (tối đa 6, Hasura chỉ cho thấy và sửa ghim của chính mình). Đọc qua Hasura trong tenant; mô hình thiết bị và siêu dữ liệu phả hệ dùng chung nền tảng. Không đưa ba schema vào CDC. Trang Tìm kiếm bỏ chỉ mục mẫu, tìm thật thêm thiết bị, hồ sơ tiếp nhận / đơn nội bộ, tài sản dữ liệu
- **Lý do:** Giao diện và quyền được kiểm thử trên dữ liệu thật trong CSDL; khi có nguồn thật (Scorpio, OpenMetadata, job KPI) chỉ thay bộ nạp, giữ bảng và trang. Trạng thái "Nguy cấp" tính từ sự cố nghiêm trọng chưa ghi nhận nên thao tác ghi nhận có tác dụng thấy được
- **Đã loại:** Giữ dữ liệu minh họa trong mã giao diện (không ghi được, không phân quyền); dựng Scorpio / OpenMetadata ngay (thêm nhiều dịch vụ cho dữ liệu demo); tính KPI trực tiếp từ chuỗi duyệt cho mọi KPI (KPI thiết bị chưa có nguồn)
- **Giới hạn hiện tại:** Dữ liệu là dữ liệu demo, không tự sinh thêm theo thời gian (chạy `--refresh` để làm mới); chuỗi đo chỉ 24 giờ; sự cố dữ liệu chưa có quy trình xử lý (chỉ ghi nhận)

(adr-51)=
## ADR #51: Mô hình AI chạy cục bộ bằng Ollama; mô hình nhẹ mặc định chạy được bằng CPU, GPU chỉ để tăng tốc

- **Ngày:** 16/10/2026
- **Quyết định:** Trợ lý RAG và embedding cho tìm kiếm ngữ nghĩa dùng mô hình chạy cục bộ qua **Ollama**, không gọi API đám mây; tác tử gọi công cụ chỉ ở mức một vòng đơn giản trên cùng mô hình. Backend gọi Ollama qua API tương thích OpenAI (`/v1/chat/completions`; embedding qua `/api/embed`), địa chỉ và tên mô hình khai bằng biến môi trường. Mô hình sinh mặc định **Qwen3-4B** (lượng tử hóa Q4_K_M, khoảng 2,5 GB, Apache-2.0), chế độ suy luận (thinking) tắt mặc định, bật được theo từng tác tử; mô hình embedding **bge-m3** (MIT). Mặc định chạy bằng CPU; GPU NVIDIA bật qua tệp compose bổ sung. Danh mục mô hình chọn được cho tác tử AI là các mô hình Ollama đã tải (`/api/tags`), không ghi cứng. Ollama và job `ollama-init` (tải `qwen3:4b`, `bge-m3` vào volume lần đầu, sau đó chạy không cần Internet) chạy cùng `docker compose up` (trước đây thuộc profile `ai`, bỏ để một lệnh dựng đủ hệ thống); Ollama không truy cập được thì giao diện báo AI chưa bật. Ollama chỉ mở mạng nội bộ và `127.0.0.1:11434`. **Vector** lưu trong chỉ mục Meilisearch có sẵn (tìm hybrid, embedder `userProvided` 1024 chiều: actions gọi Ollama tạo vector cho đoạn và câu hỏi rồi ghi vào `_vectors`, nên cài đặt chỉ mục không phụ thuộc Ollama đang chạy và kiểm thử dùng đúng cấu hình thật), không thêm Qdrant. **Trợ lý RAG** chỉ lấy tài liệu thư viện đang hiệu lực; đoạn tài liệu lọc lại bằng `kb_can_read_published` theo người hỏi **trước** khi đưa vào ngữ cảnh mô hình. Điều phối là lớp mỏng trong dịch vụ actions (tìm, lọc quyền, ghép prompt, gọi Ollama), không dùng LlamaIndex, LangGraph, Langfuse; mỗi lượt hỏi ghi nhật ký kiểm toán khi tạo và khi đổi trạng thái (không ghi các lần cập nhật câu trả lời dần). Tài liệu chia **đoạn** (khoảng 800 token, gối 100) vào chỉ mục riêng `documents_kb_chunk` cùng Meilisearch (tiền tố `documents` để khóa Meilisearch hiện có dùng được), kèm tenant, tài liệu, tệp, vị trí để trích dẫn; `search-sync` nạp khi xuất bản, xóa khi ngừng hiệu lực, nạp bù khi chỉ mục trống; chỉ mục toàn văn giữ nguyên. **Lượt hỏi** bất đồng bộ: Action `ai_ask` lưu lượt hỏi rồi trả ngay, tiến trình nền gọi Ollama theo hàng đợi (một lượt một lúc, `OLLAMA_NUM_PARALLEL=1`) và ghi câu trả lời dần khoảng mỗi giây, giao diện theo dõi bằng subscription Hasura. Mỗi lượt hỏi độc lập, không đưa lượt trước vào ngữ cảnh. **Guardrail** là luật cố định: `scope_guard` không tìm được đoạn nào thì trả lời không tìm thấy mà không gọi mô hình; `pii_guard` che dữ liệu cá nhân trong câu trả lời và nhật ký ([ADR #43](#adr-43)); `prompt_guard` đặt đoạn tài liệu trong ranh giới rõ của prompt và chặn câu hỏi khớp mẫu tiêm lệnh. Hỏi trợ lý ở trang `/i/assistant` có sẵn (nút ở Thư viện tri thức trỏ tới, `?doc=` giới hạn trong một tài liệu), chỉ còn chế độ Tri thức, bỏ các chế độ minh họa; dùng tác tử đang hoạt động có `search_docs` và `cite` (nhiều thì người hỏi chọn, không có thì ẩn). Trang Quản trị tác tử AI dùng Action thật, số liệu tính từ lượt hỏi. GPU trên máy dev cần `nvidia-container-toolkit` (cài một lần) rồi chép `docker-compose.gpu.yml` thành `docker-compose.override.yml` (Compose tự nạp; Compose không tự dò GPU, xin GPU trên máy không có thì container lỗi). Kiểm thử tự động dùng server giả tương thích OpenAI (CI không chạy Ollama); chất lượng trả lời kiểm bằng smoke test chạy tay. Máy chuẩn để kiểm: laptop dev RTX 4060 8 GB VRAM
- **Lý do:** Ưu tiên chạy được trên máy yếu, chấp nhận chậm. Ollama tự chuyển sang CPU hoặc chia lớp giữa GPU và CPU khi thiếu VRAM; khai GPU cứng trong compose làm máy không có driver NVIDIA không khởi động được. Qwen3-4B cộng bge-m3 khoảng 3,7 GB, vừa 8 GB VRAM và vẫn chạy được bằng CPU; giấy phép Apache-2.0 / MIT hợp với cam kết nguồn mở. API tương thích OpenAI giữ đường đổi sang vLLM hay máy chủ GPU riêng chỉ bằng đổi địa chỉ
- **Đã loại:** API đám mây (dữ liệu nội bộ rời hệ thống, phụ thuộc mạng khi demo); vLLM (cần GPU, 8 GB VRAM quá chật); Qwen3-8B / 14B / 32B làm mặc định (8B nặng khi chạy CPU, 32B khoảng 20 GB không máy nào của nhóm chạy được); Qwen3-1.7B (trả lời tiếng Việt yếu); Gemma 3 4B (giấy phép Gemma không theo OSI); `multilingual-e5-small` (tìm tiếng Việt kém hơn bge-m3); Qdrant (thêm một dịch vụ trong khi Meilisearch đã có tìm vector và quyền xem đã lọc trên chỉ mục đó); LlamaIndex, LangGraph (lớp trừu tượng lớn cho một luồng tìm rồi hỏi); Langfuse (kéo theo ClickHouse, Redis, quá nặng cho máy yếu); lấy cả tệp đính kèm chứng từ và Ổ đĩa làm nguồn (chưa qua duyệt nội dung, có thể chứa dữ liệu cá nhân); embedding cả tệp trong chỉ mục toàn văn (tìm không trúng đoạn, vượt ngữ cảnh mô hình 4B); Action đồng bộ chờ câu trả lời (Hasura hết hạn 30 giây, chạy CPU mất 30–90 giây); luồng SSE riêng qua APISIX (thêm đường xác thực thứ hai); mô hình phân loại cho guardrail (thêm tải cho máy yếu)
- **Giới hạn hiện tại:** Trả lời chậm khi chạy CPU; chất lượng của mô hình 4B thấp hơn mô hình lớn, nhất là suy luận nhiều bước và gọi nhiều công cụ liên tiếp
- **Bổ sung:** [ADR #52](#adr-52) (20/10/2026): mô hình chỉ nạp vào RAM/VRAM khi có việc, mô hình sinh và bộ OCR không nạp cùng lúc

(adr-52)=
## ADR #52: Mô hình AI chỉ nạp khi có việc, GPU nếu có; OCR tiếng Việt bằng PaddleOCR + VietOCR trong dịch vụ riêng

- **Ngày:** 20/10/2026
- **Quyết định:** Bổ sung [ADR #51](#adr-51), giữ nguyên các phần của nó (chạy cùng `docker compose up`, CPU mặc định, GPU NVIDIA qua `docker-compose.gpu.yml`). Mọi mô hình AI (tác tử, trợ lý RAG, OCR) **chỉ nạp vào RAM/VRAM khi có việc**: Ollama gỡ mô hình sau `AI_KEEP_ALIVE` (mặc định 5 phút) nhàn rỗi, dịch vụ `ocr` nạp bộ mô hình ở trang đầu tiên cần OCR và gỡ sau `OCR_IDLE_SECONDS` (mặc định 300 giây) nhàn rỗi; khởi động không nạp gì. Thiết bị tự chọn: có GPU CUDA thì chạy GPU, không thì CPU; `docker-compose.gpu.yml` cấp GPU cho cả `ollama` và `ocr`. Mô hình chia hai nhóm: **mô hình chính** (mô hình sinh của tác tử, bộ OCR) không nạp cùng lúc; **mô hình phụ** (danh sách khai bằng biến môi trường, mặc định `bge-m3`) nhỏ, không bị gỡ để nhường chỗ cho mô hình chính (vẫn tự gỡ sau `AI_KEEP_ALIVE` khi nhàn rỗi). Trước khi trả lời, actions xem `/api/ps` của Ollama: mô hình sinh chưa nạp thì gỡ bộ OCR và mô hình chính khác để nó có đủ chỗ (ưu tiên nằm trọn trên GPU), rồi để Ollama tự nạp. **OCR** trích văn bản từ tệp quét khi Tika không đọc ra chữ, đưa vào chỉ mục tìm kiếm có sẵn; chạy trong dịch vụ `ocr` riêng: xoay hướng trang, phát hiện dòng (PP-OCRv6) và xoay hướng dòng bằng PaddleOCR với engine `transformers`, nhận dạng bằng VietOCR `vgg_transformer` (cả hai Apache-2.0), tất cả trên PyTorch (CUDA hoặc CPU) nên image chỉ có một framework, không cần PaddlePaddle; dòng dài hơn 14 lần chiều cao chia tại khoảng trắng giữa các từ và thêm lề trước khi nhận dạng (VietOCR học trên đoạn ngắn, dòng dài bị cắt cụt hoặc bịa phần đuôi). Healthcheck báo thiết bị đang dùng và mô hình đã nạp chưa; chưa có trọng số thì `/ocr` trả 503 để actions thử lại sau. Tệp cần OCR: ảnh (JPEG, PNG; ô tải lên không nhận TIFF) luôn OCR; PDF chỉ OCR trang Tika không cho chữ (dưới khoảng 20 ký tự), tối đa 50 trang mỗi tệp. Nguồn là mọi tệp đính kèm `search-sync` đang đánh chỉ mục; văn bản OCR vào chỉ mục toàn văn, và vào chỉ mục đoạn RAG với tệp của tài liệu thư viện. Dịch vụ `ocr` không trạng thái (`POST /ocr` một trang ảnh trả văn bản và khung dòng, `POST /unload` gỡ mô hình); actions giữ **một hàng đợi chung** cho mọi việc của mô hình chính (lượt hỏi, trang OCR), chạy một việc một lúc, gỡ mô hình chính kia khi cần chỗ (Ollama `keep_alive: 0`, `ocr` `/unload`). Hết bộ nhớ khi OCR thì gỡ mô hình sinh nhàn rỗi rồi thử lại, vẫn hết thì đánh dấu lỗi và thử lại sau. Kết quả lưu ở bảng `core.attachment_ocr` (trạng thái `PENDING`/`RUNNING`/`DONE`/`ERROR`/`SKIPPED`, số trang, văn bản, lỗi) để đánh chỉ mục lại không phải OCR lại; tệp cũ được OCR bù. Cột văn bản OCR (`page_texts`) không theo CDC vào Lakehouse (Debezium `column.exclude.list`), giống nội dung tệp. Giao diện chỉ hiện nhãn trạng thái OCR ở danh sách tệp đính kèm và nút thử lại (người xem được tệp được thử lại, ghi nhật ký kiểm toán, chặn khi đang chờ hoặc đang chạy); văn bản OCR chỉ dùng để tìm. Job `ocr-init` tải trọng số PaddleOCR và VietOCR `vgg_transformer` vào volume lần đầu, sau đó chạy không cần Internet. Bật xoay hướng trang và dòng; thứ tự dòng trên xuống, trái sang phải; không dựng lại bảng, bố cục. CI kiểm actions bằng server `ocr` giả; chất lượng tiếng Việt kiểm bằng `scripts/ocr_smoke.sh` chạy tay (ngưỡng tạm CER dưới 5%). OCR điền form đề nghị mua sắm để sau
- **Lý do:** Người dùng yêu cầu chỉ nạp mô hình khi cần dùng tác tử AI hoặc quét OCR, để máy demo (8 GB VRAM, RAM hạn chế) không bị mô hình nhàn rỗi chiếm tài nguyên, và vẫn chạy được trên máy không có GPU. Gỡ mô hình nhàn rỗi thay vì đỗ trên CPU vì Ollama nạp lại qwen3:4b từ page cache chỉ vài giây. Không nạp mô hình sinh và bộ OCR cùng lúc để cả hai vừa 8 GB VRAM. VietOCR huấn luyện cho tiếng Việt nên đọc dấu tốt hơn mô hình Latin của PaddleOCR; cả hai đã có trong kiến trúc
- **Đã loại:** Bắt buộc GPU, AI nằm trong profile `ai` (bản đầu của ADR này: máy không có GPU mất AI, ngược hướng ADR #51 sau khi bỏ profile); chặn mô hình chính chia lớp sang CPU và cho lượt hỏi "chờ GPU" (lượt hỏi kẹt khi máy không có GPU); giữ mô hình thường trực trong bộ nhớ (chiếm 4–5 GB lúc nhàn rỗi); giữ riêng bge-m3 thường trực bằng `keep_alive: -1` (chiếm 660 MB VRAM nhàn rỗi để nhanh thêm khoảng 2,6 giây khi nạp lạnh, trong khi nạp song song đã đạt mục tiêu); đỗ mô hình nhàn rỗi trên CPU (phức tạp, lợi ít); PaddleOCR trọn gói (dấu tiếng Việt kém); mô hình thị giác–ngôn ngữ qua Ollama làm OCR (tranh VRAM với mô hình sinh, Ollama tự lùi CPU); trang công cụ OCR riêng; hàng đợi riêng trong dịch vụ `ocr` (hai bên tranh VRAM không ai điều phối); OCR lại mỗi lần đánh chỉ mục lại
- **Giới hạn hiện tại:** Lượt hỏi hoặc trang OCR đầu tiên sau khi nhàn rỗi chờ thêm thời gian nạp mô hình (chữ đầu tiên sau 4,7–6,4 giây trên RTX 4060 khi page cache còn nóng; tệp mô hình bị hệ điều hành thu hồi khỏi page cache vì thiếu RAM thì nạp lại từ đĩa, đo được 28 giây); chạy CPU chậm (30–90 giây mỗi lượt hỏi); image `ocr` khoảng 14 GB (PyTorch CUDA, dùng chung cho CPU); trọng số VietOCR chỉ có ở vocr.vn (máy chủ chậm, `ocr-init` tải nối tiếp và kiểm sha256); CER đo trên mẫu tổng hợp (báo giá in, quét nghiêng nhiễu, lật, xoay 90°) 0,6–3,5%, chưa đo trên bản quét thật; không đọc chữ viết tay
- **Bổ sung (22/10/2026):** Tối ưu tốc độ, đo trên RTX 4060 8 GB với tác tử mẫu bật dòng suy nghĩ. Lượt hỏi nhận về mà mô hình sinh chưa nạp (**nạp lạnh**) thì `ai-worker` gỡ bộ OCR rồi bảo Ollama nạp mô hình sinh (yêu cầu rỗng) **song song** với embedding và tìm kiếm, vì Ollama nạp tuần tự theo hàng đợi của nó nên bge-m3 và qwen3:4b không tranh nhau; chữ đầu tiên của lượt nạp lạnh giảm khoảng 1–2,5 giây, đổi lại câu bị `scope_guard` từ chối cũng làm nạp mô hình sinh. Khi khởi động, container `ollama` đọc tệp hai mô hình mặc định và dịch vụ `ocr` đọc trọng số OCR vào **page cache** của hệ điều hành (không nạp lên RAM tiến trình hay VRAM, kernel tự thu hồi khi cần), nên lần nạp đầu không đọc đĩa: nạp qwen3:4b từ 28,4 giây xuống 3,1 giây. `core.ai_question` ghi `first_token_at` và `cold_start` (migration 028); trang Quản trị tác tử AI hiện trung vị chữ đầu tiên và số lượt phải nạp mô hình. Giới hạn sinh 1024 token, 2048 khi tác tử bật dòng suy nghĩ (dòng suy nghĩ và câu trả lời dùng chung giới hạn); hết token mà chưa có câu trả lời thì lượt hỏi `error` kèm lời nhắn (trước đó là `done` với câu trả lời rỗng), có chữ nhưng bị cắt thì `done` kèm dấu "bị cắt". Mục tiêu tốc độ: mô hình đã nạp chữ đầu tiên dưới 2 giây và cả lượt dưới 10 giây (đo 0,2 và 7,6 giây, trung vị 15 lượt), nạp lạnh chữ đầu tiên dưới 8 giây (đo 4,7–6,4 giây); CPU chỉ đo. `AI_MIN_SCORE=0.7` giữ nguyên sau khi hiệu chỉnh bằng bộ 22 câu `scripts/ai_smoke_cases.json`: điểm cao nhất của câu ngoài phạm vi tối đa 0,672, của câu trong phạm vi tối thiểu 0,734. Câu cùng chủ đề nhưng tài liệu không nói tới (điểm 0,77–0,80) không tách được bằng ngưỡng, do mô hình trả lời "không tìm thấy"

(adr-53)=
## ADR #53: Dịch vụ Tầng 1 dùng thưa (Trino, Tika, Gotenberg) tự ngủ khi nhàn rỗi qua dịch vụ `sleeper`; JVM của dịch vụ chạy liên tục dùng GC nối tiếp

- **Ngày:** 23/10/2026
- **Quyết định:** Bổ sung [ADR #52](#adr-52) cho phần dịch vụ Tầng 1. Ba dịch vụ chỉ được gọi khi có việc: `trino` (báo cáo Lakehouse, ~1 GB heap), `tika` (trích văn bản khi đánh chỉ mục tệp đính kèm) và `gotenberg` (dựng PDF chứng từ, kèm Chromium) đổi tên thành `trino-core`, `tika-core`, `gotenberg-core` và **ngủ khi nhàn rỗi**. Dịch vụ `sleeper` (Python thuần thư viện chuẩn) giữ tên mạng cũ `trino`, `tika`, `gotenberg` cùng cổng công bố trên máy chủ, nên `TRINO_URL`, `TIKA_URL`, `GOTENBERG_URL` không đổi. Khi nhận byte đầu tiên của một kết nối, `sleeper` gọi Docker Engine API start container thật, chờ healthcheck báo `healthy` (tối đa `SLEEPER_WAKE_TIMEOUT`, mặc định 180 giây) rồi chuyển tiếp nguyên byte TCP (TLS của Trino vẫn đầu-cuối, chứng chỉ CN `trino` giữ nguyên). Không có byte nào qua proxy quá `SLEEPER_IDLE_SECONDS` (mặc định 300 giây) thì stop container và đóng các kết nối giữ sống còn lại; container vừa được compose khởi động thì tính từ lúc `StartedAt`. Thăm dò TCP không gửi byte (kiểm tra cổng) không đánh thức. Nhiều yêu cầu đến cùng lúc chỉ start một lần. `GET :9000/healthz` cho healthcheck, `GET :9000/status` cho biết dịch vụ nào đang chạy. Dịch vụ chạy liên tục (Keycloak, Flowable, Kafka, Debezium, Tika) đổi sang GC nối tiếp (`-XX:+UseSerialGC`) và `MALLOC_ARENA_MAX=2`; heap tối đa giữ nguyên.
- **Lý do:** Trino, Tika, Gotenberg chiếm RAM nền (ước tính 1,5–2 GB, chưa đo trên máy thật) cả khi cả ngày không ai chạy báo cáo, tải tệp hay xuất PDF, còn người dùng chấp nhận chờ ở lần đầu (thời gian khởi động ước tính 20–40 giây với Trino, dưới 15 giây với Tika và Gotenberg, chưa đo; các máy khách đều có thời gian chờ từ 60 giây, riêng Gotenberg đúng 60 giây). Proxy TCP đứng ngoài, không phải sửa mã của `actions` và của Trino. G1 nhiều luồng và vùng đệm riêng mỗi vùng heap tốn thêm bộ nhớ gốc không cần cho heap dưới 512 MB.
- **Đánh đổi:** `sleeper` cần gắn `/var/run/docker.sock`, tương đương quyền root trên máy chủ; giảm rủi ro bằng cách chỉ sleeper được gắn, bỏ mọi capability, `no-new-privileges`, hệ tệp chỉ đọc, và mã chỉ gọi inspect/start/stop trên container có nhãn compose thuộc `SLEEPER_TARGETS`. Triển khai không cho phép gắn socket (Kubernetes, tuân thủ chặt) bỏ `sleeper`, đặt lại tên `trino`, `tika`, `gotenberg` cho ba dịch vụ thật và công bố cổng như cũ. Lần gọi đầu sau khi ngủ chậm thêm thời gian khởi động.
- **Đã loại:** Cho ngủ Keycloak, Hasura, Flowable, `actions` (nằm trên đường đăng nhập và `flow-sync` thăm dò Flowable liên tục), Kafka và Debezium (giữ replication slot; dừng lâu thì WAL phình tới `max_slot_wal_keep_size` rồi mất slot, phải chụp lại toàn bộ); Meilisearch (`search-sync` ghi liên tục, bản thân chỉ vài trăm MB); ClamAV (nạp chữ ký 1–2 phút, mỗi lần tải tệp sẽ chờ quá lâu; vẫn nằm trong profile `scan`); thêm đặt `mem_limit` cứng cho JVM khi chưa đo (nguy cơ bị OOM-kill); đánh thức bằng nút bấm trên giao diện (người dùng phải biết dịch vụ nào cần dậy); dùng `docker compose` hay Docker CLI trong sleeper (thêm gói phụ thuộc, API qua socket là đủ).

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
