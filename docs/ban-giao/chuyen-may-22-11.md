<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.1
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

# Bàn giao khi chuyển máy (22-Nov-2026)

Tài liệu dùng một lần: người tiếp tục dự án trên máy mới đọc tệp này trước khi làm việc. Tệp cố ý không được liên
kết từ mục lục tài liệu (thư mục `docs/ban-giao` nằm trong `exclude_patterns` của `docs/conf.py`). Làm xong bước
chuyển máy thì có thể xóa thư mục này.

## 1. Đọc gì trước

1. `CONTEXT.md`: ngôn ngữ chung của miền (đơn vị, vị trí, bổ nhiệm, ủy quyền, hạn mức duyệt…). Dùng đúng thuật ngữ ở
   đây, tránh các từ ghi ở mục "Tránh dùng".
2. `docs/tong-quan/01-yeu-cau-va-kien-truc.md`: đề thi OLP 2026, kiến trúc 3 tầng, bảng đối chiếu Tầng 1.
3. `docs/quan-ly-du-an/05-quyet-dinh-kien-truc.md`: nhật ký ADR, hiện tới **ADR #91**. Số **#88 đang để dành** cho
   nhánh hạn mức tài khoản (mục 3.1), ADR mới tiếp theo dùng **#92**.
4. `docs/thiet-ke/09-thu-vien-va-giay-phep.md`: thư viện, phiên bản, giấy phép theo tầng.
5. `README.md`, `CHANGELOG.md`, `Makefile` (mọi lệnh chạy, test đi qua `make`).

## 2. Trạng thái repo lúc bàn giao

- Kho: `CTUBamboo/Bamboo` trên GitHub, đang **private có chủ ý**. Chuyển từ `ThanhNLT/Bamboo` ngày 07-Nov-2026.
- `main` ở **e04f2e4** (merge PR #132). Không còn PR mở, không còn issue mở.
- Phiên bản trong header tệp: **0.5.1**. Bản phát hành gần nhất **v0.5.0** (13-Nov-2026). Không có 0.6.x (0.6.0
  chưa từng phát hành). Chỉ tạo thẻ/release khi chủ dự án yêu cầu.
- Các PR merge gần nhất:
  - #128 (16-Nov): giới hạn CPU dịch vụ nặng (ADR #87), tab ẩn ngừng hỏi định kỳ.
  - #130 (18-Nov): trợ lý AI trả lời đúng trọng tâm, đúng ngôn ngữ câu hỏi, giới hạn lập luận (ADR #89); sửa test.
  - #131 (18-Nov): chặn chọn mô hình embedding (bge-m3) làm mô hình chat cho trợ lý/tác tử.
  - #132 (18-Nov): Mac Apple Silicon dùng GPU Metal, tắt AI khi không có GPU và thiếu RAM, image arm64 (ADR #90, #91).
- Hạn nộp bài OLP 2026: **17:00 Chủ nhật 06-Dec-2026**. Chấm kho mã 07–09-Dec (6 tiêu chí PoF), chung kết 10-Dec.
  Trước hạn phải chuyển kho và các gói GHCR sang công khai (chỉ chấm dự án có mã truy cập tự do).

## 3. Việc dở dang chỉ có trên máy cũ (dễ mất khi chuyển)

### 3.1. Nhánh `feat/han-muc-tai-khoan`: CHƯA COMMIT, CHƯA PUSH

- Nội dung: hạn mức ổ đĩa **5 GB cho mỗi tài khoản** (thay cho hạn mức chỉ theo tenant), migration
  `db/migrations/bms/064_han_muc_tai_khoan.sql`, ADR #88; sửa `admin.py`, `attachments.py`, `hasura_metadata.py`,
  `process_regulation.py`, `server.en.json`, trang Ổ đĩa (`StorageCard.tsx`, `useDriveUsage.ts`), test
  `test_quan_tri.py`, `test_tep_dinh_kem.py`, `db/tests/bms_160_ncc_han_muc.sql`, metadata Hasura, tài liệu CSDL.
  Tổng 15 tệp sửa + 1 migration mới.
- Tách từ `main` cũ e61024b. Đã qua ruff, tsc, eslint, i18n, prettier; **chưa chạy** `db/tests` và test actions cần
  CSDL.
- Bản vá đầy đủ đã được lưu ngoài Git trên máy cũ (hỏi chủ dự án). Áp lên `main` hiện tại bằng `git apply -3`: mọi
  tệp áp sạch, riêng tệp ADR xung đột vì `main` đã thêm ADR #89–#91; giữ cả hai phần, đặt ADR #88 trước #89.
- Sau khi áp: sinh lại `infra/platform/hasura/metadata.json` và `infra/platform/trino/silver.sql` nếu migration đổi
  bảng, chạy `make test-db` và `make test-actions` trên Docker thật.

### 3.2. Thay đổi chưa commit trên nhánh `feat/apple-silicon` (đã merge qua #132)

Ba tệp `infra/compose/core.yml`, `mac.yml`, `scan.yml` có thay đổi chưa commit, không rõ ai sửa:

- `core.yml`: bỏ biến `BAMBOO_DB_PLATFORM` và đổi image CSDL mặc định thành `imresamu/postgis:17-3.5` cho mọi máy.
- `mac.yml`: bỏ thẻ `!reset` / `!override` (thẻ này cần Docker Compose mới; có thể đã gặp lỗi với bản cũ).
- `scan.yml`: xóa dòng chú thích về image ClamAV arm64.

Các thay đổi này đi ngược một phần ADR #91. Hỏi chủ dự án trước khi giữ hay bỏ; nếu giữ thì ghi lại lý do vào
ADR #91 và cập nhật `NOTICE`.

### 3.3. Tệp không theo dõi bằng Git, phải chép tay sang máy mới

- `.git/info/exclude`: **không đi theo `git clone`**. Chép nguyên tệp này từ máy cũ trước khi làm bất cứ việc gì,
  vì nó chặn các tệp công cụ cục bộ và tài liệu nội bộ khỏi bị commit.
- Tài liệu nội bộ bị loại khỏi Git: mọi tệp `.docx` (ví dụ `docs/Bamboo - Kế hoạch phát triển.docx`),
  `docs/Presentation/`, `docs/UI-template/`, `docs/DXOS - Layer 1 - Design/`, `docs/chuyen-repo/`,
  `docs/Kien_truc_he_thong_tong_the.pdf`, `docs/bao-cao-doi-chieu-de-thi-OLP2026.pdf`.
- `docs/Kich-ban-kiem-thu-Bamboo.pdf`: đang untracked, chủ dự án chưa quyết có đưa lên GitHub hay không. Đừng commit.
- `.env` ở gốc repo (gitignored): cấu hình máy cũ (mức RAM, `SEED_DEMO`, `SIGNATURE_ONLINE`…). Máy mới để
  `make up` tự sinh lại theo cấu hình máy, chỉ chép giá trị cần giữ.
- `git stash` cũ trên máy cũ (`truoc-tai-cau-truc`, `pre-pull-24-10`…) đều đã lỗi thời, không cần chép.

### 3.4. Nhánh chỉ có ở máy cũ

- `backup/main-truoc-viet-lai`, `backup/fix-cong-api-404-truoc-viet-lai`: sao lưu lịch sử `main` trước lần viết lại
  ngày 14-Nov. Nếu muốn giữ thì `git bundle` mang sang; không push.
- Các worktree phụ `wt-chimuc` (`feat/chi-muc-toan-van`), `wt-qt` (`feat/quy-trinh-van-ban`): nhánh đã nằm trong
  `main`, bỏ được.

## 4. Quy định làm việc đã chốt

### Git và GitHub

- Mọi commit, push, PR đứng tên `CTUBamboo` với email noreply của tài khoản này (đặt trong git config của repo);
  `gh` đăng nhập `CTUBamboo`. Kiểm `git config user.name` và `gh auth status` trước khi commit. Không viết lại commit
  cũ đứng tên ThanhNLT.
- Không thêm dòng ghi nhận công cụ tự động nào vào commit, PR, release.
- Trước mỗi commit kiểm `git diff --cached --name-only`: không có tệp công cụ cục bộ, `.docx`, tài liệu nội bộ ở 3.3.
  Không dùng `git add -f`.
- Message commit một dòng `Update <nhóm>`, ghép theo thứ tự `backend/frontend/AI/docs/CI` (ví dụ
  `Update backend/docs`), không thân, không trailer. Nhóm theo đường dẫn: frontend = `apps/`; AI = trang
  `apps/web/src/pages/ai-*`, `pii_guard.py`; CI = `.github/`; docs = `docs/`, README, CHANGELOG, CONTEXT,
  SECURITY, LICENSE(S), NOTICE, REUSE.toml; còn lại = backend. Thay đổi chỉ gồm mẫu PDF trong
  `services/actions/app/templates/` dùng `Update template`.
- PR: tiêu đề cùng mẫu, mô tả một câu `Update <nhóm>.`; gợi ý chủ dự án chọn **Squash and merge** để lịch sử thẳng,
  không lộ tên nhánh.
- Commit phần giao diện làm chung với thành viên homie-craft thì thêm trailer `Co-authored-by` của homie-craft
  (lấy đúng dòng từ các commit giao diện cũ, ví dụ 284415e); commit vẫn đứng tên CTUBamboo.
- Không xóa nhánh trên GitHub, chỉ dọn nhánh cục bộ.
- Mỗi việc một nhánh mới tách từ `origin/main`, một PR.

### Mã nguồn và sản phẩm

- Mọi tệp mang header từ `docs/Header.txt` (kèm thông báo Apache-2.0): chạy `python3 tools/header.py` (kiểm bằng
  `--check`). Chủ bản quyền là "Bamboo".
- Ngôn ngữ: mọi thông báo theo ngôn ngữ đang chọn của người dùng. Câu tiếng Việt từ backend/CSDL được dịch ở web
  (`apps/web/src/i18n/server.en.json`) và ở backend (`services/actions/app/locale/`); thêm câu lỗi mới thì thêm bản
  dịch, `python3 tools/i18n_server.py check` chặn câu chưa dịch. Ngày dạng `DD-MMM-YYYY`, số dạng en-US.
- PDF/mẫu văn bản: công ty tư nhân, **không in quốc hiệu, tiêu ngữ** trong bất kỳ mẫu nào.
- GPU: có GPU rời thì Ollama, tác tử, OCR tự chạy GPU không cần cấu hình; Mac Apple Silicon dùng Metal; không có GPU
  thì CPU chỉ khi đủ RAM (`BAMBOO_AI_MIN_RAM_GB`, mặc định 7), thiếu thì tắt AI. Mọi đường đều phải tối ưu tốc độ.
- Giấy phép: chỉ thêm thư viện có giấy phép OSI; thư viện web production phải qua
  `node tools/ci/check_licenses.mjs`. Thêm thư viện thì cập nhật `NOTICE` và
  `docs/thiet-ke/09-thu-vien-va-giay-phep.md`.
- Mỗi quyết định kiến trúc mới ghi ADR trước khi làm.
- Đổi bảng hoặc Action: sinh lại `infra/platform/hasura/metadata.json` (`python -m app.hasura_metadata`) và
  `infra/platform/trino/silver.sql`.

### Kiểm thử

- Workflow CI trên GitHub đã tắt từ 14-Oct-2026: mọi kiểm thử chạy ở máy. Không bàn chuyện billing CI.
- Máy cũ: container phát triển không có Docker, sudo, psql; Docker chạy ở WSL trên cùng thư mục
  `~/projects/Bamboo`, nên các lệnh `make up`, `make test-*` do chủ dự án chạy ở WSL. Mạng trong container chặn tải
  binary ngoài. Kiểm lại điều kiện này trên máy mới trước khi lập kế hoạch kiểm thử.
- Lệnh chính: `make up` (không gọi `docker compose` trực tiếp vì `make up` dò RAM, CPU, GPU, kiến trúc máy rồi đặt
  biến), `make test-db`, `make test-actions`, `pnpm lint`, `pnpm build`, E2E `pnpm test:e2e` (chạy trên bản build
  qua cổng `:8000`). Smoke AI: `tools/ai_smoke.sh`; smoke OCR: `tools/ocr_smoke.sh`.
- Báo kết quả trung thực: phần nào chưa kiểm trên Docker thật thì nói rõ.

## 5. Việc còn lại

### Trước hạn nộp 06-Dec-2026

- Tiêu chí PoF 4: dựng thử `make up` từ đầu bằng Docker, chạy bản phát hành ngoài thư mục mã
  (`tools/release/compose_release.py`, image GHCR); xác minh image GHCR (token `gh` cần quyền `read:packages`).
- Tiêu chí PoF 6: kênh trao đổi (Discussions đang tắt), đưa tài liệu Sphinx lên web, điền homepage của kho; giữ
  `CHANGELOG.md` cập nhật (lịch sử được chấm là changelog và commit).
- Công khai kho và các gói GHCR.
- Hoàn tất nhánh hạn mức tài khoản (3.1).

### Tầng 1 còn "Một phần"

- HSM và ký bằng chứng thư công cộng (cần thiết bị hoặc dịch vụ ký số từ xa của CA).
- mTLS cho các chặng HTTP nội bộ còn lại (APISIX, Hasura, Keycloak, Flowable).
- Argo CD / Kubernetes (k3s); hiện GitOps là `tools/gitops/reconcile.sh` chạy theo chu kỳ.

### Chức năng

- Khởi tạo công ty: passkey (mới có OTP), chủ sở hữu duyệt thao tác nhạy cảm qua hộp việc, dự phòng nộp hồ sơ duyệt
  tay; E2E mô-đun ngoài; Ctrl K còn liệt kê trang của mô-đun chưa bật.
- Văn bản quy định sinh từ quy trình (`process_regulation`, `process_text`) vẫn chỉ tiếng Việt.
- Nghiệp vụ: nhận hàng, hóa đơn, thanh toán, đối trừ công nợ nội bộ; giao diện sửa quy tắc hạn mức duyệt.
- Lakehouse: chính sách vòng đời và xóa dữ liệu.
- Lớp BPMN tự viết: chưa vẽ pool/lane/ghi chú (vẫn giữ trong tệp), chưa đổi loại phần tử tại chỗ, chưa sao chép/dán.
- Câu hỏi tiếng Việt không dấu có điểm tìm ngữ nghĩa dưới ngưỡng 0,7 (ghi ở Giới hạn của ADR #85).

### Chưa kiểm trên môi trường thật

- Mac Apple Silicon thật (PR #132): `make up`, `tools/mac/ai.sh`, `docker compose config` với `mac.yml`.
- Đường GPU NVIDIA của OCR (tải torch cu128 vào volume `ocr-accel`, float16): chạy `tools/ocr_smoke.sh`.
- Dữ liệu ở máy WSL: tác tử "Data Analysis" của tenant TDX đang dùng `bge-m3` làm mô hình chat, cần đổi sang
  `qwen3:4b` (từ #131 hệ thống chặn cấu hình này).
- Tài khoản rác trong Keycloak của máy cũ (thanh.nguyen, loc.le, huy.tran…) nên xóa trước khi demo.

## 6. Mốc công việc đã làm (tóm tắt)

| Thời gian | Nội dung | ADR, PR |
|---|---|---|
| 13–14-Oct | Hoàn thiện backend các trang còn minh họa: sổ cái, đề nghị mua sắm, ổ đĩa, thiết kế quy trình, thư viện tri thức, trung tâm điều hành, dữ liệu demo; viết lại lịch sử commit theo mẫu "Update"; tắt CI | PR #30–#50 |
| 21–29-Oct | OCR dùng GPU, giảm RAM, dịch vụ và AI từ ngữ, chuyển nhân sự demo; phát hành 0.4.0; nhập issue lỗi lịch sử #53–#83 | PR #51, #52, #84–#91 |
| 30-Oct | Khung mô-đun bật/tắt hai tầng, khởi tạo công ty bằng ký số PDF, chủ sở hữu, cảnh báo thiết bị mới; bỏ quốc hiệu trong PDF; chỉ mục toàn văn, quy trình văn bản | ADR #56–#57; PR #92–#97 |
| 02–03-Nov | Mô-đun ngoài qua iframe và `/ext-api`, tái cấu trúc monorepo (`apps/`, `services/`, `infra/`), bổ sung thư viện thiếu, đăng ký mới + giao diện Bamboo Glass + i18n | ADR #58, #60, #61; PR #98–#101 |
| 04–05-Nov | Không gian I (Phân tích BI), D (API), H, P và dữ liệu demo; sửa đăng nhập demo, build compose, khởi động cổng, tự unseal OpenBao | ADR #63–#67; PR #102–#113 |
| 06–08-Nov | Hoàn thiện Tầng 1 (CDR, mTLS MQTT, giám sát…), GPU tự dò và quyền AI, đổi tài khoản sang CTUBamboo, xóa chú thích thừa và sửa giao diện | ADR #70–#77; PR #114–#117 |
| 09–10-Nov | Sửa CRLF trên Windows; sửa giấy phép: bỏ bpmn-js, lớp BPMN tự viết, OCR chỉ CPU trong image và tự tải CUDA khi có GPU; chủ bản quyền Bamboo, header mọi tệp | ADR #80, #81; PR #118–#121 |
| 11–14-Nov | Đồng bộ ngôn ngữ thông báo, ngày `DD-MMM-YYYY`, dịch câu máy chủ; dịch và cài từ mã nguồn; tắt UI OpenBao và Console Hasura mặc định, GitOps theo chu kỳ; sửa cổng API 404; phát hành v0.5.0 (13-Nov); viết lại `main` thành chuỗi thẳng (14-Nov) | ADR #82, #83; PR #122–#127 |
| 14–16-Nov | Giới hạn CPU dịch vụ nặng, sửa `make up`, bước AI trong quy trình, tác tử mức đề xuất, tối ưu AI không gian I | ADR #84–#87; PR #128 |
| 16–18-Nov | Tối ưu câu trả lời AI (PR #129 đóng, nội dung chuyển sang #130), chặn mô hình embedding làm chat, Mac Apple Silicon | ADR #89–#91; PR #130–#132 |
| 18-Nov | Bắt đầu hạn mức 5 GB mỗi tài khoản (chưa commit) | ADR #88 (để dành) |
| 22-Nov | Danh sách thư viện và giấy phép theo tầng; tài liệu bàn giao này | |

## 7. Bắt đầu trên máy mới

1. `git clone` kho, chép `.git/info/exclude` và các tệp ở 3.3 từ máy cũ.
2. `git config user.name CTUBamboo`, đặt email noreply của tài khoản; `gh auth login` bằng tài khoản CTUBamboo,
   `gh auth setup-git`.
3. Cài `uv` (≥ 0.13), Node ≥ 20 và pnpm theo `packageManager` trong `package.json`; `uv sync`, `pnpm install`.
4. Kiểm Docker Engine ≥ 25, Compose ≥ 2.20 (nên ≥ 2.34), rồi `make up`.
5. Áp lại nhánh hạn mức (3.1) trên nhánh mới từ `origin/main`, chạy test, mở PR theo mẫu ở mục 4.
