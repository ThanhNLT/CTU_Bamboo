# Khởi tạo cho một công ty mới

Trang này dành cho người muốn dùng Bamboo để quản lý **công ty hoặc tập đoàn của chính mình**, bắt đầu từ một hệ thống trống (không có dữ liệu demo Tập đoàn X). Làm theo thứ tự:

1. Cài hệ thống và tắt dữ liệu demo.
2. Tạo công ty và quản trị viên đầu tiên bằng một lệnh.
3. Quản trị viên đăng nhập, tự dựng cơ cấu tổ chức, người dùng, phân quyền, danh mục.

## 1. Cài hệ thống trống

Cần Docker Engine 24+ và Docker Compose 2.34+ (cấu hình máy xem [Triển khai production](trien-khai.md) mục 1).

```bash
git clone https://github.com/ThanhNLT/Bamboo.git && cd Bamboo
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

## 2. Tạo công ty và quản trị viên đầu tiên

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

Kết quả in ra tên đăng nhập và **mật khẩu tạm**, chỉ hiện một lần. Lần đăng nhập đầu hệ thống bắt đổi mật khẩu.

Lệnh tạo sẵn:

- công ty, đơn vị gốc (pháp nhân) cùng tên, danh mục loại đơn vị và ba chức danh cơ bản;
- hai vị trí ở đơn vị gốc: **Giám đốc** (trưởng đơn vị, để trống) và **Quản trị hệ thống** (giao cho quản trị viên);
- bốn vai trò: **Nhân viên** (lập đề nghị mua sắm), **Quản lý** (duyệt), **Kiểm soát tài chính** (xem, kiểm toán), **Quản trị tổ chức** (cơ cấu, phân quyền, dữ liệu chủ, kiểm toán, thiết kế quy trình). Quản trị viên nhận vai trò Quản trị tổ chức trên toàn công ty; mọi vị trí ở đơn vị gốc nhận vai trò Nhân viên;
- quy tắc duyệt mặc định cho đề nghị mua sắm và tiếp nhận nhân sự: một bước, do **cấp quản lý trực tiếp của người lập** (thường là trưởng đơn vị) duyệt. Đơn vị chưa có trưởng thì đề nghị không gửi duyệt được.

Chạy lại với mã đã có thì lệnh dừng, không tạo trùng. Lệnh cần Keycloak đang chạy và đăng nhập bằng `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` trong `.env`; nếu đã xóa tài khoản quản trị Keycloak này, tạo lại hoặc truyền `-e KEYCLOAK_ADMIN=… -e KEYCLOAK_ADMIN_PASSWORD=…` vào `docker compose run`.

## 3. Quản trị viên tự dựng công ty

Đăng nhập bằng tài khoản vừa tạo, vào nhóm menu **Quản trị**. Thứ tự nên làm:

| Bước | Trang | Việc |
|---|---|---|
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
