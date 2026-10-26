# Kịch bản demo: tiếp nhận và điều chuyển nhân sự

Ba kịch bản chạy trọn vòng trên dữ liệu demo: **tiếp nhận** một ứng viên, **điều chuyển nội bộ** trong Điện thoại X và
**điều chuyển liên tập đoàn** từ Tập đoàn X sang Bệnh viện X. Mật khẩu chung của mọi tài khoản: `demo-password`
(biến `DEMO_PASSWORD`). Đăng nhập tại <http://localhost:8000>; đổi người bằng **Đăng xuất** ở thanh bên trái.

Mỗi người duyệt thấy việc của mình ở **Hộp việc** `/p/inbox` và nhận thông báo (chuông); đề nghị nằm ở
`/h/onboarding` (tiếp nhận) hoặc `/h/transfer` (điều chuyển).

## 1. Chuẩn bị dữ liệu

Dữ liệu do `services/seed` nạp khi chạy `docker compose up -d` (`make up`). Chạy lại trên hệ thống đã có dữ liệu vẫn bổ sung
được: `seed` gắn tài khoản mới vào người đang giữ ghế, `bootstrap` thêm tài khoản vào Keycloak.

| Cần có | Nguồn |
|---|---|
| 7 tài khoản mới ở bảng 2 (trưởng phòng nhân sự, trưởng đơn vị, nhân viên) | `TRANSFER_DEMO_USERS` trong `app/demo.py`, đã thêm vào `platform/keycloak/realm/bms-realm.json` |
| Ghế trống để tiếp nhận hoặc nhận người chuyển đến | `OPEN_SEATS`: `DT_RD_PM.S4` (Kỹ sư phần mềm), `DT_MH.S4` (Chuyên viên), `BVX_KHTH.S3` (Chuyên viên kế hoạch, thêm mới), và hai ghế khác |
| Phòng nhân sự có cờ `is_hr` và quyền `hr.*` | `HR_UNITS`, `HR_SCOPE`, vai trò `NHAN_SU` (đã có) |
| Quy tắc duyệt `ONBOARDING` | `hr_demo` (đã có) |

Kiểm nhanh sau khi nạp:

```sql
-- tài khoản đã gắn vào người giữ ghế
SELECT p.full_name, p.idp_subject IS NOT NULL AS co_tai_khoan, pos.name
FROM core.person p
JOIN core.assignment a ON a.person_id = p.id AND upper_inf(a.valid_period)
JOIN core.position pos ON pos.id = a.position_id
WHERE p.full_name IN ('Nguyễn Thị Hồng Nhung', 'Trần Quốc Bảo', 'Lê Hoàng Anh', 'Cao Thị Mỹ Linh',
                      'Phạm Thị Thanh Vân', 'Đoàn Minh Châu', 'Vương Hữu Phước');
-- ghế còn trống
SELECT u.code, pos.name FROM core.position pos JOIN core.org_unit u ON u.id = pos.org_unit_id
WHERE NOT EXISTS (SELECT 1 FROM core.position_holder(pos.id));
```

## 2. Tài khoản và vị trí

**Công ty Điện thoại X** (tenant Tập đoàn X)

| Tên đăng nhập | Họ tên | Vị trí (mã ghế) | Vai trò trong kịch bản |
|---|---|---|---|
| `ns.dienthoai` | Hồ Thị Thu Trang | Chuyên viên nhân sự, Phòng Nhân sự (`DT_NS.S1`) | Lập đề nghị tiếp nhận |
| `tp.nhansu.dienthoai` | Nguyễn Thị Hồng Nhung | Trưởng phòng nhân sự (`DT_NS.HEAD`) | Duyệt điều chuyển ở công ty; HR nguồn của điều chuyển liên tập đoàn |
| `tp.phanmem.dienthoai` | Trần Quốc Bảo | Trưởng phòng Phần mềm (`DT_RD_PM.HEAD`) | Quản lý trực tiếp của vị trí tiếp nhận (bước 1); quản lý của người điều chuyển đi |
| `nv.phanmem.dienthoai` | Lê Hoàng Anh | Kỹ sư phần mềm (`DT_RD_PM.S1`) | Người xin điều chuyển nội bộ (SELF) |
| `tp.muahang.dienthoai` | Đỗ Thị Hương | Trưởng phòng Mua hàng (`DT_MH.HEAD`) | Trưởng đơn vị tiếp nhận (nội bộ); quản lý trực tiếp của người đi liên tập đoàn |
| `nv3.muahang.dienthoai` | Cao Thị Mỹ Linh | Chuyên viên mua hàng (`DT_MH.S3`) | Người được điều chuyển sang Bệnh viện X |
| `gd.dienthoai` | Ngô Thanh Sơn | Giám đốc (`DT.HEAD`) | Bước 2 của tiếp nhận |

**Tập đoàn X (cấp tập đoàn)**

| Tên đăng nhập | Họ tên | Vị trí | Vai trò |
|---|---|---|---|
| `gd.nhansu.tapdoan` | Phạm Thị Thanh Vân | Giám đốc nhân sự, Khối Nhân sự (`TDX_NS.HEAD`) | Ra quyết định điều chuyển liên tập đoàn |
| `tgd` | Nguyễn Văn Thành | Tổng giám đốc | Dự phòng, xem mọi chứng từ |

**Bệnh viện X** (tenant riêng, con của Tập đoàn X)

| Tên đăng nhập | Họ tên | Vị trí | Vai trò |
|---|---|---|---|
| `tp.khth.benhvien` | Vương Hữu Phước | Trưởng phòng Kế hoạch tổng hợp (`BVX_KHTH.HEAD`) | Trưởng đơn vị tiếp nhận, chọn ghế |
| `tp.tccb.benhvien` | Đoàn Minh Châu | Trưởng phòng Tổ chức cán bộ (`BVX_TCCB.HEAD`) | HR đích |
| `ns.benhvien` | Quách Văn Toàn | Chuyên viên Tổ chức cán bộ | Lập tiếp nhận ở bệnh viện (tùy chọn) |

## 3. Kịch bản A: tiếp nhận nhân sự (mã chứng từ `TN-…`)

Ứng viên vào ghế trống **Kỹ sư phần mềm, Phòng Phần mềm** (`DT_RD_PM.S4`). Chuỗi duyệt tính từ vị trí được bổ nhiệm:
quản lý trực tiếp của vị trí rồi giám đốc công ty.

| Bước | Tài khoản | Việc làm | Kết quả mong đợi |
|---|---|---|---|
| 1 | `ns.dienthoai` | `/h/onboarding` → **Tạo mới**. Họ tên: *Bùi Gia Huy*; giới tính Nam; sinh 12/05/1999; email `huy.bui@example.com`; điện thoại `0912 345 678`; học vấn Đại học, ngành Kỹ thuật phần mềm. Vị trí: **Kỹ sư phần mềm, Phòng Phần mềm**; ngày vào làm: ngày đầu tháng sau; hợp đồng **Thử việc**; lương 18.000.000. CCCD `079099001234`, ngân hàng *Vietcombank*, số tài khoản `0071001234567`, địa chỉ tùy ý. Tên đăng nhập `huy.bui` | Lưu nháp, số `TN-2026-…`; CCCD, tài khoản, địa chỉ mã hóa |
| 2 | `ns.dienthoai` | Bấm **Gửi duyệt** | Trạng thái Chờ duyệt, việc tới `tp.phanmem.dienthoai` |
| 3 | `tp.phanmem.dienthoai` | Hộp việc → mở đề nghị | Thấy CCCD, tài khoản dạng che (`•••••••••234`); bấm **Duyệt** |
| 4 | `gd.dienthoai` | Hộp việc → **Duyệt** (bước 2) | Trạng thái **Đã duyệt** |
| 5 | `ns.dienthoai` | Mở đề nghị đã duyệt | Người mới có mã `NV-…`, bổ nhiệm giữ chính từ ngày vào làm, tài khoản `huy.bui` ở trạng thái Đã tạo; bấm **Xem đầy đủ** CCCD (ghi nhật ký kiểm toán) và xem mật khẩu tạm để bàn giao |
| 6 | `admin` | `/admin/audit-logs` | Có dòng xem đầy đủ dữ liệu cá nhân của `ns.dienthoai` |

Nhánh phụ: ở bước 3 chọn **Trả về** để `ns.dienthoai` sửa và gửi lại; chọn **Từ chối** để kết thúc đề nghị.

## 4. Kịch bản B: điều chuyển nội bộ (mã `DC-…`)

**Lê Hoàng Anh** chuyển từ Phòng Phần mềm sang **Phòng Mua hàng**, nhận ghế `DT_MH.S4` (Chuyên viên). Chuỗi duyệt: trưởng đơn
vị tiếp nhận (nhận hay không, chọn ghế), rồi trưởng phòng nhân sự của công ty chung gần nhất (Điện thoại X).

| Bước | Tài khoản | Việc làm | Kết quả mong đợi |
|---|---|---|---|
| 1 | `nv.phanmem.dienthoai` | `/h/transfer` → **Tạo mới**. Đơn vị tiếp nhận: *Phòng Mua hàng*; lý do: *Muốn chuyển sang mua hàng để phát triển kỹ năng chuỗi cung ứng*; ngày chuyển: **ít nhất 14 ngày sau ngày gửi** | Loại người lập SELF, số `DC-2026-…`, trạng thái Nháp |
| 2 | `nv.phanmem.dienthoai` | **Gửi duyệt** | Việc tới `tp.muahang.dienthoai` |
| 3 | `tp.muahang.dienthoai` | Mở đề nghị, **chọn vị trí tiếp nhận** `Chuyên viên` (ghế `DT_MH.S4`) rồi **Duyệt** | Việc chuyển sang `tp.nhansu.dienthoai` |
| 4 | `tp.nhansu.dienthoai` | **Duyệt** | Đã duyệt; bổ nhiệm cũ kết thúc trước ngày chuyển, bổ nhiệm mới bắt đầu từ ngày chuyển |
| 5 | `tp.phanmem.dienthoai` | Trang **Cơ cấu tổ chức** hoặc `/h/transfer` | Ghế `DT_RD_PM.S1` trống, ghế `DT_MH.S4` có người |

Biến thể: `tp.phanmem.dienthoai` (quản lý trực tiếp, loại MANAGER) hoặc `ns.dienthoai` (có quyền `hr.transfer.create`,
loại EXECUTIVE) lập thay. Nhánh từ chối: ở bước 3 `tp.muahang.dienthoai` bấm **Từ chối** (không nhận), đề nghị kết thúc.

Điều kiện chặn (kiểm trước khi demo): người được chuyển không được đang có đề nghị điều chuyển chưa xong, việc duyệt
đang mở hoặc đề nghị mua sắm đang chờ duyệt. Các nhân viên dùng ở đây (`DT_RD_PM.S1`, `DT_MH.S3`) không có chứng từ
demo nào, nên không vướng.

## 5. Kịch bản C: điều chuyển liên tập đoàn

**Cao Thị Mỹ Linh** (Chuyên viên mua hàng, Điện thoại X) sang **Phòng Kế hoạch tổng hợp, Bệnh viện X**, nhận ghế
`BVX_KHTH.S3`. Ba chứng từ liên kết, mỗi chứng từ nằm ở tenant của người duyệt.

| Bước | Tài khoản (tenant) | Việc làm | Kết quả mong đợi |
|---|---|---|---|
| 1 | `nv3.muahang.dienthoai` (TDX), người xin chuyển tự lập (SELF) | `/h/transfer` → **Tạo mới**, chọn tenant đích *Bệnh viện X* (mặc định là tenant của mình): người *Cao Thị Mỹ Linh*, đơn vị *Phòng Kế hoạch tổng hợp*, lý do *Hỗ trợ kế hoạch mua sắm thiết bị y tế*, ngày chuyển ≥ 14 ngày. **Gửi duyệt** | Chứng từ **đi** (`hr.transfer_out`) ở tenant nguồn |
| 2 | `tp.muahang.dienthoai` (TDX) | Hộp việc → **Duyệt** (quản lý trực tiếp) | Việc tới HR nguồn |
| 3 | `tp.nhansu.dienthoai` (TDX) | **Duyệt** | Sinh chứng từ **tiếp nhận** (`hr.transfer_in`) ở Bệnh viện X |
| 4 | `tp.khth.benhvien` (BVX) | **Chọn vị trí tiếp nhận** `Chuyên viên kế hoạch` (ghế `BVX_KHTH.S3`) rồi **Duyệt** | Việc tới HR đích |
| 5 | `tp.tccb.benhvien` (BVX) | **Duyệt** | Sinh chứng từ **quyết định** (`hr.transfer_group`) ở tenant mẹ |
| 6 | `gd.nhansu.tapdoan` (TDX) | **Duyệt** quyết định | Bổ nhiệm ở tenant nguồn kết thúc; người đó có bổ nhiệm ở Bệnh viện X, dùng lại hồ sơ cùng tài khoản |
| 7 | `nv3.muahang.dienthoai` | Đăng nhập, chọn **Bệnh viện X** ở bộ chọn công ty | Thấy dữ liệu của Bệnh viện X theo vị trí mới |

## 6. Lưu ý khi demo

- Người lập đề nghị liên tập đoàn nên là chính nhân viên (hoặc phòng nhân sự). Nếu quản lý trực tiếp tự lập thì bước duyệt đầu tiên chuyển lên cấp trên của quản lý (Giám đốc chuỗi cung ứng) (kết quả quan sát khi chạy thử, hệ thống không giao việc duyệt cho chính người lập).
- Mỗi kịch bản dùng người và ghế riêng, nên chạy độc lập hoặc nối tiếp đều được; muốn chạy lại, đặt lại dữ liệu bằng
  `docker compose down -v && docker compose up -d`.
- Ngày chuyển phải cách ngày gửi ít nhất 14 ngày; quên điều này là lỗi thường gặp nhất khi gửi duyệt.
- Có thể chiếu song song `/p/process`: các quy trình **Tiếp nhận nhân sự**, **Điều chuyển nhân sự nội bộ** và
  **Điều chuyển liên tập đoàn** (xem `platform/flowable/processes/`) mô tả đúng các bước trên.
