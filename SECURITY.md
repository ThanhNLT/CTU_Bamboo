# Chính sách bảo mật

## Báo lỗ hổng

Đừng báo lỗ hổng bảo mật qua issue công khai. Dùng tính năng **Report a vulnerability** (GitHub Security Advisories) trong tab *Security* của kho mã, mô tả:

- thành phần bị ảnh hưởng (dịch vụ, tệp, phiên bản hoặc commit);
- cách tái hiện, tác động (đọc chéo tenant, leo thang quyền, lộ secret...);
- đề xuất khắc phục nếu có.

Nhóm phản hồi trong vòng 3 ngày làm việc, thống nhất thời điểm công bố sau khi có bản sửa và ghi nhận người báo trong CHANGELOG (nếu người báo đồng ý).

## Phiên bản được hỗ trợ

Dự án đang ở giai đoạn trước 1.0: chỉ bản phát hành mới nhất và nhánh `main` nhận bản sửa bảo mật.

## Phạm vi

Trong phạm vi: mã trong kho (dịch vụ Python, giao diện, migration CSDL, cấu hình cổng API, Keycloak, Hasura, OpenBao, SeaweedFS trong `compose.yaml`, `infra/compose/` và `infra/platform/`), image phát hành trên `ghcr.io/thanhnlt/bamboo-*`.

Ngoài phạm vi: lỗ hổng của phần mềm bên thứ ba chưa sửa ở upstream (báo cho dự án đó), cấu hình dev mặc định khi chưa đặt `BAMBOO_ENV=production`, tài khoản và dữ liệu demo.

## Cơ chế bảo mật hiện có

| Lớp | Cơ chế | Tài liệu |
|---|---|---|
| Biên mạng | Cổng API APISIX là điểm vào duy nhất: token kiểm tại biên, WAF Coraza/OWASP CRS, giới hạn tần suất, chặn realm quản trị và API nội bộ | ADR #34 |
| Xác thực | Keycloak (OIDC, PKCE), OTP bắt buộc cho quản trị nền tảng | ADR #6, #32 |
| Cách ly tenant | Khóa kép `(tenant_id, id)` trong CSDL; mỗi phiên đúng một tenant | ADR #14, #30 |
| Phân quyền | Quyền gắn vị trí, kiểm tra trong CSDL (`can_read`), Hasura chỉ là lớp API | ADR #5, #24 |
| CSDL | Mỗi dịch vụ một tài khoản không phải superuser; ứng dụng chỉ đọc được nhật ký kiểm toán, không đổi được cấu trúc | ADR #35 |
| Secret | OpenBao, AppRole đặc quyền tối thiểu theo dịch vụ; khóa S3 do két sinh | ADR #25 |
| Tệp đính kèm | Bucket cách ly, link có chữ ký, kiểm tra kích thước và chữ ký đầu tệp, quét ClamAV | ADR #26 |
| Toàn vẹn dữ liệu | Nhật ký kiểm toán nối chuỗi hash theo tenant, chỉ ghi thêm | ADR #18, #33 |
| Cấu hình | `BAMBOO_ENV=production` từ chối khởi động khi còn mật khẩu mặc định; container ứng dụng chạy không cần root | [Triển khai](docs/van-hanh/trien-khai.md) |
| Chuỗi cung ứng | Phiên bản phụ thuộc ghim (`constraints.txt`, `pnpm-lock.yaml`), kiểm tra giấy phép trong CI | NOTICE |
