# Lịch sử thay đổi

Mọi thay đổi đáng kể của dự án được ghi ở đây. Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## [Chưa phát hành]

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

[Chưa phát hành]: https://github.com/ThanhNLT/Bamboo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ThanhNLT/Bamboo/releases/tag/v0.1.0
