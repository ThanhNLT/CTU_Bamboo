<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project

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

# Khởi tạo cho một công ty mới

Trang này dành cho người muốn dùng Bamboo để quản lý **công ty hoặc tập đoàn của chính mình**, bắt đầu từ một hệ thống trống (không có dữ liệu demo Tập đoàn X). Làm theo thứ tự:

1. Cài hệ thống và tắt dữ liệu demo.
2. Tạo tài khoản doanh nghiệp trên trang đăng ký: khai thông tin, thành viên, công cụ; ký số là tùy chọn (hoặc dùng một lệnh trên máy chủ).
3. Quản trị viên đăng nhập, tự dựng cơ cấu tổ chức, người dùng, phân quyền, danh mục.

## 1. Cài hệ thống trống

Cần Docker Engine 25+ và Docker Compose 2.34+ (cấu hình máy xem [Triển khai production](trien-khai.md) mục 1).

```bash
git clone https://github.com/ThanhNLT/CTU_Bamboo.git && cd Bamboo
cp .env.example .env
```

Sửa `.env` **trước lần chạy đầu tiên**:

| Biến | Giá trị |
|---|---|
| `SEED_DEMO` | `false`: không nạp dữ liệu demo |
| `WEB_ORIGIN`, `KEYCLOAK_URL`, `S3_PUBLIC_ENDPOINT` | Địa chỉ mọi người gõ vào trình duyệt, ví dụ `https://bamboo.congty.vn`. Chỉ dùng trên một máy thì giữ `http://localhost:8000` |
| `HASURA_PUBLIC_URL` | Địa chỉ trên + `/graphql` |
| `CORS_ORIGINS` | Đúng địa chỉ trên |
| Các mật khẩu `[BẮT BUỘC]` | Chuỗi ngẫu nhiên dài (`openssl rand -base64 32`); khi có người dùng thật đặt thêm `BAMBOO_ENV=production` |

Địa chỉ trình duyệt phải khớp đúng các biến trên (kể cả `localhost` khác `127.0.0.1`), nếu không đăng nhập sẽ báo lỗi `redirect_uri` hoặc bị CORS chặn. Muốn người khác truy cập qua mạng, đặt tên miền HTTPS và reverse proxy như [Triển khai production](trien-khai.md) mục 3.

Chạy:

```bash
docker compose up -d
docker compose ps        # chờ các dịch vụ healthy, job khởi tạo exited (0)
```

Realm đăng nhập luôn có sẵn các tài khoản demo (`cdo`, `admin`, `nv.muahang.dienthoai`…). Với `SEED_DEMO=false` các tài khoản này không thuộc công ty nào nên không vào được dữ liệu, nhưng vẫn nên vô hiệu hóa: mở `http://localhost:8080` (đăng nhập bằng `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`) → realm `bms` → **Users** → tắt **Enabled** từng tài khoản demo.

## 2. Tạo công ty và chủ sở hữu

### Cách 1: trang đăng ký (khuyến nghị)

Hệ thống chưa có công ty nào thì trang đăng nhập hiện nút **Tạo tài khoản** (ADR #57, đơn giản hóa ở ADR #62). Không phải nhập mã thiết lập: trang đăng ký mở trong **24 giờ** sau khi hệ thống khởi động lần đầu. Hết 24 giờ mà chưa đăng ký thì người quản trị máy chủ chạy `make setup-code` để mở lại thêm 24 giờ. Vì ai mở được trang trước sẽ thành chủ sở hữu, chỉ cho máy chủ ra Internet **sau khi** đã đăng ký xong.

Trình hướng dẫn gồm các bước:

1. **Bạn là ai:** họ tên, năm sinh, chức vụ, điện thoại, email, tên đăng nhập. Người đăng ký là **chủ sở hữu** và người đại diện theo pháp luật.
2. **Doanh nghiệp:** tên, mã số thuế (hộ kinh doanh dùng mã số thuế cá nhân 12 chữ số), địa chỉ, lĩnh vực kinh doanh. Mã công ty trên hệ thống tự sinh từ tên.
3. **Quy mô:** chọn số người. Đến 50 người, hệ thống gợi ý **thiết lập nhanh**; trên 50 người, gợi ý **thiết lập chi tiết**. Luôn đổi được.
4. **Thiết lập nhanh:** thêm thành viên (gõ từng người hoặc dán danh sách họ tên, tên đăng nhập tự gợi ý) và chọn quyền dựng sẵn: Nhân viên, Trưởng bộ phận, Kế toán/kiểm soát, Quản trị viên.
   **Thiết lập chi tiết:** thêm bước **Phòng ban** (gợi ý theo lĩnh vực, sửa được), rồi gắn từng thành viên vào phòng ban. Trưởng bộ phận đầu tiên của mỗi phòng ban là trưởng đơn vị và duyệt đề nghị của phòng ban đó.
5. **Công cụ:** bật các chức năng cần dùng (mua sắm, nhân sự, ổ đĩa…); hệ thống gợi ý theo lĩnh vực và tự bật chức năng phụ thuộc.
6. **Xác nhận:** xem lại rồi bấm **Tạo tài khoản doanh nghiệp**. Muốn xác thực pháp lý ngay thì bật **Xác thực bằng chữ ký số**, tải đơn đăng ký PDF, người đại diện ký số bằng USB token của doanh nghiệp (không sửa tệp) rồi tải lên. Bỏ qua thì công ty ở trạng thái **chưa xác thực**, ký bổ sung sau ở **Quản trị → Thông tin công ty**.

Trang cuối hiện **mật khẩu tạm** của từng tài khoản đúng một lần (có nút sao chép, in). Lần đăng nhập đầu, mỗi người đặt mật khẩu mới; chủ sở hữu và quản trị viên cài thêm mã xác thực hai lớp (Google Authenticator, Microsoft Authenticator…).

Ký số cần chứng thư Root CA quốc gia trong `infra/platform/trust` (xem `infra/platform/trust/README.md`, dựng lại image `actions`); chưa cài thì công tắc ký số tạm ẩn. Máy chủ không có Internet thì đặt `SIGNATURE_ONLINE=false`. Đặt `SETUP_ALLOW_UNVERIFIED=false` để bắt buộc ký số ngay khi đăng ký.

**Chủ sở hữu** là người duy nhất trao hoặc thu hồi quyền quản trị: cấp vai trò có quyền quản trị (cơ cấu tổ chức, phân quyền, quản lý chức năng), bổ nhiệm người vào vị trí có quyền quản trị, ủy quyền quản trị. Quản trị viên làm các việc khác như thường nhưng không tự nâng quyền cho ai. Chủ sở hữu giữ ghế Giám đốc và được cài/gỡ mô-đun trên máy chủ.

Ở **Quản trị → Thông tin công ty**, chủ sở hữu:

- **chuyển quyền chủ sở hữu** cho người khác khi đổi người đại diện theo pháp luật;
- **tạo công ty thành viên** trực thuộc, kèm chủ sở hữu của công ty đó (tên đăng nhập đã có ở công ty mẹ thì dùng chung tài khoản);
- nhận **cảnh báo** khi chủ sở hữu hoặc quản trị viên đăng nhập từ thiết bị mới, khi tài khoản chủ sở hữu được khôi phục, khi chuyển quyền chủ sở hữu.

**Chủ sở hữu mất mật khẩu hoặc điện thoại cài OTP:** mở `/khoi-phuc`, nhập mã số thuế, tải **đơn khôi phục**, người đại diện ký số bằng chữ ký số doanh nghiệp rồi tải lên; hệ thống cấp mật khẩu tạm mới và bắt cài lại OTP. Không có cách khôi phục qua email.

### Cách 2: lệnh trên máy chủ

```bash
docker compose run --rm seed python -m app.tenant \
  --code ABC \
  --name "Công ty Cổ phần ABC" \
  --admin-username quantri.abc \
  --admin-name "Nguyễn Văn An" \
  --admin-email an@abc.vn
```

| Tham số | Ý nghĩa |
|---|---|
| `--code` | Mã công ty, viết hoa không dấu, không đổi được về sau |
| `--name` | Tên hiển thị |
| `--root-type` | Loại đơn vị gốc: `CONG_TY` (mặc định), `TAP_DOAN`, `BENH_VIEN`… |
| `--parent` | Mã công ty mẹ, khi công ty mới là thành viên của một tập đoàn đã tạo (mục 4) |
| `--admin-username`, `--admin-name`, `--admin-email` | Tài khoản quản trị viên; email không bắt buộc |

Kết quả in ra tên đăng nhập và **mật khẩu tạm**, chỉ hiện một lần. Lần đăng nhập đầu hệ thống bắt đổi mật khẩu. Người chạy lệnh có quyền trên máy chủ nên quản trị viên đầu tiên đồng thời là chủ sở hữu; công ty tạo bằng lệnh chưa khai mã số thuế, chưa xác thực pháp lý.

Cả hai cách tạo sẵn:

- công ty, đơn vị gốc (pháp nhân) cùng tên, danh mục loại đơn vị và ba chức danh cơ bản;
- hai vị trí ở đơn vị gốc: **Giám đốc** (trưởng đơn vị; người đại diện khi tạo trên trang khởi tạo) và **Quản trị hệ thống** (quản trị viên), cả hai có vai trò Quản trị tổ chức;
- bốn vai trò: **Nhân viên** (lập đề nghị mua sắm), **Quản lý** (duyệt), **Kiểm soát tài chính** (xem, kiểm toán), **Quản trị tổ chức** (cơ cấu, phân quyền, dữ liệu chủ, kiểm toán, thiết kế quy trình). Quản trị viên nhận vai trò Quản trị tổ chức trên toàn công ty; mọi vị trí ở đơn vị gốc nhận vai trò Nhân viên;
- quy tắc duyệt mặc định cho đề nghị mua sắm và tiếp nhận nhân sự: một bước, do **cấp quản lý trực tiếp của người lập** (thường là trưởng đơn vị) duyệt. Đơn vị chưa có trưởng thì đề nghị không gửi duyệt được.

Chạy lại với mã đã có thì lệnh dừng, không tạo trùng. Lệnh cần Keycloak đang chạy và đăng nhập bằng `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` trong `.env`; nếu đã xóa tài khoản quản trị Keycloak này, tạo lại hoặc truyền `-e KEYCLOAK_ADMIN=… -e KEYCLOAK_ADMIN_PASSWORD=…` vào `docker compose run`.

## 3. Quản trị viên tự dựng công ty

Đăng nhập bằng tài khoản vừa tạo, vào nhóm menu **Quản trị**. Công ty mới chỉ có **phần lõi** (tổ chức, người dùng, phân quyền, danh mục); các chức năng khác (mua sắm, nghiệp vụ nhân sự, ổ đĩa, tìm kiếm, dữ liệu số, AI...) bật ở **Quản lý chức năng** khi cần dùng. Chức năng chưa bật không hiện trên menu, chức năng chưa cài trên máy thì dịch vụ của nó không chạy (ADR #56). Thứ tự nên làm:

| Bước | Trang | Việc |
|---|---|---|
| 0 | **Quản lý chức năng** | Bật những chức năng công ty cần (ví dụ **Mua sắm** kéo theo **Phê duyệt**) |
| 1 | **Danh mục & dữ liệu chủ** | Sửa loại đơn vị, chức danh cho hợp với công ty |
| 2 | **Cơ cấu tổ chức** | Thêm khối, phòng, chi nhánh, nhà máy… dưới đơn vị gốc; thêm vị trí (ghế) cho từng đơn vị, đánh dấu **trưởng đơn vị** |
| 3 | **Người dùng** | Thêm người, bổ nhiệm vào vị trí, bấm **Tạo tài khoản** (in mật khẩu tạm để gửi cho người đó) |
| 4 | **Vai trò & phân quyền** | Giao vai trò cho vị trí hoặc đơn vị (xem bên dưới); tạo vai trò mới nếu cần |
| 5 | **Danh mục & dữ liệu chủ** | Nhóm vật tư, vật tư, nhà cung cấp |

Bước 2, 3 và 5 có nút **Nhập Excel**: bấm **Tải tệp mẫu**, điền theo trang Ví dụ trong tệp, tải lên, xem trước rồi ghi. Nên nhập theo thứ tự đơn vị → vị trí → người → phân quyền. Nhập người xong, chọn những người cần tài khoản để tạo hàng loạt.

**Phân quyền cần nhớ.** Vai trò giao cho một **đơn vị** chỉ áp dụng cho các vị trí nằm trực tiếp trong đơn vị đó, không tự lan xuống đơn vị con. Vì vậy mỗi đơn vị mới cần:

- vai trò **Nhân viên** giao cho đơn vị (phạm vi *Đơn vị*) để người trong đơn vị lập được đề nghị;
- vai trò **Quản lý** giao cho vị trí trưởng đơn vị (phạm vi *Cây đơn vị*) để duyệt được đề nghị của cấp dưới;
- vai trò **Kiểm soát tài chính** cho kế toán trưởng hoặc kiểm soát nội bộ (phạm vi *Toàn công ty*).

Quyền gắn với **vị trí**, không gắn với người: thay người giữ ghế thì người mới tự nhận quyền, người cũ mất quyền.

## 4. Tập đoàn nhiều công ty

Mỗi công ty con là một công ty riêng (dữ liệu tách biệt, có quản trị viên riêng), nối vào công ty mẹ bằng `--parent`:

```bash
docker compose run --rm seed python -m app.tenant --code TDA --name "Tập đoàn A" --root-type TAP_DOAN \
  --admin-username quantri.tda --admin-name "Trần Thị Bình"
docker compose run --rm seed python -m app.tenant --code TDA_SX --name "Công ty Sản xuất A" --parent TDA \
  --admin-username quantri.tdasx --admin-name "Lê Văn Cường"
```

Một tài khoản chỉ dùng được ở nhiều công ty khi các công ty cùng một công ty mẹ ([ADR #30](#adr-30)). Truyền cùng `--admin-username` cho công ty con thì lệnh gắn tài khoản có sẵn, không tạo mật khẩu mới; người dùng chọn công ty khi đăng nhập hoặc đổi ở thanh trên cùng.

## 5. Những gì chưa có giao diện

**Quy tắc duyệt** (bao nhiêu bước, theo hạn mức tiền, theo nhóm vật tư) hiện chỉ sửa được bằng SQL. Quy tắc mặc định là một bước do cấp quản lý trực tiếp của người lập duyệt. Ví dụ thêm bước hai cho đề nghị từ 50 triệu đồng, do trưởng của đơn vị loại `CONG_TY` gần nhất chứa người lập duyệt:

```bash
docker compose exec -T db psql -U bms -d bms <<'SQL'
INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, approver_unit_type_id)
SELECT t.id, 'PURCHASE_REQUEST', 50000000, 2, c.id
FROM core.tenant t
JOIN core.catalog_item c ON c.tenant_id = t.id AND c.catalog = 'UNIT_TYPE' AND c.code = 'CONG_TY'
WHERE t.code = 'ABC';
SQL
```

Cột của bảng xem [Thiết kế cơ sở dữ liệu](../thiet-ke/03-thiet-ke-csdl.md). Sao lưu trước khi sửa trực tiếp ([Triển khai production](trien-khai.md) mục 5).
