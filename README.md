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
Trình duyệt ──► web (Refine + Ant Design)          :5173
                 │ OIDC + PKCE                      │ GraphQL (token Keycloak + tenant đã chọn)
                 ▼                                  ▼
              Keycloak :8080 ◄── JWKS ──── actions (FastAPI) ◄── auth webhook ── Hasura :8081
                                            │  Hasura Actions: gửi duyệt, duyệt, tệp đính kèm...
                                            ├──► PostgreSQL + PostGIS :5432 (nguồn sự thật, nhật ký hash)
                                            ├──► SeaweedFS S3 :8333 (bucket cách ly + bucket chính)
                                            └──► OpenBao :8200 (secret, khóa S3, mã hóa PII)
              flow-sync ── đối chiếu CSDL → Flowable :8082 (BPMN, bản phản chiếu luồng duyệt)
```

| Thành phần | Công nghệ | Giấy phép |
|---|---|---|
| Định danh, SSO, MFA | Keycloak 26 | Apache-2.0 |
| API GraphQL, phân quyền theo dòng | Hasura GraphQL Engine v2 CE | Apache-2.0 |
| Dữ liệu có cấu trúc | PostgreSQL 17 + PostGIS 3.5 | PostgreSQL, GPL-2.0 (PostGIS) |
| Quy trình BPMN | Flowable REST 8 | Apache-2.0 |
| Lưu trữ đối tượng S3 | SeaweedFS 4 | Apache-2.0 |
| Két secret | OpenBao 2 | MPL-2.0 |
| Quét virus (tùy chọn) | ClamAV | GPL-2.0 |
| Dịch vụ nghiệp vụ | Python 3.13, FastAPI | MIT |
| Giao diện | Refine 5, React 19, Ant Design 5 | MIT |

Danh sách đầy đủ thư viện và giấy phép: [NOTICE](NOTICE). Lý do chọn công nghệ: [nhật ký quyết định kiến trúc](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md).

## Chạy bằng một lệnh

Yêu cầu: Docker Engine 24+ với Docker Compose v2, khoảng 8 GB RAM trống, 10 GB đĩa. Trên Windows dùng WSL2 và đặt mã nguồn trong hệ thống file của WSL ([ADR #12](docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md)).

```bash
git clone https://github.com/ThanhNLT/Bamboo.git
cd Bamboo
docker compose up -d
```

Không cần tạo `.env` hay chạy migration tay. Lệnh trên build image từ mã nguồn (muốn bỏ qua bước build: xem mục *Chạy bằng image dựng sẵn* bên dưới), rồi tự chạy theo thứ tự: migration CSDL, nạp dữ liệu demo, khởi tạo OpenBao, tạo bucket S3, deploy BPMN, nạp metadata Hasura. Lần đầu mất khoảng 5–10 phút (tải image, build giao diện). Theo dõi tiến độ:

```bash
docker compose ps          # mọi dịch vụ chạy lâu phải là "healthy"; migrate, seed, openbao-init, bootstrap "exited (0)"
docker compose logs -f bootstrap
```

| Địa chỉ | Dùng để |
|---|---|
| <http://localhost:5173> | Ứng dụng web |
| <http://localhost:8081/console> | Hasura Console (admin secret `dev-admin-secret`) |
| <http://localhost:8080/admin> | Keycloak (`kcadmin` / `kcadmin-dev`) |
| <http://localhost:8200> | OpenBao UI (`make bao-token` in root token dev) |
| <http://localhost:8082/flowable-rest> | Flowable REST (`rest-admin` / `test`) |

Tài khoản demo (mật khẩu `demo-password`): `tgd` (Tổng giám đốc), `nv.muahang.dienthoai` (người lập đề nghị), `tp.muahang.dienthoai`, `gd.chip`, `pgd.chip` (duyệt thay theo ủy quyền), `kiemnhiem` (một tài khoản, hai tenant), `gd.taichinh` (xem nhật ký kiểm toán)… Danh sách đủ ở [thiết kế CSDL, mục Tích hợp](docs/thiet-ke/03-thiet-ke-csdl.md).

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
DATABASE_URL=postgresql://bms:bms-dev@localhost:5432/bms uvicorn app.main:app --port 8000
```

Cấu hình qua biến môi trường (xem `services/actions/app/config.py`); có `BAO_ADDR` và `BAO_APPROLE_FILE` thì secret đọc từ OpenBao.

**Giao diện** (`apps/web/web`; Node.js 20+):

```bash
cd apps/web/web
npm ci
cp .env.example .env.local      # địa chỉ Keycloak/Hasura nếu khác mặc định
npm run dev                     # phát triển: http://localhost:5173
npm run build                   # bản tĩnh trong dist/, phục vụ bằng web server bất kỳ
```

## Kiểm thử

```bash
make test-db        # kiểm thử SQL: tổ chức, phân quyền, chuỗi duyệt, mua sắm, kiểm toán, cộng tác, tệp đính kèm
make test-seed      # dữ liệu demo đúng, chạy lại không trùng, khớp realm Keycloak
make test-actions   # Hasura, Flowable, SeaweedFS, OpenBao thật
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
