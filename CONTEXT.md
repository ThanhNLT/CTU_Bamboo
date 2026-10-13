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

## Mua sắm

**Đề nghị mua sắm** (`proc.purchase_request`):
Chứng từ người lập gửi để xin mua hàng hóa, dịch vụ; có số chứng từ, lập dưới một tư cách lập, đi qua chuỗi duyệt. Người lập hủy được khi chưa duyệt xong.
_Tránh dùng_: phiếu yêu cầu, PR (chỉ dùng làm tiền tố số chứng từ)

**Số chứng từ**:
Mã hiển thị dạng `PR-2026-000001`, đánh theo tenant, loại chứng từ và năm (giờ Việt Nam), không nhảy số.
_Tránh dùng_: mã phiếu, id

**Dòng hàng** (`proc.purchase_request_item`):
Một mặt hàng trong đề nghị: mô tả, đơn vị tính, số lượng, đơn giá. Đề nghị có dòng hàng thì tổng tiền là tổng các dòng; chỉ sửa được khi đề nghị còn nháp hoặc bị trả về.
_Tránh dùng_: chi tiết, line item

**Nhà cung cấp** (`mdm.partner`):
Đối tác bán hàng cho doanh nghiệp. **Nhà cung cấp nội bộ** trỏ tới một công ty trong cùng tenant, dùng cho giao dịch nội bộ.
_Tránh dùng_: vendor, đối tác (khi chỉ người bán)

**Đơn hàng nội bộ** (`ic.ic_order`):
Chứng từ một công ty trong tập đoàn mua của công ty khác, số `IC-…`. Tự sinh khi đề nghị mua từ nhà cung cấp nội bộ được duyệt; bên bán xác nhận kèm lô xuất hoặc từ chối, người đặt hủy được khi còn chờ.
_Tránh dùng_: đơn bán nội bộ, giao dịch liên công ty, intercompany

**Đơn mua** (`proc.purchase_order`):
Chứng từ của bên mua gửi nhà cung cấp, số `PO-…`, sinh từ đề nghị đã duyệt (hiện chỉ khi đơn hàng nội bộ được xác nhận).
_Tránh dùng_: PO (chỉ dùng làm tiền tố số chứng từ), đơn đặt hàng

**Lô** (`mfg.lot`):
Một mẻ sản xuất của một mặt hàng ở một đơn vị sản xuất, có số lượng và trạng thái (đang xuất được, bị giữ, hủy). Dòng hàng của đơn hàng nội bộ ghi lô xuất để truy xuất.
_Tránh dùng_: batch, mẻ (khi nói chứng từ)

**Vật tư** (`mdm.item`):
Mặt hàng trong danh mục dùng chung của tenant (mã, tên, đơn vị tính, nhóm hàng, giá tham khảo). **Nhóm hàng** là danh mục `ITEM_CATEGORY`; quy tắc hạn mức có thể chỉ áp cho một nhóm hàng.
_Tránh dùng_: sản phẩm, hàng hóa (khi nói danh mục)

## Nhân sự

**Đề nghị tiếp nhận nhân sự** (`hr.onboarding_request`):
Chứng từ phòng nhân sự lập để xin nhận một ứng viên vào một vị trí còn trống, kèm ngày vào làm, loại hợp đồng, lương đề xuất; số chứng từ dạng `TN-2026-000001`. Thứ được duyệt là quyết định bổ nhiệm, không phải việc nhập dữ liệu. Chuỗi duyệt tính từ vị trí được bổ nhiệm (quản lý trực tiếp của vị trí rồi giám đốc công ty), không từ tư cách lập. Duyệt xong thì ứng viên thành một người có bổ nhiệm giữ chính từ ngày vào làm.
_Tránh dùng_: hồ sơ nhân viên (khi nói chứng từ xin duyệt), duyệt hồ sơ, onboarding

**Ứng viên**:
Cá nhân được đề nghị tiếp nhận, chưa phải người của tenant cho tới khi đề nghị được duyệt.
_Tránh dùng_: nhân viên mới (trước khi duyệt), người

**Dữ liệu cá nhân nhạy cảm**:
Số CCCD, số tài khoản ngân hàng, địa chỉ của ứng viên; chỉ phòng nhân sự xem được bản đầy đủ, mỗi lần xem đều được ghi lại. Những người khác xem được đề nghị chỉ thấy **bản che** (ví dụ `•••••••••789`).
_Tránh dùng_: PII (trong giao diện), thông tin bí mật

**Bản che** (che dữ liệu cá nhân):
Giá trị đã thay phần lớn ký tự để người đọc vẫn đối chiếu được mà không đọc được toàn bộ: `•••••••••789`, `0912 *** 678`, `n***@…`. Nhật ký kiểm toán chỉ hiện bản che; ô trao đổi đề nghị gửi bản che khi phát hiện số CCCD, điện thoại, tài khoản.
_Tránh dùng_: mask, ẩn (khi giá trị vẫn hiện một phần)

## Kiểm toán và cộng tác

**Nhật ký kiểm toán** (`audit.log`):
Bản ghi mọi thay đổi trên bảng nghiệp vụ (dữ liệu cũ/mới, cột đổi, người thực hiện), nối chuỗi hash theo từng tenant, chỉ ghi thêm. Người có quyền `audit.read` trong tenant xem và đối soát được.
_Tránh dùng_: log, lịch sử duyệt (lịch sử duyệt là `wf.approval_history`)

**Đối soát chuỗi**:
Tính lại hash từng dòng nhật ký của tenant để phát hiện dòng bị sửa, bị xóa hoặc mất ở cuối chuỗi.
_Tránh dùng_: verify ledger (chỉ dùng cho immudb)

**Bình luận** (`collab.comment`):
Trao đổi gắn với một chứng từ, trả lời theo luồng, nhắc tên được người xem được chứng từ; xóa là xóa mềm.
_Tránh dùng_: chat, ghi chú duyệt (ghi chú duyệt nằm ở bước duyệt)

**Thông báo** (`collab.notification`):
Tin báo cho đúng một người, sinh tự động khi được giao việc duyệt, khi chứng từ của mình có kết quả, khi có bình luận hoặc được nhắc tên. Người gây ra sự kiện không tự nhận thông báo.
_Tránh dùng_: alert, tin nhắn

## Dữ liệu

**Tập dữ liệu** (view `lakehouse.silver.<schema>_<bảng>`):
Trạng thái hiện tại của một bảng nghiệp vụ trong Lakehouse, dựng từ lịch sử thay đổi (CDC) ở tầng bronze; mỗi bản ghi một dòng. Người có quyền `data.lakehouse.read` xem tập dữ liệu của tenant đang chọn trên trang Dịch vụ dữ liệu, dữ liệu cá nhân đã che.
_Tránh dùng_: bảng (bảng là ở CSDL nghiệp vụ), mart (mart là bảng tổng hợp cho BI, chưa có)

**Người dùng tenant của Trino** (`t_<tenant_id>`):
Danh tính mà dịch vụ actions mượn khi truy vấn Lakehouse thay người dùng của một tenant; Trino chỉ cho danh tính này đọc tập dữ liệu có cột tenant và tự lọc về đúng tenant đó (ADR #45).
_Tránh dùng_: tài khoản Trino (tài khoản là `bms-admin`, `bms-actions`, có mật khẩu)
