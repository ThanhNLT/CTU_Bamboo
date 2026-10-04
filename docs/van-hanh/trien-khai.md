# Triển khai production

Máy dev chạy `docker compose up -d` với cấu hình mặc định là đủ. Trang này dành cho môi trường có người dùng thật: những gì **bắt buộc** đổi, cách đặt sau tên miền HTTPS, nâng cấp, sao lưu.

## 1. Yêu cầu

| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 16 GB (thêm 2 GB nếu bật ClamAV) |
| Đĩa | 20 GB SSD | 50 GB SSD, tách volume dữ liệu |
| Phần mềm | Docker Engine 24+, Docker Compose 2.34+ | |
| Kiến trúc | amd64 hoặc arm64 (image PostGIS chạy qua giả lập trên arm64) | amd64 |

## 2. Danh sách kiểm tra trước khi mở cho người dùng

| # | Việc | Cách làm |
|---|---|---|
| 1 | Bật chế độ production | `BAMBOO_ENV=production` trong `.env`. `openbao-init` từ chối chạy (và không dịch vụ nào khởi động) nếu còn bất kỳ mật khẩu mặc định nào |
| 2 | Đổi mọi secret | Các biến đánh dấu `[BẮT BUỘC]` trong `.env.example`; dùng chuỗi ngẫu nhiên dài (`openssl rand -base64 32`) |
| 3 | Tắt dữ liệu demo | `SEED_DEMO=false`; xóa hoặc vô hiệu hóa tài khoản demo trong Keycloak sau lần import đầu (realm có sẵn tài khoản demo) |
| 4 | Tên miền HTTPS | Đặt `WEB_ORIGIN`, `KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT` là địa chỉ HTTPS công khai (mục 3) |
| 5 | Keycloak chế độ production | `KEYCLOAK_MODE=start` (bắt buộc đi sau reverse proxy TLS) |
| 6 | Redirect URI của ứng dụng | Keycloak → realm `bms` → Clients → `bms-web`: thêm `https://<tên miền web>/*` vào *Valid redirect URIs* và `https://<tên miền web>` vào *Web origins* |
| 7 | Tắt Hasura Console | `HASURA_ENABLE_CONSOLE=false` (metadata quản lý trong Git, job `bootstrap` nạp) |
| 8 | Quét virus | `docker compose --profile scan up -d` và `CLAMAV_HOST=clamav` |
| 9 | Sao lưu | Lịch sao lưu theo mục 5, thử khôi phục ít nhất một lần |
| 10 | Khóa OpenBao | Sao lưu volume `openbao-keys` tách biệt, giới hạn quyền truy cập máy chủ (mục 6) |

## 3. Tên miền và TLS

Mọi cổng trong `docker-compose.yml` chỉ mở trên `127.0.0.1`; đặt một reverse proxy kết thúc TLS phía trước. Trình duyệt cần bốn địa chỉ:

| Tên miền (ví dụ) | Chuyển tới | Ghi chú |
|---|---|---|
| `app.example.vn` | `127.0.0.1:5173` | Ứng dụng web (`WEB_ORIGIN`) |
| `sso.example.vn` | `127.0.0.1:8080` | Keycloak (`KEYCLOAK_URL`); gửi kèm `X-Forwarded-*` |
| `api.example.vn` | `127.0.0.1:8081` | Hasura (`HASURA_PUBLIC_URL=https://api.example.vn/v1/graphql`); cho phép nâng cấp websocket |
| `files.example.vn` | `127.0.0.1:8333` | SeaweedFS S3 (`S3_PUBLIC_ENDPOINT`); cho phép thân request 25 MB |

Ví dụ với Caddy (tự lấy chứng chỉ Let's Encrypt, tự chuyển tiếp websocket và `X-Forwarded-*`):

```text
app.example.vn   { reverse_proxy 127.0.0.1:5173 }
sso.example.vn   { reverse_proxy 127.0.0.1:8080 }
api.example.vn   { reverse_proxy 127.0.0.1:8081 }
files.example.vn {
    request_body { max_size 30MB }
    reverse_proxy 127.0.0.1:8333
}
```

Image `web` đọc địa chỉ Keycloak và Hasura lúc khởi động (`KEYCLOAK_URL`, `HASURA_PUBLIC_URL` → `/config.js`), nên cùng một image dựng sẵn chạy được trên mọi tên miền mà không cần build lại. Trong kế hoạch, APISIX sẽ thay vai trò reverse proxy này (gom về một tên miền, thêm WAF, giới hạn tần suất).

## 4. Chạy và nâng cấp

Chạy bằng image dựng sẵn (không cần mã nguồn), trong thư mục có `.env`:

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.1.0 up -d -y
```

Nâng cấp lên phiên bản mới: **sao lưu trước** (mục 5), rồi chạy lại lệnh trên với số phiên bản mới. Job `migrate` chỉ chạy các migration chưa chạy (bảng `public.schema_migration`), `bootstrap` nạp lại metadata Hasura và deploy BPMN khi nội dung đổi. Migration chỉ đi tiến: muốn quay về bản cũ thì khôi phục bản sao lưu.

Theo dõi: `docker compose -p bamboo ps` (dịch vụ chạy lâu phải `healthy`, job khởi tạo `exited (0)`), `docker compose -p bamboo logs -f <dịch vụ>`. Log mỗi container xoay vòng 3 tệp × 10 MB.

## 5. Sao lưu và khôi phục

| Dữ liệu | Nằm ở | Cách sao lưu |
|---|---|---|
| CSDL `bms`, `keycloak`, `flowable`, `hasura_meta` | volume `pgdata` | `pg_dumpall` (nhất quán khi đang chạy) |
| Secret, khóa S3, khóa mã hóa PII | volume `openbao-data` **và** `openbao-keys` | Sao lưu cả hai cùng lúc: thiếu `openbao-keys` thì không unseal được `openbao-data` |
| Tệp đính kèm | volume `seaweedfs-data` | Dừng `seaweedfs` rồi nén volume, hoặc đồng bộ bucket bằng công cụ S3 |

```bash
# CSDL (khi hệ thống đang chạy)
docker compose -p bamboo exec -T db pg_dumpall -U bms | gzip > bamboo-db-$(date +%F).sql.gz

# Volume OpenBao và SeaweedFS (dừng hai dịch vụ này trong lúc sao lưu)
docker compose -p bamboo stop openbao seaweedfs
for v in openbao-data openbao-keys seaweedfs-data; do
  docker run --rm -v bamboo_$v:/v:ro -v "$PWD":/b alpine tar czf /b/bamboo-$v-$(date +%F).tgz -C /v .
done
docker compose -p bamboo start openbao seaweedfs && docker compose -p bamboo up -d   # openbao-init unseal lại
```

Khôi phục trên máy mới: tạo volume và giải nén từng tệp `.tgz` vào đúng volume, chạy `docker compose ... up -d db`, nạp CSDL bằng `gunzip -c bamboo-db-*.sql.gz | docker compose -p bamboo exec -T db psql -U bms -d postgres`, rồi `up -d` toàn bộ.

## 6. Khóa OpenBao

`openbao-init` khởi tạo OpenBao với một khóa unseal và lưu khóa cùng root token trong volume `openbao-keys` để tự unseal mỗi lần khởi động. Cách này phù hợp demo và máy chủ một node; ai đọc được volume này thì đọc được mọi secret. Giảm rủi ro:

- chỉ quản trị viên được truy cập máy chủ và Docker (nhóm `docker` tương đương root);
- sao lưu `openbao-keys` tách khỏi `openbao-data`, mã hóa bản sao lưu;
- môi trường nhiều node hoặc yêu cầu cao: chuyển sang auto-unseal (KMS/HSM) và External Secrets Operator trên Kubernetes (lộ trình GitOps, [ADR #25](#adr-25)).

## 7. Cổng và dịch vụ

| Dịch vụ | Cổng (chỉ 127.0.0.1) | Công khai qua proxy | Vai trò |
|---|---|---|---|
| `web` | 5173 | Có | Ứng dụng Refine (nginx) |
| `keycloak` | 8080 | Có | Đăng nhập, quản lý tài khoản |
| `hasura` | 8081 | Có (`/v1/graphql`) | API GraphQL; Console tắt ở production |
| `seaweedfs` | 8333 | Có | Tải tệp qua link có chữ ký |
| `flowable` | 8082 | Không | Động cơ BPMN, chỉ dịch vụ `actions` gọi |
| `openbao` | 8200 | Không | Két secret |
| `db` | 5432 | Không | PostgreSQL |
| `actions`, `flow-sync` | không mở | Không | Hasura Actions, auth webhook, đồng bộ Flowable |
