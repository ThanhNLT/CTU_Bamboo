# Lịch sử thay đổi

Mọi thay đổi đáng kể của dự án được ghi ở đây. Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## [Chưa phát hành]

**Nâng cấp:** container `db` khởi động lại một lần với `wal_level=logical`. Triển khai thật đặt thêm `CDC_DB_PASSWORD`, `LAKEHOUSE_DB_PASSWORD`. Cần thêm khoảng 1,1 GB RAM cho Kafka, Debezium và lakehouse-sink.

### Thêm
- Phiếu đề nghị mua sắm dạng PDF (ADR #37): query `get_purchase_request_pdf` trả link tải phiếu khổ A4 gồm thông tin đề nghị, dòng hàng, tổng tiền bằng chữ, chuỗi phê duyệt, chữ chìm trạng thái khi chưa duyệt, chân trang có số chứng từ, mã kiểm tra và số trang. Chỉ người xem được chứng từ mới in được; cùng nội dung thì dùng lại tệp đã in. Dịch vụ mới `gotenberg` (bản Chromium, chỉ mạng nội bộ, chặn mọi truy cập mạng khi in).
- Giao diện nối nốt các Action còn thiếu: trang **Tìm kiếm** `/i/search` (gõ tới đâu tìm tới đó, lọc đề nghị/tệp đính kèm, đoạn trích tô chữ khớp, tải tệp khớp, từ khóa giữ trên URL); nút **In phiếu** trên chi tiết đề nghị tải PDF `<số chứng từ>.pdf`; trang **Sơ đồ quy trình** `/p/process/:id` vẽ BPMN bằng bpmn-js, tô bước đang chạy và bước đã qua, kèm danh sách bước duyệt. bpmn-js tách chunk riêng, chỉ tải khi mở sơ đồ.
- CDC (ADR #38): Debezium Server đọc WAL logic của CSDL `bms` và ghi mọi thay đổi của các schema nghiệp vụ vào Kafka (KRaft một node), topic `bms.<schema>.<bảng>` dạng JSON; lần đầu chụp ảnh toàn bộ. Migration 012: publication `bms_cdc` theo schema (bảng mới tự vào), không gồm nhật ký kiểm toán và hàng đợi tìm kiếm; role `bamboo_cdc` chỉ đọc có quyền replication; nhịp tim 10 giây để replication slot không giữ WAL, giới hạn 1 GB WAL cho slot.
- Lakehouse bronze (ADR #39): dịch vụ `lakehouse-sink` ghi mọi thay đổi từ Kafka vào bảng Iceberg `bronze.<schema>_<bảng>` (lịch sử đầy đủ, kể cả dòng đã sửa, xóa ở CSDL nghiệp vụ) trên bucket `bms-lakehouse`, phân vùng theo ngày; catalog JDBC ở CSDL `lakehouse`. Ghi đúng một lần nhờ lưu vị trí Kafka trong snapshot Iceberg. Image mới `bamboo-lakehouse`.

## [0.3.0] - 2026-10-05

Tìm kiếm toàn văn, mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu, đăng nhập được sau khi nâng cấp. Gồm cả các sửa lỗi ghi ở mục 0.2.1 trước đây (chưa từng phát hành riêng).

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.3.0 up -d -y   # mở http://localhost:8000
```

**Nâng cấp từ 0.1.0 hoặc 0.2.0:** sao lưu (`scripts/ops/backup.sh` hoặc `scripts\ops\backup.ps1`), rồi chạy lệnh trên (hoặc `git pull && docker compose up -d --build` khi chạy từ mã nguồn). Dữ liệu demo giữ nguyên:
- Job `migrate` tự tạo tài khoản CSDL cho từng dịch vụ và chuyển chủ sở hữu CSDL Keycloak, Flowable, metadata Hasura sang tài khoản mới. Triển khai thật (`BAMBOO_ENV=production`) phải đặt thêm `HASURA_DB_PASSWORD`, `ACTIONS_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `FLOWABLE_DB_PASSWORD`; máy dev dùng giá trị mặc định.
- Migration `011` đánh dấu mọi đề nghị và tệp sạch hiện có; `search-sync` đưa vào chỉ mục tìm kiếm trong lần chạy đầu. Cần thêm khoảng 300 MB RAM cho Meilisearch và Tika.
- Image cũ trên máy chạy với tệp compose mới thì Hasura, Keycloak, Flowable khởi động lại liên tục (`password authentication failed`): kéo image mới (`docker compose pull`) hoặc build lại (`--build`).

### Thêm
- Tìm kiếm toàn văn (ADR #36): Action `search_documents` tìm đề nghị mua sắm (số chứng từ, tiêu đề, mô tả, dòng hàng, nhà cung cấp, người lập, đơn vị) và nội dung tệp đính kèm đã kiểm tra (PDF, DOCX, XLSX, TXT); gõ tiếng Việt không dấu vẫn tìm được, đoạn trích đánh dấu chữ khớp. Chỉ trả chứng từ người gọi xem được: quyền kiểm tra lại trong CSDL cho từng kết quả. Dịch vụ mới `meilisearch` (bản Community, MIT), `tika` (trích chữ) và `search-sync` (đồng bộ CSDL → chỉ mục bằng trigger, tự dựng lại chỉ mục trống). Khóa chủ Meilisearch do OpenBao sinh; khóa chỉ tìm cho `actions`, khóa ghi chỉ mục và định danh S3 chỉ đọc cho `search-sync` (AppRole `search`).
- Script sao lưu `scripts/ops/backup.sh` và `scripts/ops/backup.ps1`: CSDL (`pg_dumpall`), két OpenBao (dữ liệu và khóa), tệp đính kèm SeaweedFS.

### Thay đổi
- SeaweedFS tự nạp lại định danh S3 khi `openbao-init` ghi `s3.json` mới (healthcheck gửi `SIGHUP`), không phải khởi động lại khi nâng cấp.

### Sửa
- Keycloak báo `Invalid parameter: redirect_uri` sau khi nâng cấp 0.1.0 → 0.2.0: realm đã import ở lần chạy đầu giữ redirect URI cũ (`http://localhost:5173`). Job `bootstrap` nay bổ sung `WEB_ORIGIN` vào redirect URI, web origin và URI sau đăng xuất của client `bms-web` qua Admin API mỗi lần khởi động (chỉ thêm, không xóa; tài khoản quản trị đọc từ OpenBao `bms/keycloak`).

### Bảo mật
- Mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu thay cho superuser `bms` (ADR #35): Hasura và actions chỉ đọc/ghi dữ liệu nghiệp vụ, không đổi cấu trúc, không TRUNCATE, không chạy lệnh trên máy chủ CSDL; Keycloak, Flowable, Hasura (metadata) là chủ CSDL riêng của mình và chỉ chủ sở hữu kết nối được. Nhật ký kiểm toán chỉ đọc với ứng dụng: trigger ghi chuỗi hash chạy `SECURITY DEFINER`, ứng dụng không tự ghi, sửa, xóa hay tắt trigger chỉ-ghi-thêm được. Kiểm thử `db/tests/bms_100_vai_tro.sql`; kiểm thử tích hợp chạy actions và Hasura bằng tài khoản ứng dụng.

## [0.2.0] - 2026-10-04

Cổng API Apache APISIX trở thành điểm vào duy nhất của hệ thống.

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.2.0 up -d -y   # mở http://localhost:8000
```

**Nâng cấp từ 0.1.0:** địa chỉ ứng dụng đổi từ `http://localhost:5173` sang `http://localhost:8000`. Keycloak chỉ import realm ở lần chạy đầu, nên máy đã chạy 0.1.0 cần thêm `http://localhost:8000/*` vào *Valid redirect URIs* và `http://localhost:8000` vào *Web origins* của client `bms-web` trong Keycloak (từ 0.3.0 việc này tự động, xem trên). Triển khai thật: một tên miền trỏ vào cổng và đặt `WEB_ORIGIN`, `KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT`, `CORS_ORIGINS` theo tên miền đó.

### Thêm
- Cổng API Apache APISIX là điểm vào duy nhất từ trình duyệt (`http://localhost:8000`, ADR #34): định tuyến tới web, Keycloak, Hasura, SeaweedFS; token Keycloak kiểm tại biên (`forward-auth`); WAF Coraza với OWASP CRS; giới hạn tần suất GraphQL và đăng nhập; chặn realm quản trị Keycloak, Hasura Admin API và thao tác S3 ngoài hai bucket của ứng dụng; `X-Request-Id`, số liệu Prometheus nội bộ. Image `bamboo-gateway`, kiểm thử `make test-gateway`.

### Thay đổi
- Web và SeaweedFS không còn mở cổng ra ngoài; địa chỉ công khai mặc định chuyển sang cổng API (`KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`); giao diện gọi API cùng origin; redirect URI của Keycloak lấy từ `WEB_ORIGIN` khi import realm. Trang quản trị Keycloak tách riêng ở cổng 8080.

## [0.1.0] - 2026-10-04

Bản phát hành đầu tiên: nền tảng lõi (Keycloak, Hasura, PostgreSQL, Flowable, SeaweedFS, OpenBao) và ứng dụng Đề nghị mua sắm cho kịch bản Tập đoàn X, chạy bằng một lệnh.

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.1.0 up -d -y
```

### Thêm
- Cơ cấu tổ chức là dữ liệu: đơn vị (cây `ltree`), vị trí, người, bốn loại bổ nhiệm (giữ chính, kiêm nhiệm, quyền trưởng, hợp đồng), vai trò, ủy quyền một phần; khóa kép chặn tham chiếu chéo tenant (ADR #5, #14, #29, #30).
- Chuỗi duyệt chốt theo vị trí, tìm người khi đến bước; đẩy lên cấp trên, gộp bước, chuyển việc khi bổ nhiệm thay đổi; hạn mức duyệt theo loại đơn vị (ADR #17, #28).
- Lớp API Hasura sinh metadata tự động, quyền xem chi tiết bằng computed field `can_read`; Hasura Actions gửi duyệt, duyệt/từ chối/trả về; Flowable phản chiếu luồng duyệt qua `flow-sync` (ADR #24, #31).
- Keycloak chỉ xác thực, Hasura xác thực bằng webhook (token + tenant đã chọn); một tài khoản cho nhiều tenant cùng công ty mẹ; dữ liệu demo Tập đoàn X và realm sinh tự động (ADR #23, #30, #32).
- Mua sắm: nhà cung cấp, vật tư, số chứng từ `PR-YYYY-NNNNNN`, dòng hàng (tổng tiền tự tính, khóa sau khi gửi duyệt), người lập hủy đề nghị.
- Nhật ký kiểm toán nối chuỗi hash theo tenant, chỉ ghi thêm, Action `verify_audit_chain` (ADR #18, #33).
- Bình luận (nhắc tên, trả lời, xóa mềm) và thông báo sinh bằng trigger + `pg_notify` (ADR #20).
- Tệp đính kèm qua SeaweedFS: link có chữ ký vào bucket cách ly, kiểm tra kích thước và chữ ký đầu tệp, sha256, quét ClamAV tùy chọn (ADR #26).
- OpenBao lưu bền: khởi tạo/unseal tự động, AppRole đặc quyền tối thiểu cho từng dịch vụ, khóa S3 do két sinh, transit mã hóa PII (ADR #25).
- Action `process_state` trả sơ đồ BPMN và bước hiện tại cho bpmn-js.
- Ứng dụng Refine (Tầng 2) nối với backend: đăng nhập Keycloak, chọn tenant cho tài khoản nhiều tenant, danh sách/lập/sửa/chi tiết đề nghị mua sắm kèm dòng hàng, gửi duyệt, hủy, chuỗi duyệt và lịch sử, tệp đính kèm (hiện kết quả kiểm tra, quét virus), trao đổi, hộp việc duyệt (cả duyệt thay), chuông thông báo tự cập nhật, nhật ký kiểm toán và đối soát chuỗi hash; menu theo quyền thật; giao diện tiếng Việt.
- Kiểm thử đầu–cuối bằng Playwright (`npm run test:e2e`) trên stack thật.
- Toàn bộ hệ thống chạy bằng một lệnh `docker compose up -d`: healthcheck cho mọi dịch vụ chạy lâu, khởi động theo trạng thái healthy, tự khởi động lại (ADR #13).
- README, NOTICE, `.env.example`, header SPDX cho mọi tệp (chuẩn REUSE 3.3).
- Image dựng sẵn trên GHCR (amd64 + arm64) và tệp compose phát hành dạng OCI artifact: `docker compose -f oci://ghcr.io/thanhnlt/bamboo:<phiên bản> up -d -y` chạy toàn bộ hệ thống không cần mã nguồn; migration, realm Keycloak, cấu hình OpenBao đóng gói vào image.

- Sẵn sàng production: `BAMBOO_ENV=production` từ chối khởi động khi còn mật khẩu mặc định; container Python chạy bằng uid 10001; image `web` đọc địa chỉ Keycloak/Hasura lúc khởi động (`/config.js`); nginx nén gzip, header bảo mật, không cache `index.html`; xoay vòng log mọi container; Hasura Console và CORS, địa chỉ và chế độ chạy Keycloak cấu hình được; nhãn OCI cho mọi image.
- Tài liệu triển khai production (tên miền TLS, sao lưu/khôi phục, nâng cấp, khóa OpenBao), SECURITY.md, mẫu báo lỗi và đề xuất trên GitHub Issues.

### Sửa
- Frontend gọi Keycloak/Hasura demo bên ngoài thay vì stack của dự án; 12 lỗi ESLint.
- Gỡ trang mẫu blog, `axios`, `@uiw/react-md-editor` không dùng; tách thư viện vào chunk `vendor` riêng (mã ứng dụng 45 kB, đổi mã không phải tải lại thư viện).
- Gỡ `@refinedev/devtools` (kéo theo gói `@aliemir/dom-to-fiber-utils` không có giấy phép) và các gói `@typescript-eslint` v5 xung đột với ESLint 9; chuyển `@refinedev/cli` sang devDependencies.
- Dockerfile giao diện: Node 22 (react-router 7 cần Node ≥ 20), phục vụ bằng nginx có fallback định tuyến SPA.
- `openbao-init` chờ `sys/init` tới 5 phút (raft chậm, hết giờ giữa chừng là mất khóa) và dừng rõ ràng khi thiếu file khóa.
- `.dockerignore` để build image Python không gửi `node_modules` và tài liệu vào build context.

[Chưa phát hành]: https://github.com/ThanhNLT/Bamboo/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ThanhNLT/Bamboo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ThanhNLT/Bamboo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ThanhNLT/Bamboo/releases/tag/v0.1.0
