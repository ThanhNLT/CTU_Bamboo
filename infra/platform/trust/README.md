<!--
  Bamboo - DX-OS Open-Core
  @version 0.4.0
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/CTUBamboo/Bamboo, Bamboo project
-->

# Chứng thư gốc tin cậy cho chữ ký số doanh nghiệp

Trang khởi tạo công ty và trang **Thông tin công ty** chỉ chấp nhận đơn ký bằng chữ ký số có chuỗi chứng thư dẫn tới một
chứng thư gốc đặt trong thư mục này (ADR #57). Ở Việt Nam, chứng thư số công cộng của doanh nghiệp (VNPT-CA, Viettel-CA,
FPT-CA, BKAV-CA...) đều do **Root CA quốc gia** của Trung tâm Chứng thực điện tử quốc gia (NEAC) cấp quyền.

1. Tải chứng thư Root CA quốc gia từ trang chính thức của NEAC (rootca.gov.vn), mọi thế hệ đang còn hiệu lực.
2. Đối chiếu dấu vân tay (SHA-256) với dấu vân tay NEAC công bố.
3. Chép các tệp `.crt`, `.cer` hoặc `.pem` (PEM hoặc DER) vào thư mục này, rồi dựng lại image `actions`:
   `docker compose up -d --build actions flow-sync`.

Dự án không đóng gói sẵn chứng thư gốc: người quản trị máy chủ tự tải và đối chiếu từ nguồn chính thức. Chưa có chứng thư
gốc thì trang khởi tạo vẫn cho tạo công ty ở trạng thái **chưa xác thực** (nếu `SETUP_ALLOW_UNVERIFIED=true`) để ký bổ sung
sau.
