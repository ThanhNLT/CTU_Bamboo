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
| 3 | Tắt dữ liệu demo | `SEED_DEMO=false`; xóa hoặc vô hiệu hóa tài khoản demo trong Keycloak sau lần import đầu (realm có sẵn tài khoản demo). Tạo công ty và quản trị viên đầu tiên: [Khởi tạo cho một công ty mới](cong-ty-moi.md) |
| 4 | Tên miền HTTPS | Một tên miền trỏ vào cổng API; đặt `WEB_ORIGIN`, `KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT`, `CORS_ORIGINS` theo tên miền đó (mục 3) |
| 5 | Keycloak chế độ production | `KEYCLOAK_MODE=start` (bắt buộc đi sau reverse proxy TLS) |
| 6 | Redirect URI của ứng dụng | Job `bootstrap` tự bổ sung `WEB_ORIGIN` vào client `bms-web` mỗi lần khởi động (cả khi đổi tên miền sau lần import đầu). Giá trị cũ không bị xóa: gỡ `http://localhost:5173` (chỉ dùng cho `npm run dev`) và tên miền cũ trong Keycloak → realm `bms` → Clients → `bms-web` |
| 7 | Tắt Hasura Console | `HASURA_ENABLE_CONSOLE=false` (metadata quản lý trong Git, job `bootstrap` nạp) |
| 8 | Quét virus | `docker compose --profile scan up -d` và `CLAMAV_HOST=clamav` |
| 9 | Sao lưu | Lịch sao lưu theo mục 5, thử khôi phục ít nhất một lần |
| 10 | Khóa OpenBao | Sao lưu volume `openbao-keys` tách biệt, giới hạn quyền truy cập máy chủ (mục 6) |
| 11 | Tài khoản CSDL | Mỗi dịch vụ một role không phải superuser (ADR #35), mật khẩu `HASURA_DB_PASSWORD`, `ACTIONS_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `FLOWABLE_DB_PASSWORD`, `CDC_DB_PASSWORD` (Debezium), `LAKEHOUSE_DB_PASSWORD` (catalog Iceberg); superuser `bms` chỉ dùng cho `migrate`, `seed` và quản trị. Đổi mật khẩu: sửa `.env` rồi `docker compose up -d` (job `migrate` đặt lại mật khẩu, các dịch vụ khởi động lại với giá trị mới) |
| 12 | Trục dữ liệu (ADR #45) | Mật khẩu Kafka `DEBEZIUM_KAFKA_PASSWORD`, `LAKEHOUSE_KAFKA_PASSWORD` (Kafka từ chối client không có tài khoản, ACL theo tiền tố topic). Trino chỉ nhận đăng nhập qua HTTPS bằng chứng chỉ của CA nội bộ OpenBao; mật khẩu `bms-admin`, `bms-actions` do OpenBao sinh; người dùng tenant chỉ thấy dữ liệu của tenant mình (row filter). Không mở cổng 8085 của Trino ra ngoài máy chủ |

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
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.3.0 up -d -y
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
scripts/ops/backup.sh                       # Linux, macOS
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ops\backup.ps1   # Windows
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

## 6. Khóa OpenBao

`openbao-init` khởi tạo OpenBao với một khóa unseal và lưu khóa cùng root token trong volume `openbao-keys` để tự unseal mỗi lần khởi động. Cách này phù hợp demo và máy chủ một node; ai đọc được volume này thì đọc được mọi secret. Giảm rủi ro:

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
| `keycloak` | `KEYCLOAK_HEAP` | `-Xms128m -Xmx768m` |
| `tika` | `TIKA_JAVA_OPTS` | `-Xmx512m` |
| `debezium` | `DEBEZIUM_JAVA_OPTS` | `-Xms64m -Xmx384m` |
| `kafka` | (cố định trong compose) | `-Xmx512m -Xms256m` |
| `trino` | `platform/trino/jvm.config` | `-Xmx1G` |
| `flowable` | (image tự đặt) | `-Xmx512M` |

## 9. AI cục bộ (ADR #51, #52)

Trợ lý RAG, tác tử AI (Ollama) và OCR tệp quét (dịch vụ `ocr`) khởi động cùng hệ thống bằng `docker compose up -d`. Mô hình đã có trong volume thì `ollama-init`, `ocr-init` bỏ qua, nên các lần sau chạy không cần Internet; tải lỗi chỉ ghi cảnh báo vào log, phần còn lại của hệ thống vẫn lên.

**Mô hình chỉ nạp khi có việc** ([ADR #52](../quan-ly-du-an/05-quyet-dinh-kien-truc.md#adr-52)): lúc nhàn rỗi Ollama và `ocr` không giữ mô hình nào trong RAM/VRAM. Có lượt hỏi thì Ollama nạp mô hình sinh, có trang quét thì `ocr` nạp bộ OCR; hết việc quá `AI_KEEP_ALIVE` (mặc định `5m`) với Ollama, `OCR_IDLE_SECONDS` (mặc định 300) với OCR thì tự gỡ. Bật GPU (bên dưới) thì mô hình nạp lên GPU, không thì chạy CPU.

```bash
docker compose up -d
docker compose logs -f ollama-init         # lần đầu tải ~3,7 GB (qwen3:4b ~2,5 GB, bge-m3 ~1,2 GB)
docker compose logs -f ocr-init            # lần đầu tải ~250 MB mô hình OCR (PaddleOCR, VietOCR)
curl 127.0.0.1:11434/api/tags              # thấy hai mô hình là xong
curl 127.0.0.1:8866/health                 # dịch vụ OCR: GPU hay CPU, mô hình đang nạp chưa
scripts/ai_smoke.sh                        # hỏi thật vài câu mẫu
scripts/ocr_smoke.sh                       # OCR ảnh mẫu tiếng Việt, đo tỉ lệ lỗi ký tự
```

| Hạng mục | Giá trị |
|---|---|
| RAM / GPU | Chỉ chiếm khi có việc: qwen3:4b ~3 GB (kèm ngữ cảnh 8K), bộ OCR ~0,4 GB, bge-m3 ~1,2 GB. GPU tùy chọn: NVIDIA từ 8 GB VRAM (máy chuẩn: RTX 4060 Laptop 8 GB); không có GPU thì cần thêm 8 GB RAM |
| Đĩa | ~3,7 GB volume `ollama-models`, ~250 MB volume `ocr-models`, image `ocr` ~14 GB (PyTorch CUDA); sau lần tải đầu chạy không cần Internet |
| Tốc độ | GPU: vài giây mỗi lượt hỏi, 1–2 giây mỗi trang OCR; CPU chậm hơn nhiều lần. Lần đầu sau khi nhàn rỗi chờ thêm thời gian nạp mô hình. Lượt hỏi và trang OCR chung một hàng đợi trong `ai-worker`, mỗi lúc một việc, lượt hỏi được ưu tiên |

**Mô hình chính và mô hình phụ.** Mô hình sinh của tác tử và bộ OCR là mô hình chính, không nạp cùng lúc: trước khi trả lời, `ai-worker` gỡ bộ OCR và mô hình chính khác của Ollama để mô hình sinh có đủ chỗ (ưu tiên nằm trọn trên GPU); trước khi OCR mà hết bộ nhớ thì gỡ mô hình sinh đang nhàn rỗi rồi thử lại; vẫn hết thì thử lại sau, quá 5 lần thì tệp hiện "OCR lỗi" kèm nút thử lại. Mô hình phụ (`AI_CPU_MODELS`, mặc định `bge-m3`) nhỏ, được giữ lại, Ollama tự gỡ khi nhàn rỗi.

**OCR tệp quét.** Ảnh PNG/JPEG luôn OCR; PDF chỉ OCR trang không có chữ, tối đa 50 trang mỗi tệp. Chỉ tệp của đề nghị mua sắm và tài liệu thư viện (các tệp được đánh chỉ mục tìm kiếm). Văn bản OCR vào chỉ mục toàn văn và, với tài liệu thư viện, vào chỉ mục đoạn của Trợ lý RAG. Tệp có từ trước khi nâng cấp được OCR bù. Trạng thái từng tệp ở bảng `core.attachment_ocr`.

**Hiệu chỉnh độ liên quan:** câu hỏi ngoài phạm vi vẫn được trả lời (thay vì "Không tìm thấy…") thì tăng `AI_MIN_SCORE` (mặc định 0,7); câu đúng phạm vi bị từ chối thì giảm. Log `ai-worker` in điểm cao nhất của mỗi lượt hỏi.

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

Docker Desktop cho Windows chỉ cần bật WSL2 backend, không cài gì thêm. Sau đó chép tệp bổ sung một lần thành `docker-compose.override.yml` (Compose tự nạp, tệp này không đưa lên git), từ đó chỉ cần lệnh thường:

```bash
cp docker-compose.gpu.yml docker-compose.override.yml
docker compose up -d
docker compose exec ollama ollama ps        # cột PROCESSOR ghi "100% GPU" khi đang trả lời
curl 127.0.0.1:8866/health                  # "device" là tên GPU
```

Máy không có GPU thì đừng chép: Docker không tạo được container xin GPU mà máy không có, Compose cũng không tự dò được GPU. Không muốn chép thì dùng `make up-gpu`.

**Quyền:** người quản trị tác tử cần quyền `core.ai.manage` (seed demo gán cho CDO Tập đoàn X và KHTH BVX). Tác tử không có quyền riêng; trợ lý chỉ đọc tài liệu thư viện đang hiệu lực mà người hỏi được xem.
