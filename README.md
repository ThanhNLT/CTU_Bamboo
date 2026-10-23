# Bamboo – DX-OS Open-Core cho Tập đoàn X

Bài thi OLP Phần mềm nguồn mở 2026, chủ đề *Xây dựng Hệ điều hành Chuyển đổi số bằng Công nghệ Lõi nguồn mở (DX-OS Open-Core)*.

Bamboo là nền tảng lõi headless (Tầng 1) cùng ứng dụng mẫu **Đề nghị mua sắm – thanh toán** (Tầng 2, không gian [P]) cho một tập đoàn đa ngành hư cấu: công ty mẹ, ba công ty con công nghiệp và một bệnh viện tách tenant riêng. Cơ cấu tổ chức, phân quyền và hạn mức duyệt đều là dữ liệu doanh nghiệp tự khai báo, không viết cứng trong mã.

- Mã nguồn: <https://github.com/ThanhNLT/Bamboo>
- Báo lỗi, đề xuất: [GitHub Issues](https://github.com/ThanhNLT/Bamboo/issues)
- Lịch sử thay đổi: [CHANGELOG.md](CHANGELOG.md)
- Tài liệu thiết kế: [`docs/`](docs/) (build HTML bằng `make -C docs html`)
- Triển khai production, sao lưu, nâng cấp: [docs/van-hanh/trien-khai.md](docs/van-hanh/trien-khai.md)
- Báo lỗ hổng bảo mật: [SECURITY.md](SECURITY.md)
- Giấy phép: [Apache-2.0](LICENSE)

## Kiến trúc

```text
Trình duyệt ──► Cổng API APISIX :8000 (một điểm vào; WAF Coraza/OWASP CRS, giới hạn tần suất, X-Request-Id)
                 ├── /                    → web (Refine + Ant Design)
                 ├── /realms, /resources  → Keycloak (OIDC + PKCE; realm master bị chặn)
                 ├── /graphql             → Hasura ──auth webhook──► actions (FastAPI)
                 │     token kiểm tại biên (forward-auth → actions)    │  Hasura Actions: gửi duyệt, duyệt, tệp...
                 └── /bms-quarantine, /bms-documents → SeaweedFS S3     ├──► PostgreSQL + PostGIS (nguồn sự thật, nhật ký hash)
                                                                        └──► OpenBao (secret, khóa S3, mã hóa PII)
              flow-sync ── đối chiếu CSDL → Flowable (BPMN, bản phản chiếu luồng duyệt)
              search-sync ── CSDL + nội dung tệp (Tika) → Meilisearch (Action search_documents lọc lại theo quyền)
              actions ── HTML (Jinja2) → Gotenberg → phiếu PDF trong SeaweedFS (Action get_purchase_request_pdf)
              Debezium ── WAL logic của PostgreSQL → Kafka (topic bms.<schema>.<bảng>)
              lakehouse-sink ── Kafka → Iceberg bronze (lịch sử thay đổi, Parquet trên SeaweedFS)
              Trino ── view silver (trạng thái hiện tại, có kiểu) trên cùng catalog Iceberg
```

| Thành phần | Công nghệ | Giấy phép |
|---|---|---|
| Cổng API, WAF | Apache APISIX 3.19, Coraza + OWASP CRS | Apache-2.0 |
| Định danh, SSO, MFA | Keycloak 26 | Apache-2.0 |
| API GraphQL, phân quyền theo dòng | Hasura GraphQL Engine v2 CE | Apache-2.0 |
| Dữ liệu có cấu trúc | PostgreSQL 17 + PostGIS 3.5 | PostgreSQL, GPL-2.0 (PostGIS) |
| Quy trình BPMN | Flowable REST 8 | Apache-2.0 |
| Lưu trữ đối tượng S3 | SeaweedFS 4 | Apache-2.0 |
| Két secret | OpenBao 2 | MPL-2.0 |
| Tìm kiếm toàn văn, trích chữ tệp | Meilisearch 1 (Community), Apache Tika 4 | MIT, Apache-2.0 |
| In phiếu PDF | Gotenberg 8 (Chromium), Jinja2 | MIT, BSD-3-Clause |
| CDC, trục sự kiện | Debezium Server 3, Apache Kafka 4 (KRaft) | Apache-2.0 |
| Lakehouse | Apache Iceberg (pyiceberg, pyarrow), JDBC catalog trên PostgreSQL, Trino 483 | Apache-2.0 |
| Quét virus (tùy chọn) | ClamAV | GPL-2.0 |
| Dịch vụ nghiệp vụ | Python 3.13, FastAPI | MIT |
| Giao diện | Refine 5, React 19, Ant Design 5 | MIT |

Danh sách đầy đủ thư viện và giấy phép: [NOTICE](NOTICE). Lý do chọn công nghệ: [nhật ký quyết định kiến trúc](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md).

## Chạy bằng một lệnh

Yêu cầu: Docker Engine 24+ với Docker Compose v2, khoảng 12 GB RAM trống, 10 GB đĩa. Trên Windows dùng WSL2 và đặt mã nguồn trong hệ thống file của WSL ([ADR #12](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md)).

```bash
git clone https://github.com/ThanhNLT/Bamboo.git
cd Bamboo
make up        # tự chọn mức RAM: 8 GB chỉ chức năng cơ bản, 16 GB đầy đủ gồm AI (BAMBOO_RAM=8 hoặc 16 để chọn tay)
```

Không cần tạo `.env` hay chạy migration tay. `make up` chạy `docker compose up -d --build` (chạy trực tiếp lệnh này thì không có AI nếu chưa đặt `COMPOSE_PROFILES=ai`, xem ADR #54). Lệnh trên build image từ mã nguồn (muốn bỏ qua bước build: xem mục *Chạy bằng image dựng sẵn* bên dưới), rồi tự chạy theo thứ tự: migration CSDL, nạp dữ liệu demo, khởi tạo OpenBao, tạo bucket S3, deploy BPMN, nạp metadata Hasura. Lần đầu mất khoảng 5–10 phút (tải image, build giao diện). Theo dõi tiến độ:

```bash
docker compose ps          # mọi dịch vụ chạy lâu phải là "healthy"; migrate, seed, openbao-init, bootstrap "exited (0)"
docker compose logs -f bootstrap
```

Mở ứng dụng tại **<http://localhost:8000>**: cổng API là địa chỉ duy nhất trình duyệt cần (dùng đúng `localhost`, không dùng `127.0.0.1`: Keycloak chỉ chấp nhận chuyển hướng về địa chỉ này). Tài khoản demo và địa chỉ các trang quản trị ở mục ngay dưới.

### Tài khoản

Mật khẩu chung của mọi tài khoản demo là **`demo-password`** (biến `DEMO_PASSWORD`, đặt lúc Keycloak import realm lần đầu). Đăng nhập tại <http://localhost:8000> bằng nút **Đăng nhập bằng tài khoản tập đoàn**; đổi người dùng bằng **Đăng xuất** ở thanh bên trái. Hạn mức duyệt mẫu: dưới 50 triệu quản lý trực tiếp duyệt; 50–500 triệu giám đốc công ty con; từ 500 triệu thêm Tổng giám đốc.

**Tập đoàn X – công ty mẹ**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `tgd` | Nguyễn Văn Thành, Tổng giám đốc | Thấy đề nghị toàn tập đoàn; hộp việc có đề nghị 650 triệu (đã qua giám đốc Điện thoại X) và 300 triệu của Văn phòng Chuyển đổi số chờ duyệt |
| `pho.tgd` | Trần Thị Mai, Phó tổng giám đốc | Vị trí báo cáo cho Tổng giám đốc |
| `gd.taichinh` | Phạm Thu Hà, Giám đốc tài chính | Vai trò kiểm soát: xem mọi đề nghị trong tenant, menu **Kiểm toán**, đối soát chuỗi hash |
| `cdo` | Lê Quang Huy, Giám đốc chuyển đổi số | Vai trò quản trị tổ chức |

**Công ty Chip X**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `gd.chip` | Hoàng Minh Đức, Giám đốc | Đang đi công tác, đã ủy quyền cho phó giám đốc |
| `ns.chip` | Châu Văn Phát, Chuyên viên nhân sự | Lập hồ sơ tiếp nhận cho Chip X (không lập được cho công ty khác) |
| `pgd.chip` | Vũ Thị Lan, Phó giám đốc | Hộp việc có đề nghị 90 triệu gắn nhãn **Duyệt thay (ủy quyền)** |
| `qd.phongsach.chip` | Đặng Văn Long, Quản đốc phòng sạch | Hộp việc có đề nghị máy đếm hạt bụi 35 triệu |
| `kd.chip` | Bùi Thị Ngọc, Chuyên viên kinh doanh B2B | Lập đề nghị dưới tư cách nhân viên |

**Công ty Điện thoại X**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `nv.muahang.dienthoai` | Phan Văn Nam, Chuyên viên mua hàng | Lập đề nghị kèm dòng hàng, đính kèm báo giá, gửi duyệt; xem đề nghị **Văn phòng phẩm quý IV** bị trả về |
| `tp.muahang.dienthoai` | Đỗ Thị Hương, Trưởng phòng mua hàng | Duyệt đề nghị dưới 50 triệu của phòng; bước 1 của đề nghị tiếp nhận người vào phòng (chỉ thấy CCCD đã che) |
| `gd.dienthoai` | Ngô Thanh Sơn, Giám đốc | Đã duyệt bước 1 của đề nghị 650 triệu; bước 2 của đề nghị tiếp nhận nhân sự Điện thoại X |
| `ns.dienthoai` | Hồ Thị Thu Trang, Chuyên viên nhân sự | **Tiếp nhận nhân sự**: lập hồ sơ ứng viên vào ghế trống (ví dụ Chuyên viên – Phòng Mua hàng), CCCD được mã hóa, **Xem đầy đủ** ghi nhật ký; duyệt xong xem mật khẩu tạm để bàn giao |

**Công ty Gia dụng X**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `gd.giadung` | Lý Thị Thảo, Giám đốc | Hộp việc có đề nghị bộ dụng cụ sửa chữa 120 triệu |
| `gd.baohanh.giadung` | Trịnh Văn Hải, Giám đốc trung tâm bảo hành | Người quản lý hợp đồng: duyệt đề nghị 15 triệu do người làm hợp đồng lập |
| `ns.giadung` | Lâm Thị Kim Ngân, Chuyên viên nhân sự | Lập hồ sơ tiếp nhận cho Gia dụng X |

**Bệnh viện X** (tenant riêng, cách ly dữ liệu với Tập đoàn X)

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `gd.benhvien` | Võ Thị Bích, Giám đốc bệnh viện | Bước 2 của đề nghị máy siêu âm 4D (thiết bị y tế luôn duyệt 2 cấp) |
| `bs.cdha.benhvien` | Lưu Thị Yến, Bác sĩ chẩn đoán hình ảnh | Người lập đề nghị máy siêu âm 4D |
| `tk.duoc.benhvien` | Dương Văn Khoa, Trưởng khoa Dược | Người dùng của tenant bệnh viện, không thấy dữ liệu tập đoàn |
| `ns.benhvien` | Quách Văn Toàn, Chuyên viên phòng Tổ chức cán bộ | Lập hồ sơ tiếp nhận cho bệnh viện (ví dụ Bác sĩ – Khoa Nội) |

**Tài khoản đặc biệt**

| Tên đăng nhập | Họ tên, vị trí | Nên thử |
|---|---|---|
| `kiemnhiem` | Mai Xuân Phúc, chuyên viên pháp chế Tập đoàn X, kiêm nhiệm ở Bệnh viện X | Một tài khoản, hai tenant: màn hình **Chọn đơn vị làm việc**, đổi tenant ở menu người dùng (ADR #30) |
| `hopdong` | Tạ Minh Tuấn, kỹ sư Chip X, làm hợp đồng cho Gia dụng X | Bổ nhiệm hợp đồng: lập được đề nghị ở Gia dụng X nhưng không bao giờ là người duyệt (ADR #29) |
| `admin` | Kiều Anh Quân, đội nền tảng | Realm role `platform_admin`; **bắt buộc cài OTP** (ứng dụng xác thực) ở lần đăng nhập đầu |

**Quản trị hệ thống** (giá trị mặc định cho máy dev; đổi trong `.env` khi triển khai thật). Các cổng này chỉ nghe `127.0.0.1` trên máy chủ, không đi qua cổng API.

| Thành phần | Địa chỉ | Đăng nhập |
|---|---|---|
| Keycloak (người dùng, realm, client) | <http://localhost:8080/admin> | `kcadmin` / `kcadmin-dev` (`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`) |
| Hasura Console (API, dữ liệu) | <http://localhost:8081/console> | admin secret `dev-admin-secret` (`HASURA_GRAPHQL_ADMIN_SECRET`) |
| OpenBao UI (secret) | <http://localhost:8200> | root token in bằng `make bao-token` |
| Flowable REST (quy trình) | <http://localhost:8082/flowable-rest> | `rest-admin` / `test` (`FLOWABLE_ADMIN`, `FLOWABLE_ADMIN_PASSWORD`) |
| Trino (truy vấn Lakehouse) | <https://localhost:8085> | `bms-admin`, mật khẩu in bằng `make trino-password` (chứng chỉ của CA nội bộ OpenBao, trình duyệt sẽ cảnh báo; ADR #45) |
| SeaweedFS (lưu tệp) | S3 `localhost:8333`, giao diện master <http://localhost:9333>, filer <http://localhost:8888> | S3 cần khóa trong OpenBao (`secret/bms/seaweedfs*`) |
| Meilisearch (tìm kiếm) | <http://localhost:7700> | khóa chủ trong OpenBao (`secret/bms/meilisearch-admin`) |
| Kafka (CDC) | `localhost:19092` (SASL_PLAINTEXT, SCRAM-SHA-512) | `lakehouse` / `lakehouse-kafka-dev` chỉ đọc, `debezium` / `debezium-kafka-dev` (`*_KAFKA_PASSWORD`) |
| Debezium (CDC) | <http://localhost:8083/q/health> | không cần đăng nhập |
| actions (Hasura Actions) | <http://localhost:8090/healthz> | Action chỉ nhận lời gọi từ Hasura (`ACTIONS_SECRET`) |
| Ứng dụng web không qua cổng API | <http://localhost:8088> | chỉ để kiểm tra bản build; dùng <http://localhost:8000> như bình thường |
| Tika, Gotenberg, ClamAV | `localhost:9998`, `localhost:3000`, `localhost:3310` (ClamAV khi bật `--profile scan`) | dịch vụ nội bộ, không cần đăng nhập |
| PostgreSQL | `localhost:5432` | `bms` / `bms-dev` (`POSTGRES_PASSWORD`); `make psql`. Dịch vụ dùng tài khoản riêng không phải superuser: `bamboo_hasura`, `bamboo_actions`, `bamboo_keycloak`, `bamboo_flowable` (mật khẩu dev `hasura-db-dev`, `actions-db-dev`, `keycloak-db-dev`, `flowable-db-dev`; biến `*_DB_PASSWORD`; ADR #35) |

Danh sách tài khoản sinh từ `services/seed/app/demo.py` (dùng chung cho dữ liệu CSDL và realm Keycloak); các vị trí còn lại có người giả lập (Faker). Bảng quyền và hạn mức đầy đủ: [thiết kế CSDL, mục Tích hợp](docs/thiet-ke/03-thiet-ke-csdl.md).

Dừng: `docker compose down` (giữ dữ liệu) hoặc `docker compose down -v` (xóa sạch, kể cả khóa OpenBao).

### Chạy bằng image dựng sẵn (không cần mã nguồn)

CI build sẵn mọi image của dự án cho `amd64` và `arm64` (kể cả Mac chip M; riêng image PostGIS của bên thứ ba chỉ có `amd64` nên chạy qua giả lập), đẩy lên GitHub Container Registry cùng tệp compose phát hành. Máy chỉ cần Docker Compose 2.34 trở lên:

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:latest up -d -y
```

Lệnh này kéo tệp compose và các image về rồi dựng toàn bộ hệ thống như khi build từ mã nguồn. Cờ `-y` (đặt sau `up`) bỏ qua câu hỏi xác nhận mà Docker Compose đặt ra với tệp compose lấy từ xa; bỏ cờ này nếu muốn xem trước danh sách biến cấu hình và giá trị mặc định. Thay `latest` bằng số phiên bản (ví dụ `0.1.0`) để chạy đúng một bản phát hành; bản của một pull request có thẻ `pr-<số>`. Docker Compose cũ hơn: tải tệp `compose.release.yml` (đính kèm mỗi bản phát hành) rồi chạy `docker compose -f compose.release.yml up -d`.

Trong giai đoạn kho mã còn riêng tư, image cũng riêng tư: người chạy cần quyền đọc kho và đăng nhập registry một lần bằng token GitHub có quyền `read:packages`:

```bash
echo <token> | docker login ghcr.io -u <tài-khoản-github> --password-stdin
```

### Cấu hình

Mọi biến đều có giá trị mặc định cho máy dev. Muốn đổi thì `cp .env.example .env` rồi sửa; danh sách và ý nghĩa ở [.env.example](.env.example).

**Triển khai thật** (có người dùng, có tên miền): đặt `BAMBOO_ENV=production` và đổi mọi biến đánh dấu `[BẮT BUỘC]`; hệ thống từ chối khởi động nếu còn mật khẩu mặc định. Tên miền HTTPS, Keycloak chế độ production, sao lưu và khôi phục, nâng cấp: [Triển khai production](docs/van-hanh/trien-khai.md). Secret được chép vào OpenBao; dịch vụ ứng dụng đọc từ két bằng AppRole riêng ([ADR #25](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md)).

## Build từ mã nguồn (không dùng Docker)

Từng thành phần build và chạy được riêng, bằng công cụ nguồn mở chuẩn của hệ sinh thái tương ứng.

**CSDL** (PostgreSQL 17 có extension `ltree`, `btree_gist`; PostGIS tùy chọn):

```bash
export PGHOST=localhost PGUSER=bms PGPASSWORD=bms-dev
scripts/db/migrate.sh bms                    # chạy các migration chưa chạy trong db/migrations/bms
```

**Dịch vụ Python** (`services/actions`, `services/seed`; Python 3.13):

```bash
cd services/actions
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -c ../../constraints.txt   # phiên bản ghim chung (ADR #10)
DATABASE_URL=postgresql://bamboo_actions:actions-db-dev@localhost:5432/bms uvicorn app.main:app --port 8000
```

Cấu hình qua biến môi trường (xem `services/actions/app/config.py`); có `BAO_ADDR` và `BAO_APPROLE_FILE` thì secret đọc từ OpenBao.

**Giao diện** (`apps/web/web`; Node.js 20+):

```bash
cd apps/web/web
npm ci
cp .env.example .env.local      # địa chỉ Keycloak/Hasura nếu khác mặc định
npm run dev                     # phát triển: http://localhost:5173, gọi backend qua cổng API :8000
npm run build                   # bản tĩnh trong dist/, phục vụ bằng web server bất kỳ
```

## Kiểm thử

```bash
make test-db        # kiểm thử SQL: tổ chức, phân quyền, chuỗi duyệt, mua sắm, kiểm toán, cộng tác, tệp đính kèm
make test-seed      # dữ liệu demo đúng, chạy lại không trùng, khớp realm Keycloak
make test-actions   # Hasura, Flowable, SeaweedFS, OpenBao, Meilisearch, Tika, Gotenberg, Kafka, Debezium, Iceberg, Trino thật
make test-auth      # đăng nhập thật mọi tài khoản demo (cần `docker compose up -d` trước)
make test-all
```

Giao diện: `npm run lint`, `npm run build`. Tài liệu: `make -C docs check`. Giấy phép từng tệp: `reuse lint` ([REUSE](https://reuse.software)).

## Cấu trúc thư mục

```text
apps/web/web/        Ứng dụng Refine (Tầng 2)
services/actions/    Hasura Actions, auth webhook, flow-sync, job khởi tạo (bootstrap, openbao-init)
services/seed/       Dữ liệu demo Tập đoàn X và realm Keycloak
db/migrations/bms/   Migration CSDL (chạy theo thứ tự tên tệp)
db/tests/            Kiểm thử SQL
platform/            Cấu hình Keycloak, Hasura (metadata sinh tự động), Flowable (BPMN), OpenBao
docs/                Tài liệu Sphinx: yêu cầu, kiến trúc, thiết kế, ADR, timeline
```

## Đóng góp

Báo lỗi và đề xuất qua [GitHub Issues](https://github.com/ThanhNLT/Bamboo/issues). Mỗi thay đổi đi qua pull request, kèm kiểm thử; quyết định kiến trúc ghi vào [ADR](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md), thuật ngữ nghiệp vụ theo [CONTEXT.md](CONTEXT.md). Tệp mới cần header SPDX (`reuse annotate --license Apache-2.0 --copyright "DX-OS Open-Core contributors"`).

## Giấy phép

Mã nguồn của dự án phát hành theo [Apache License 2.0](LICENSE) (toàn văn ở [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)); mỗi tệp ghi giấy phép bằng header SPDX theo chuẩn REUSE 3.3. Ngoại lệ có ghi trong [REUSE.toml](REUSE.toml): biểu tượng mẫu Refine (MIT), bản lưu đề thi của VFOSSA (chỉ để tham chiếu). Thành phần bên thứ ba: [NOTICE](NOTICE).
