<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.0
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/CTUBamboo/Bamboo, Bamboo project

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

# Triển khai production

Máy dev chạy `docker compose up -d` với cấu hình mặc định là đủ. Trang này dành cho môi trường có người dùng thật: những gì **bắt buộc** đổi, cách đặt sau tên miền HTTPS, nâng cấp, sao lưu.

## 1. Yêu cầu

| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 16 GB (thêm 2 GB nếu bật ClamAV) |
| Đĩa | 20 GB SSD | 50 GB SSD, tách volume dữ liệu |
| Phần mềm | Docker Engine 25+, Docker Compose 2.40.2+ (chạy từ artifact OCI; các bản 2.34.0–2.40.1 có lỗ hổng CVE-2025-62725) | |
| Kiến trúc | amd64 hoặc arm64 (image PostGIS chạy qua giả lập trên arm64) | amd64 |

## 2. Danh sách kiểm tra trước khi mở cho người dùng

| # | Việc | Cách làm |
|---|---|---|
| 1 | Bật chế độ production | `BAMBOO_ENV=production` trong `.env`. `openbao-init` từ chối chạy (và không dịch vụ nào khởi động) nếu còn bất kỳ mật khẩu mặc định nào |
| 2 | Đổi mọi secret | Các biến đánh dấu `[BẮT BUỘC]` trong `.env.example`; dùng chuỗi ngẫu nhiên dài (`openssl rand -base64 32`) |
| 3 | Tắt dữ liệu demo | `SEED_DEMO=false` (kéo theo `SETUP_OPEN_SIGNUP=false`: trang đăng ký chỉ mở khi máy chưa có công ty); xóa hoặc vô hiệu hóa tài khoản demo trong Keycloak sau lần import đầu (realm có sẵn tài khoản demo). Tạo công ty và quản trị viên đầu tiên: [Khởi tạo cho một công ty mới](cong-ty-moi.md) |
| 4 | Tên miền HTTPS | Một tên miền trỏ vào cổng API; đặt `WEB_ORIGIN`, `KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT`, `CORS_ORIGINS` theo tên miền đó (mục 3) |
| 5 | Keycloak chế độ production | `KEYCLOAK_MODE=start` (bắt buộc đi sau reverse proxy TLS) |
| 6 | Redirect URI của ứng dụng | Job `bootstrap` tự bổ sung `WEB_ORIGIN` vào client `bms-web` mỗi lần khởi động (cả khi đổi tên miền sau lần import đầu). Giá trị cũ không bị xóa: gỡ `http://localhost:5173` (chỉ dùng cho `pnpm dev`) và tên miền cũ trong Keycloak → realm `bms` → Clients → `bms-web` |
| 7 | Tắt Hasura Console | `HASURA_ENABLE_CONSOLE=false` (metadata quản lý trong Git, job `bootstrap` nạp). Với `BAMBOO_ENV=production`, `openbao-init` từ chối chạy nếu Console còn bật (ADR #76) |
| 8 | Quét virus bằng ClamAV (bộ quét nội bộ và CDR luôn chạy, ClamAV quét thêm bằng cơ sở dữ liệu mẫu virus, ADR #70) | `make up` ở mức RAM 16 tự bật (`BAMBOO_CLAMAV=true` để bật ở mức 8); chạy tay: `docker compose --profile scan up -d` và `CLAMAV_HOST=clamav`; đặt `SCAN_REQUIRE_CLAMAV=true` để không nhận tệp khi thiếu ClamAV |
| 9 | Sao lưu | Lịch sao lưu theo mục 5, thử khôi phục ít nhất một lần |
| 10 | Khóa OpenBao | Sao lưu volume `openbao-keys` tách biệt, giới hạn quyền truy cập máy chủ (mục 6) |
| 11 | Tài khoản CSDL | Mỗi dịch vụ một role không phải superuser (ADR #35), mật khẩu `HASURA_DB_PASSWORD`, `ACTIONS_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `FLOWABLE_DB_PASSWORD`, `CDC_DB_PASSWORD` (Debezium), `LAKEHOUSE_DB_PASSWORD` (catalog Iceberg); superuser `bms` chỉ dùng cho `migrate`, `seed` và quản trị. Đổi mật khẩu: sửa `.env` rồi `docker compose up -d` (job `migrate` đặt lại mật khẩu, các dịch vụ khởi động lại với giá trị mới) |
| 12 | Trục dữ liệu (ADR #45) | Mật khẩu Kafka `DEBEZIUM_KAFKA_PASSWORD`, `LAKEHOUSE_KAFKA_PASSWORD` (Kafka từ chối client không có tài khoản, ACL theo tiền tố topic). Trino chỉ nhận đăng nhập qua HTTPS bằng chứng chỉ của CA nội bộ OpenBao; mật khẩu `bms-admin`, `bms-actions` do OpenBao sinh; người dùng tenant chỉ thấy dữ liệu của tenant mình (row filter). Không mở cổng 8085 của Trino ra ngoài máy chủ |
| 13 | Giám sát (ADR #75) | `GRAFANA_ADMIN_PASSWORD` riêng (bắt buộc với `BAMBOO_ENV=production`). Grafana `:3001`, Jaeger `:16686`, Prometheus `:9090` chỉ nghe 127.0.0.1: xem qua đường hầm SSH, không mở ra Internet. Mức RAM 8 bật bằng `BAMBOO_OBSERVABILITY=true` |
| 14 | Thiết bị OT qua MQTT (ADR #74, #76) | Thiết bị trong mạng OT dùng cổng TLS 8883: đặt `MQTT_BIND` bằng IP của mạng OT (không phải 0.0.0.0 trên máy có Internet), mở tường lửa chỉ cho dải thiết bị; phát CA nội bộ (`/mosquitto/tls/ca.crt`) cho thiết bị để kiểm chứng chỉ máy chủ. Tài khoản thiết bị tạo ở Cổng dịch vụ API → Thiết bị MQTT; sao lưu volume `mosquitto-data` (giữ tài khoản thiết bị) |

## 3. Tên miền và TLS

Trình duyệt chỉ cần **một địa chỉ**: cổng API APISIX ([ADR #34](#adr-34)), nghe `127.0.0.1:8000` (`GATEWAY_PORT`). Đặt một reverse proxy kết thúc TLS phía trước, trỏ một tên miền vào cổng này, rồi đặt `WEB_ORIGIN`, `KEYCLOAK_URL`, `S3_PUBLIC_ENDPOINT` bằng tên miền đó, `HASURA_PUBLIC_URL` bằng tên miền đó thêm `/graphql`, và `CORS_ORIGINS` chỉ còn tên miền đó.

Ví dụ với Caddy (tự lấy chứng chỉ Let's Encrypt, tự chuyển tiếp websocket và `X-Forwarded-*`):

```text
bamboo.example.vn {
    request_body { max_size 30MB }
    reverse_proxy 127.0.0.1:8000
}
```

Cổng API đã lo phần còn lại: chặn đường dẫn không khai báo, kiểm token tại biên, WAF, giới hạn tần suất, không lộ Hasura Admin API, realm quản trị Keycloak hay thao tác S3 ngoài hai bucket của ứng dụng. Image `web` gọi Keycloak và Hasura cùng origin với trang, nên cùng một image dựng sẵn chạy được trên mọi tên miền mà không cần build lại.

## 4. Chạy và nâng cấp

Chạy bằng image dựng sẵn (không cần mã nguồn), trong thư mục có `.env`:

```bash
docker compose -f oci://ghcr.io/ctubamboo/bamboo:0.3.0 up -d -y
```

Nâng cấp lên phiên bản mới: **sao lưu trước** (mục 5), rồi chạy lại lệnh trên với số phiên bản mới. Job `migrate` chỉ chạy các migration chưa chạy (bảng `public.schema_migration`), `bootstrap` nạp lại metadata Hasura, deploy BPMN khi nội dung đổi và bổ sung `WEB_ORIGIN` vào redirect URI của client `bms-web` trong Keycloak nếu còn thiếu (đổi tên miền không cần import lại realm; giá trị cũ được giữ, gỡ thủ công trong trang quản trị nếu muốn). Migration chỉ đi tiến: muốn quay về bản cũ thì khôi phục bản sao lưu.

Theo dõi: `docker compose -p bamboo ps` (dịch vụ chạy lâu phải `healthy`, job khởi tạo `exited (0)`), `docker compose -p bamboo logs -f <dịch vụ>`. Log mỗi container xoay vòng 3 tệp × 10 MB.

## 5. Sao lưu và khôi phục

| Dữ liệu | Nằm ở | Cách sao lưu |
|---|---|---|
| CSDL `bms`, `keycloak`, `flowable`, `hasura_meta`, `lakehouse` (catalog Iceberg) | volume `pgdata` | `pg_dumpall` (nhất quán khi đang chạy) |
| Secret, khóa S3, khóa mã hóa PII | volume `openbao-data` **và** `openbao-keys` | Sao lưu cả hai cùng lúc: thiếu `openbao-keys` thì không unseal được `openbao-data` |
| Tệp đính kèm, dữ liệu lakehouse (bucket `bms-lakehouse`) | volume `seaweedfs-data` | Dừng `seaweedfs` rồi nén volume, hoặc đồng bộ bucket bằng công cụ S3 |
| Sự kiện CDC | volume `kafka-data`, `debezium-data` | Không cần: Kafka chỉ giữ 7 ngày, CSDL là nguồn. Khôi phục CSDL thì xóa `debezium-data` và slot `bms_debezium` để Debezium chụp ảnh lại (Dịch vụ nền tảng mục 7) |
| Chỉ mục tìm kiếm | volume `meilisearch-data` | Không cần: dựng lại từ CSDL và tệp đính kèm. Khôi phục xong, xóa volume (hoặc gọi `SELECT search.mark_all()`), `search-sync` tự đưa lại toàn bộ vào chỉ mục |

Script có sẵn làm đủ ba mục trên vào thư mục `backups/<thời điểm>/` (`postgres.sql`, `openbao-data.tgz`, `openbao-keys.tgz`, `seaweedfs-data.tgz`). OpenBao và SeaweedFS chỉ bị tạm dừng (`pause`) trong vài giây lúc chép, không cần khởi động lại; không cần mã nguồn của hệ thống, chỉ cần tải script:

```bash
tools/ops/backup.sh                         # Linux, macOS
```

```powershell
powershell -ExecutionPolicy Bypass -File tools\ops\backup.ps1     # Windows
```

Làm thủ công:

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

Khôi phục trên máy mới: tạo volume và giải nén từng tệp `.tgz` vào đúng volume, chạy `docker compose ... up -d db`, nạp CSDL bằng `gunzip -c bamboo-db-*.sql.gz | docker compose -p bamboo exec -T db psql -U bms -d postgres` (bản của script: `docker compose -p bamboo cp postgres.sql db:/tmp/ && docker compose -p bamboo exec -T db psql -U bms -d postgres -f /tmp/postgres.sql`), rồi `up -d` toàn bộ.

### Sao lưu theo lịch, diễn tập khôi phục và GitOps

- Dịch vụ `backup` chạy `tools/ops/backup-db.sh` theo chu kỳ `BACKUP_INTERVAL_HOURS` (mặc định 24 giờ, giữ `BACKUP_KEEP` bản) vào volume `backups`, ghi kết quả vào `audit.backup_run` (xem ở `/admin/ops`, tab Sao lưu).
- `tools/ops/restore-drill.sh` khôi phục bản sao lưu mới nhất vào CSDL tạm rồi đối chiếu số dòng và chuỗi băm kiểm toán; nên chạy định kỳ để biết bản sao lưu còn dùng được.
- `tools/gitops/reconcile.sh` so cấu hình trong kho mã với trạng thái đang chạy và chỉ chạy `docker compose up -d` khi có thay đổi. Đặt vào cron hoặc systemd timer. Đây là đối chiếu bằng script, không phải Argo CD hay k3s.
- Thư mục thử mail: `mailpit` (cổng 8025 trên máy chủ) nhận thư khi chưa cấu hình `SMTP_HOST` thật.
- Gom log container: `COMPOSE_PROFILES=ai,logs` bật `vector`; log vào `obs.log_event`, xem ở `/admin/ops`, tab Nhật ký.

## 6. Khóa OpenBao

`openbao-init` khởi tạo OpenBao với một khóa unseal và lưu khóa cùng root token trong volume `openbao-keys` để tự unseal mỗi lần khởi động; dịch vụ `openbao-unseal` (chạy liên tục, đọc cùng volume, chỉ đọc) kiểm mỗi 5 giây và unseal lại khi container `openbao` khởi động lại ngoài `docker compose up` (khởi động lại máy, Docker). Cách này phù hợp demo và máy chủ một node; ai đọc được volume này thì đọc được mọi secret. Giảm rủi ro:

- chỉ quản trị viên được truy cập máy chủ và Docker (nhóm `docker` tương đương root);
- sao lưu `openbao-keys` tách khỏi `openbao-data`, mã hóa bản sao lưu;
- môi trường nhiều node hoặc yêu cầu cao: chuyển sang auto-unseal (KMS/HSM) và External Secrets Operator trên Kubernetes (lộ trình GitOps, [ADR #25](#adr-25)).

## 7. Cổng và dịch vụ

| Dịch vụ | Cổng trên máy chủ | Công khai | Vai trò |
|---|---|---|---|
| `gateway` | 8000 (`GATEWAY_PORT`) | **Có, điểm vào duy nhất** | Cổng API APISIX: định tuyến, WAF, token tại biên, giới hạn tần suất |
| `web` | 8088, chỉ 127.0.0.1 | Qua cổng (`/`) | Ứng dụng Refine (nginx); cổng 8088 chỉ để kiểm tra bản build |
| `keycloak` | 8080, chỉ 127.0.0.1 | Qua cổng (`/realms`, `/resources`) | Đăng nhập; cổng 8080 chỉ cho trang quản trị |
| `hasura` | 8081, chỉ 127.0.0.1 | Qua cổng (`/graphql`) | API GraphQL; cổng 8081 chỉ cho Console (tắt ở production) |
| `seaweedfs` | 8333 (S3), 9333 (master), 8888 (filer), chỉ 127.0.0.1 | Qua cổng (`/bms-quarantine`, `/bms-documents`) | Lưu tệp, link có chữ ký |
| `flowable` | 8082, chỉ 127.0.0.1 | Không | Động cơ BPMN, chỉ dịch vụ `actions` gọi |
| `openbao` | 8200, chỉ 127.0.0.1 | Không | Két secret |
| `db` | 5432, chỉ 127.0.0.1 | Không | PostgreSQL |
| `actions` | 8090, chỉ 127.0.0.1 | Không | Hasura Actions, auth webhook, kiểm token cho cổng |
| `meilisearch` | 7700, chỉ 127.0.0.1 | Không | Chỉ mục tìm kiếm (cần khóa API) |
| `tika`, `gotenberg` | 9998, 3000, chỉ 127.0.0.1 | Không | Trích văn bản tệp, in phiếu PDF |
| `kafka` | 19092 (listener `HOST`, SASL), chỉ 127.0.0.1 | Không | Trục sự kiện CDC; mạng nội bộ dùng `kafka:9092` |
| `debezium` | 8083, chỉ 127.0.0.1 | Không | CDC, `/q/health` |
| `trino` | 8085 (HTTPS), chỉ 127.0.0.1 | Không | Truy vấn Lakehouse |
| `clamav` (profile `scan`) | 3310, chỉ 127.0.0.1 | Không | Quét virus |
| `ollama` | 11434, chỉ 127.0.0.1 | Không | Mô hình AI cục bộ (mục 9) |
| `ocr` | 8866, chỉ 127.0.0.1 | Không | OCR tệp quét (mục 9) |
| `flow-sync`, `search-sync`, `lakehouse-sink`, `ai-worker` | không có (tiến trình nền, không nghe cổng) | Không | Đồng bộ Flowable, chỉ mục tìm kiếm, Lakehouse, trả lời lượt hỏi AI |

Mọi cổng trên máy chủ trừ `gateway` chỉ nghe `127.0.0.1` (truy cập từ chính máy chủ hoặc qua SSH tunnel); triển khai thật có thể bỏ các dòng `ports` của dịch vụ không cần quản trị trực tiếp.

Số liệu Prometheus của cổng: `gateway:9091/apisix/prometheus/metrics`, chỉ trong mạng nội bộ compose.

## 8. Bộ nhớ của các dịch vụ Java

Container không đặt giới hạn bộ nhớ, nên nếu để mặc định, JVM tự lấy heap theo tỉ lệ RAM của **cả máy chủ** (Keycloak lấy sẵn 50% từ lúc khởi động). Vì vậy compose ghim heap cho từng dịch vụ. Máy nhiều người dùng hơn thì tăng trong `.env`:

| Dịch vụ | Biến | Mặc định |
|---|---|---|
| `keycloak` | `KEYCLOAK_HEAP` | `-Xms64m -Xmx512m` |
| `tika-core` | `TIKA_JAVA_OPTS` | `-Xmx512m` |
| `debezium` | `DEBEZIUM_JAVA_OPTS` | `-Xms64m -Xmx384m` |
| `kafka` | `KAFKA_HEAP` | `-Xms128m -Xmx512m` |
| `trino-core` | `infra/platform/trino/jvm.config` | `-Xmx1G` |
| `flowable` | `FLOWABLE_JAVA_OPTS` | `-Xms64m -Xmx512m` |

**Mức RAM 8 / 16** ([ADR #54](#adr-54), sửa ở [ADR #69](#adr-69)): cả hai mức chạy đầy đủ, gồm AI và OCR. `make up` tự chọn theo RAM Docker thấy được (máy 16 GB dùng WSL2 mặc định thường chỉ thấy 8 GB: nâng bằng `memory=12GB` trong `%UserProfile%\.wslconfig` rồi `wsl --shutdown`). Chọn tay: `BAMBOO_RAM=8 make up` hoặc `BAMBOO_RAM=16 make up`, hoặc đặt `BAMBOO_RAM` trong `.env`. Mức 8 hạ heap JVM, Ollama chỉ giữ một mô hình trên RAM (`OLLAMA_MAX_LOADED_MODELS=1`, gỡ sau 2 phút nhàn rỗi), OCR và dịch vụ dùng thưa ngủ sau 120 giây. Chạy `docker compose up -d` trực tiếp dùng giá trị mặc định của mức 16; `OLLAMA_URL` để trống (cấu hình cũ) vẫn dùng Ollama trong compose.

**Dịch vụ dùng thưa tự ngủ** ([ADR #53](#adr-53)): `trino-core`, `tika-core`, `gotenberg-core` chỉ chạy khi có yêu cầu; `sleeper` giữ tên mạng và cổng cũ (`trino`, `tika`, `gotenberg`), đánh thức khi có byte đầu tiên và cho ngủ sau `SLEEPER_IDLE_SECONDS` (mặc định 300) không có lưu lượng. Lần gọi đầu sau khi ngủ chậm thêm thời gian khởi động container. Xem trạng thái bằng `docker compose ps` hoặc `docker compose exec sleeper python -c "import urllib.request as u; print(u.urlopen('http://127.0.0.1:9000/status').read().decode())"`. `sleeper` gắn `/var/run/docker.sock`; môi trường không cho phép thì bỏ `sleeper` và đặt lại tên ba dịch vụ thật như ADR #53 mô tả.

Các giới hạn bộ nhớ khác (đặt trong `.env`):

| Dịch vụ | Biến | Mặc định | Ghi chú |
|---|---|---|---|
| `keycloak` | `KEYCLOAK_DB_POOL` | `20` | Keycloak mặc định mở tới 100 kết nối, bằng cả `max_connections` của PostgreSQL |
| `hasura` | `pool_settings` trong metadata | 20 kết nối | Mặc định của Hasura là 50; mỗi kết nối PostgreSQL tốn RAM riêng |
| `meilisearch` | `MEILI_MAX_INDEXING_MEMORY` | `512 MiB` | Mặc định Meilisearch dùng tới 2/3 RAM máy khi lập chỉ mục |
| `gateway` | `GATEWAY_WORKERS` | `2` | Mặc định APISIX chạy một worker mỗi lõi CPU, mỗi worker nạp riêng WAF Coraza |
| `ollama` | `AI_KV_CACHE_TYPE` | `q8_0` | Bộ đệm ngữ cảnh 8K tốn nửa RAM/VRAM so với `f16` (cần flash attention, đã bật) |

Các tiến trình Python chạy với `MALLOC_ARENA_MAX=2` để glibc không tạo vùng heap riêng cho từng luồng. `lakehouse-sink` bỏ snapshot Iceberg cũ hơn 24 giờ mỗi giờ (giữ snapshot hiện tại chứa vị trí Kafka), nên siêu dữ liệu bảng không lớn dần; tệp manifest của snapshot đã bỏ vẫn nằm trên S3, dọn bằng Trino `ALTER TABLE lakehouse.bronze.<bảng> EXECUTE remove_orphan_files`.

## 9. AI cục bộ (ADR #51, #52)

Trợ lý RAG, tác tử AI (Ollama) và OCR tệp quét (dịch vụ `ocr`) khởi động cùng hệ thống bằng `docker compose up -d`. Mô hình đã có trong volume thì `ollama-init`, `ocr-init` bỏ qua, nên các lần sau chạy không cần Internet; tải lỗi chỉ ghi cảnh báo vào log, phần còn lại của hệ thống vẫn lên.

**Mô hình chỉ nạp khi có việc** ([ADR #52](#adr-52)): lúc nhàn rỗi Ollama và `ocr` không giữ mô hình nào trong RAM/VRAM. Có lượt hỏi thì Ollama nạp mô hình sinh, có trang quét thì `ocr` nạp bộ OCR; hết việc quá `AI_KEEP_ALIVE` (mặc định `5m`) với Ollama, `OCR_IDLE_SECONDS` (mặc định 300) với OCR thì tự gỡ. Bật GPU (bên dưới) thì mô hình nạp lên GPU, không thì chạy CPU.

```bash
docker compose up -d
docker compose logs -f ollama-init         # lần đầu tải ~3,7 GB (qwen3:4b ~2,5 GB, bge-m3 ~1,2 GB)
docker compose logs -f ocr-init            # lần đầu tải ~250 MB mô hình OCR (PaddleOCR, VietOCR)
curl 127.0.0.1:11434/api/tags              # thấy hai mô hình là xong
curl 127.0.0.1:8866/health                 # dịch vụ OCR: GPU hay CPU, mô hình đang nạp chưa
tools/ai_smoke.sh                          # 22 câu mẫu chấm bằng luật, in tốc độ (--cold: gỡ mô hình trước câu đầu)
tools/ocr_smoke.sh                         # OCR ảnh mẫu tiếng Việt, đo tỉ lệ lỗi ký tự
```

| Hạng mục | Giá trị |
|---|---|
| RAM / GPU | Chỉ chiếm khi có việc: qwen3:4b ~3 GB (kèm ngữ cảnh 8K), bộ OCR ~0,4 GB, bge-m3 ~1,2 GB. GPU tùy chọn: NVIDIA từ 8 GB VRAM (máy chuẩn: RTX 4060 Laptop 8 GB); không có GPU thì cần thêm 8 GB RAM |
| Đĩa | ~3,7 GB volume `ollama-models`, ~250 MB volume `ocr-models`, image `ocr` ~14 GB (PyTorch CUDA); sau lần tải đầu chạy không cần Internet |
| Tốc độ | GPU: vài giây mỗi lượt hỏi, 1–2 giây mỗi trang OCR; CPU chậm hơn nhiều lần. Lần đầu sau khi nhàn rỗi chờ thêm thời gian nạp mô hình (chữ đầu tiên sau khoảng 5–6 giây; `ollama` và `ocr` đọc trước tệp mô hình vào page cache khi khởi động, nên máy ít RAM bị hệ điều hành thu hồi cache thì lần nạp đầu đọc lại từ đĩa, chậm hơn nhiều). Lượt hỏi và trang OCR chung một hàng đợi trong `ai-worker`, mỗi lúc một việc, lượt hỏi được ưu tiên |

**Mô hình chính và mô hình phụ.** Mô hình sinh của tác tử và bộ OCR là mô hình chính, không nạp cùng lúc: trước khi trả lời, `ai-worker` gỡ bộ OCR và mô hình chính khác của Ollama để mô hình sinh có đủ chỗ (ưu tiên nằm trọn trên GPU); trước khi OCR mà hết bộ nhớ thì gỡ mô hình sinh đang nhàn rỗi rồi thử lại; vẫn hết thì thử lại sau, quá 5 lần thì tệp hiện "OCR lỗi" kèm nút thử lại. Mô hình phụ (`AI_CPU_MODELS`, mặc định `bge-m3`) nhỏ, được giữ lại, Ollama tự gỡ khi nhàn rỗi.

**OCR tệp quét.** Ảnh PNG/JPEG luôn OCR; PDF chỉ OCR trang không có chữ, tối đa 50 trang mỗi tệp. Chỉ tệp của đề nghị mua sắm và tài liệu thư viện (các tệp được đánh chỉ mục tìm kiếm). Văn bản OCR vào chỉ mục toàn văn và, với tài liệu thư viện, vào chỉ mục đoạn của Trợ lý RAG. Tệp có từ trước khi nâng cấp được OCR bù. Trạng thái từng tệp ở bảng `core.attachment_ocr`.

**Hiệu chỉnh độ liên quan:** câu hỏi ngoài phạm vi vẫn được trả lời (thay vì "Không tìm thấy…") thì tăng `AI_MIN_SCORE` (mặc định 0,7); câu đúng phạm vi bị từ chối thì giảm. Log `ai-worker` in điểm cao nhất của mỗi lượt hỏi; `tools/ai_smoke.sh` in điểm theo nhóm câu hỏi (trong phạm vi, ngoài phạm vi, tiêm lệnh). Hạ tạm `AI_MIN_SCORE` xuống 0,5 khi chạy để thấy điểm của câu bị chặn.

**Đổi mô hình:** đặt `AI_CHAT_MODEL` (hoặc `AI_EMBED_MODEL`) trong `.env`, chạy lại `docker compose up -d` để `ollama-init` tải, rồi chọn mô hình cho tác tử ở trang Tác tử AI. Đổi `AI_EMBED_MODEL` thì phải dùng mô hình 1024 chiều như `bge-m3`, xóa chỉ mục `documents_kb_chunk` để nạp lại (search-sync tự nạp bù khi chỉ mục trống).

**Cài GPU cho Docker.** Driver NVIDIA phía Windows (WSL2) hoặc phía máy chủ Linux phải có sẵn. Cài NVIDIA Container Toolkit một lần (cần sudo), theo [hướng dẫn của NVIDIA](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html):

```bash
# Ubuntu / Debian
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# Arch / CachyOS
sudo pacman -S nvidia-container-toolkit

# Cả hai
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
docker run --rm --gpus all ubuntu nvidia-smi   # thấy GPU là được
```

Docker Desktop cho Windows chỉ cần bật WSL2 backend, không cài gì thêm. Sau đó chạy như thường (`docker compose up -d` hoặc `make up`), không cần tệp compose bổ sung (ADR #79): compose luôn tạo Ollama và OCR bản CPU (máy nào cũng tạo được), rồi khi `ai-worker` đã chạy, `sleeper` thử một container nhỏ xin GPU từ image Ollama. Được thì nó tạo lại `ollama-core`, `ocr-core` với đúng cấu hình cộng GPU (giữ nhãn compose nên `docker compose up` lần sau không tạo lại), kiểm container mới lên được rồi mới xóa bản CPU; không được thì giữ CPU. Container GPU về sau không start được (đổi driver, tháo card) thì tự về CPU.

```bash
docker compose logs sleeper | grep -i gpu   # "thấy GPU NVIDIA: chuyển ..." hoặc "không dùng được GPU NVIDIA (...)"
docker compose exec ollama-core ollama ps   # cột PROCESSOR ghi "100% GPU" khi đang trả lời
curl 127.0.0.1:8866/health                  # "device" là tên GPU
```

`BAMBOO_GPU=false` trong `.env` để luôn chạy CPU. Lắp card hoặc cài toolkit sau khi đã chạy thì `docker compose restart sleeper` để thử lại. `infra/compose/gpu.yml` vẫn dùng được để ép GPU ngay từ đầu (`docker compose -f compose.yaml -f infra/compose/gpu.yml up -d`), nhưng khi đó máy không có card thì container không tạo được.

**Dựng máy demo (RTX 5060 Laptop + Ryzen 9840HS).** Số đo trong tài liệu này là của RTX 4060; số chính thức của buổi demo là số đo trên máy demo. Làm trước ngày 27/10, không để đến sáng ngày demo vì tải khoảng 18 GB (mô hình ~3,7 GB, image `ocr` ~14 GB):

1. Cài NVIDIA Container Toolkit như trên; GPU Blackwell cần driver đủ mới, image `ocr` dùng CUDA 12.8 và Ollama 0.35.1 đều hỗ trợ, nhưng chưa chạy thử trên máy này nên kiểm bằng `docker run --rm --gpus all ubuntu nvidia-smi`.
2. Chạy `BAMBOO_RAM=16 make up`, không để tự dò mức RAM; GPU tự dò, kiểm bằng `docker compose logs sleeper | grep -i gpu`. WSL2 mặc định chỉ cấp một nửa RAM máy: máy 16 GB sẽ bị tự chọn mức 8 (AI vẫn chạy nhưng mỗi lúc một mô hình, lượt hỏi đầu chậm). Dùng WSL2 thì đặt `memory=12GB` (hoặc hơn) trong `%UserProfile%\.wslconfig` rồi `wsl --shutdown`. `BAMBOO_RAM=16` đặt trong `.env` cũng có hiệu lực với `make up`.
3. Chạy `tools/ai_smoke.sh --cold` rồi `tools/ai_smoke.sh`; ghi số đo vào mục Bổ sung của [ADR #52](#adr-52). Có nhóm câu nào trượt hoặc điểm của nhóm ngoài phạm vi chạm 0,7 thì hiệu chỉnh `AI_MIN_SCORE` như trên. Câu nào bị `error` do hết token thì tắt `think` cho tác tử demo ở trang Tác tử AI.
4. Đính kèm sẵn một báo giá quét vào một đề nghị mua sắm, chờ nhãn "Đã OCR" (không OCR trực tiếp trên sân khấu: OCR và mô hình sinh không nạp cùng lúc nên lượt hỏi ngay sau đó phải nạp lạnh).
5. Ngay trước buổi demo chạy `tools/demo_prepare.sh`: kiểm AI đang bật, giữ qwen3 và bge-m3 trong bộ nhớ 2 giờ, kiểm đã có tệp "Đã OCR".

**Quyền:** người quản trị tác tử cần quyền `core.ai.manage` (seed demo gán cho CDO Tập đoàn X và KHTH BVX). Tác tử không có quyền riêng; trợ lý chỉ đọc tài liệu thư viện đang hiệu lực mà người hỏi được xem.
