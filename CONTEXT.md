# DX-OS – Tập đoàn X

Ngôn ngữ chung của nền tảng DX-OS và kịch bản demo Tập đoàn X: cơ cấu tổ chức, phân quyền, phê duyệt.

## Tổ chức

**Đơn vị** (`org_unit`):
Một nút trong cây tổ chức do doanh nghiệp tự khai báo (công ty, khối, phòng, nhà máy...), thuộc đúng một tenant.
_Tránh dùng_: phòng ban (chỉ là một loại đơn vị), department

**Loại đơn vị**:
Phân loại đơn vị do doanh nghiệp tự định nghĩa (Công ty, Khối, Phòng, Tập đoàn...); hạn mức duyệt chỉ định cấp duyệt theo loại đơn vị.
_Tránh dùng_: cấp, level

**Vị trí** (`position`):
Một ghế cụ thể trong một đơn vị; tại một thời điểm có tối đa một người ngồi, bất kể loại bổ nhiệm. Quyền gắn với vị trí, không gắn với người.
_Tránh dùng_: chức vụ, slot, định biên

**Chức danh**:
Tên gọi công việc gắn cho vị trí (Chuyên viên kế toán, Trưởng phòng...); nhiều vị trí có thể chung một chức danh.
_Tránh dùng_: vị trí, title

**Vị trí trưởng**:
Vị trí được đánh dấu là trưởng của đơn vị; mỗi đơn vị có đúng một vị trí trưởng. Người giữ vị trí này là **trưởng đơn vị**. Phó trưởng không phải vị trí trưởng.
_Tránh dùng_: quản lý đơn vị, head

**Người** (`person`):
Hồ sơ của một cá nhân trong một tenant; giữ vị trí thông qua bổ nhiệm. Một cá nhân làm ở nhiều tenant cùng công ty mẹ có một tài khoản và một người ở mỗi tenant; ở các tenant không liên quan thì có tài khoản riêng.
_Tránh dùng_: user, nhân viên, tài khoản

**Bổ nhiệm** (`assignment`):
Việc một người giữ một vị trí trong một khoảng thời gian, thuộc một trong bốn loại: **giữ chính** (mỗi người một vị trí chính tại một thời điểm, ở công ty ký hợp đồng lao động), **kiêm nhiệm**, **quyền trưởng**, **hợp đồng**. Bổ nhiệm có hiệu lực theo ngày, không theo khung giờ trong ngày. Khi bổ nhiệm (trừ hợp đồng) kết thúc, chứng từ chưa duyệt xong lập dưới vị trí đó chuyển cho người giữ vị trí kế tiếp.
_Tránh dùng_: phân công, gán

**Bổ nhiệm hợp đồng**:
Bổ nhiệm vào một vị trí theo hợp đồng thuê có thời hạn, cho người mà nơi giữ chính ở công ty khác (hoặc ngoài nền tảng); bắt buộc có ngày kết thúc, không tính định biên, không giữ vị trí trưởng nên không bao giờ là người duyệt; vị trí báo cáo cho người quản lý hợp đồng bên thuê. Khi hợp đồng kết thúc, chứng từ người đó lập chưa duyệt xong (nháp, chờ duyệt, bị trả về) tự hủy.
_Tránh dùng_: kiêm nhiệm (khi là quan hệ thuê), cộng tác viên, part-time

**Người quản lý hợp đồng**:
Người bên thuê phụ trách hợp đồng thuê một người theo bổ nhiệm hợp đồng; là quản lý trực tiếp của người được thuê tại bên thuê.
_Tránh dùng_: người thuê, chủ hợp đồng

**Quyền trưởng** (ACTING):
Bổ nhiệm tạm thời vào một vị trí đang trống; người làm quyền trưởng mang toàn bộ quyền của vị trí và được chọn làm người duyệt.
_Tránh dùng_: tạm quyền, quyền giám đốc (khi vị trí có người giữ)

**Ủy quyền** (`delegation`):
Người giữ vị trí tạm giao một phần quyền của vị trí (theo danh sách quyền) cho người khác cùng công ty, không theo hợp đồng, trong thời gian vắng mặt; người giữ vị trí vẫn giữ quyền của mình.
_Tránh dùng_: quyền trưởng, ủy nhiệm

**Quản lý trực tiếp**:
Người giữ vị trí mà vị trí của người lập báo cáo cho; nếu vị trí không có quan hệ báo cáo thì là trưởng đơn vị của người lập.
_Tránh dùng_: sếp, cấp trên (mơ hồ giữa cây đơn vị và quan hệ báo cáo)

**Quan hệ ma trận**:
Liên kết phối hợp giữa hai đơn vị ngoài cây tổ chức (ví dụ biệt phái sang dự án); chỉ cho quyền xem và phối hợp, không bao giờ quyết định người duyệt.
_Tránh dùng_: báo cáo kép

**Vai trò**:
Tập hợp quyền do doanh nghiệp định nghĩa, gán cho vị trí, đơn vị hoặc nhóm; gán thẳng cho người chỉ là ngoại lệ có thời hạn cho người ngoài cây tổ chức.
_Tránh dùng_: role Keycloak, chức danh

**Tài khoản**:
Danh tính đăng nhập của một cá nhân; dùng chung cho mọi tenant cùng công ty mẹ, mỗi phiên làm việc chọn đúng một tenant.
_Tránh dùng_: người, user

## Phê duyệt

**Tư cách lập**:
Vị trí (giữ chính hoặc kiêm nhiệm) mà người lập chọn khi lập chứng từ; chuỗi duyệt tính từ vị trí này.
_Tránh dùng_: đơn vị của người lập

**Chuỗi duyệt**:
Danh sách có thứ tự các vị trí phải duyệt một chứng từ, chốt lúc gửi duyệt theo quy tắc hạn mức hiệu lực khi đó. Người duyệt ở mỗi bước là người đang giữ vị trí khi đến lượt bước đó.
_Tránh dùng_: danh sách người duyệt, approver list

**Đẩy lên cấp trên**:
Khi vị trí duyệt không có người duyệt hợp lệ (vị trí trống không có quyền trưởng, trùng người lập, hoặc người duyệt đã đứng ở phía bên kia của cùng một giao dịch nội bộ), bước duyệt chuyển cho trưởng đơn vị cấp trên gần nhất (trường hợp giao dịch nội bộ: quản lý trực tiếp của vị trí người đó ở phía có bước duyệt); lịch sử duyệt ghi rõ lý do. Việc đã đẩy lên thì ở lại cấp trên, kể cả khi vị trí sau đó có người.
_Tránh dùng_: escalate, bỏ qua bước

**Việc duyệt** (`wf.task`):
Một bước của chuỗi duyệt đã giao cho một người cụ thể, nằm trong hộp việc của người đó. Khi bổ nhiệm vào vị trí duyệt thay đổi, việc đang chờ tự chuyển sang người giữ mới. Không còn ai hợp lệ thì việc nằm chờ tại vị trí cho đến khi có người.
_Tránh dùng_: task, nhiệm vụ
