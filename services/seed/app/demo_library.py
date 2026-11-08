"""Tài liệu thư viện tri thức mô tả đúng các quy tắc đã nạp vào CSDL (hạn mức duyệt, nhóm hàng, luồng duyệt, ràng buộc).

Mỗi mục: (tenant, ghế người ban hành, tiêu đề, loại, phạm vi, nội dung tóm tắt, mục lục). Nội dung phải khớp dữ liệu seed
và hàm CSDL (`wf.resolve_approval_chain`, `wf.act`, `ic.confirm_order`...); đổi quy tắc thì sửa cả tài liệu.
`summary` tối đa 4000 ký tự (ràng buộc của `collab.kb_document`).
"""

EXTRA_DOCS = [
    (
        "TDX",
        "TDX_PC.S1",
        "Quy định hạn mức phê duyệt đề nghị mua sắm của Tập đoàn X",
        "regulation",
        "group",
        (
            "Điều 1. Căn cứ: hạn mức tính theo tổng tiền các dòng hàng của đề nghị tại thời điểm gửi duyệt. Chuỗi duyệt "
            "được chốt lúc gửi; đổi quy tắc về sau không ảnh hưởng đề nghị đang duyệt, đề nghị bị trả về và gửi lại thì "
            "tính lại theo quy tắc lúc gửi lại. Mỗi khoảng tiền tính từ mức tối thiểu (bao gồm) đến mức tối đa (không "
            "bao gồm): đề nghị đúng 50 triệu đồng thuộc khoảng từ 50 triệu, đề nghị đúng 500 triệu đồng thuộc khoảng từ "
            "500 triệu. "
            "Điều 2. Công ty thành viên (Công ty Chip X, Công ty Điện thoại X, Công ty Gia dụng X) và mọi đơn vị thuộc "
            "công ty: dưới 50 triệu đồng một bước, do quản lý trực tiếp của vị trí người lập duyệt (trưởng đơn vị của "
            "người lập nếu vị trí không có quan hệ báo cáo); từ 50 triệu đến dưới 500 triệu đồng một bước, do giám đốc "
            "công ty duyệt (trưởng đơn vị loại Công ty gần nhất trên cây tổ chức của người lập); từ 500 triệu đồng trở "
            "lên hai bước, giám đốc công ty duyệt trước rồi Tổng giám đốc Tập đoàn duyệt sau. "
            "Điều 3. Đơn vị trực thuộc Tập đoàn không phải công ty (Hội đồng quản trị, Khối Tài chính, Khối Nhân sự, "
            "Khối Pháp chế, Văn phòng Chuyển đổi số): dưới 50 triệu đồng một bước, do quản lý trực tiếp duyệt; từ 50 "
            "triệu đồng trở lên một bước, do Tổng giám đốc Tập đoàn duyệt (không có bước giám đốc công ty). "
            "Điều 4. Quy tắc cụ thể hơn thắng quy tắc chung: quy tắc áp cho đơn vị nằm sâu hơn trên cây tổ chức thắng "
            "quy tắc chung của tenant; trong cùng phạm vi, quy tắc gắn với nhóm hàng thắng quy tắc không chỉ định nhóm "
            "hàng. Muốn một nhóm hàng có hạn mức riêng thì khai báo thêm quy tắc cho nhóm đó. "
            "Điều 5. Không có hạn mức trên: mọi đề nghị từ 500 triệu đồng đều đi hai bước, hệ thống không từ chối vì số "
            "tiền lớn. Tuy nhiên nếu không có quy tắc phù hợp với số tiền, hoặc đơn vị cần duyệt chưa có vị trí trưởng, "
            "thì đề nghị không gửi duyệt được và báo lỗi cho người lập. "
            "Điều 6. Bước trùng người: hai bước liền nhau rơi vào cùng một người thì gộp thành một lần duyệt. Người "
            "lập không bao giờ tự duyệt đề nghị của mình; nếu người duyệt trùng người lập hoặc vị trí duyệt không có "
            "người thì bước được đẩy lên trưởng đơn vị cấp trên gần nhất và lịch sử ghi rõ lý do. "
            "Điều 7. Thời hạn: mỗi việc duyệt có thời hạn xử lý 48 giờ kể từ lúc được giao; quá hạn được tô đỏ ở Hộp "
            "việc và tính vào chỉ số quá hạn của Trung tâm điều hành. Thời hạn chỉ để nhắc việc, hệ thống không tự duyệt."
        ),
        [
            "Điều 1. Căn cứ và cách tính khoảng tiền",
            "Điều 2. Công ty thành viên",
            "Điều 3. Đơn vị trực thuộc Tập đoàn",
            "Điều 4. Thứ tự ưu tiên của quy tắc",
            "Điều 5. Không có hạn mức trên",
            "Điều 6. Bước trùng người và đẩy lên cấp trên",
            "Điều 7. Thời hạn xử lý",
        ],
    ),
    (
        "TDX",
        "TDX_PC.S1",
        "Quy định về nhóm hàng, vật tư và nhà cung cấp của Tập đoàn X",
        "regulation",
        "group",
        (
            "Điều 1. Nhóm hàng của Tập đoàn X gồm năm nhóm: Linh kiện điện tử (LINH_KIEN), Thiết bị, máy móc "
            "(THIET_BI), Thiết bị CNTT (CNTT), Văn phòng phẩm (VAN_PHONG), Dịch vụ (DICH_VU). Người lập chọn nhóm hàng "
            "cho đề nghị; nhóm hàng là căn cứ để áp quy tắc hạn mức riêng cho một nhóm (xem Quy định hạn mức phê "
            "duyệt). Hiện Tập đoàn X chưa có quy tắc riêng theo nhóm hàng, mọi nhóm đi theo hạn mức chung. "
            "Điều 2. Vật tư trong danh mục (kèm giá tham khảo): Chip quản lý nguồn PMIC 12.000 đồng/cái; SoC mẫu thử kỹ "
            "thuật 300.000 đồng/cái; Bo mạch thử nghiệm 500.000 đồng/cái (nhóm Linh kiện). Máy đếm hạt bụi phòng sạch "
            "35.000.000 đồng/bộ; Bộ dụng cụ sửa chữa điện tử 3.000.000 đồng/bộ; Đồng hồ vạn năng 3.000.000 đồng/cái "
            "(nhóm Thiết bị). Máy chủ 2U 64 nhân 150.000.000 đồng/cái (nhóm CNTT). Giấy A4 80.000 đồng/ram; Mực in "
            "laser 400.000 đồng/hộp (nhóm Văn phòng phẩm). Vận chuyển hàng nhanh (chuyến) và Bảo trì hệ thống điều hòa "
            "phòng sạch (lần) thuộc nhóm Dịch vụ, không có giá tham khảo nên người lập tự nhập đơn giá. "
            "Điều 3. Dòng hàng: số lượng phải lớn hơn 0, đơn giá không âm. Tổng tiền đề nghị là tổng thành tiền các "
            "dòng. Chỉ sửa được dòng hàng khi đề nghị còn nháp hoặc đã bị trả về; không chuyển dòng hàng sang đề nghị "
            "khác. "
            "Điều 4. Nhà cung cấp trong danh mục: nhà cung cấp nội bộ là các công ty thành viên bán cho nhau gồm Công "
            "ty Chip X, Công ty Điện thoại X, Công ty Gia dụng X; nhà cung cấp bên ngoài gồm Công ty TNHH Thiết bị Kỹ "
            "thuật A, Công ty CP Máy chủ B, Công ty TNHH Văn phòng phẩm C, Công ty CP Dịch vụ Cơ điện D. Nhà cung cấp "
            "nội bộ phải trỏ tới một công ty (pháp nhân). Mua từ nhà cung cấp nội bộ sinh đơn hàng nội bộ (xem Quy "
            "trình đơn hàng nội bộ); không được mua từ chính công ty của đơn vị lập đề nghị. "
            "Điều 5. Nhà cung cấp mới: người lập được gõ tên và mã số thuế ngay trên đề nghị khi nhà cung cấp chưa có "
            "trong danh mục. Người có quyền quản lý dữ liệu chủ (mdm.manage) xét và thêm vào danh mục; khi thêm phải "
            "nhập mã nhà cung cấp. "
            "Điều 6. Quản trị danh mục: nhóm hàng, vật tư và nhà cung cấp do người có quyền mdm.manage quản lý trên "
            "trang Danh mục và dữ liệu chủ; loại đơn vị và chức danh do người có quyền core.org.manage quản lý."
        ),
        [
            "Điều 1. Nhóm hàng",
            "Điều 2. Vật tư và giá tham khảo",
            "Điều 3. Dòng hàng",
            "Điều 4. Nhà cung cấp trong danh mục",
            "Điều 5. Nhà cung cấp mới",
            "Điều 6. Quản trị danh mục",
        ],
    ),
    (
        "TDX",
        "TDX_PC.S1",
        "Quy trình duyệt đề nghị mua sắm: trạng thái, quyền và ràng buộc",
        "sop",
        "group",
        (
            "Bước 1. Lập: người lập phải đang đăng nhập, đang giữ vị trí dùng làm tư cách lập và có quyền lập đề nghị "
            "mua sắm tại đơn vị của vị trí đó. Đề nghị có số chứng từ dạng PR-năm-số, đánh theo công ty và năm, không "
            "nhảy số. Trạng thái ban đầu là Nháp, sửa tự do. "
            "Bước 2. Gửi duyệt: chỉ người lập gửi được, khi đề nghị đang Nháp hoặc Bị trả về và người lập còn giữ vị "
            "trí tư cách lập. Hệ thống chốt chuỗi duyệt theo hạn mức (xem Quy định hạn mức phê duyệt) rồi chuyển sang "
            "Chờ duyệt; mỗi lần gửi là một vòng duyệt mới. Đề nghị mua từ nhà cung cấp nội bộ phải có dòng hàng. "
            "Bước 3. Duyệt từng bước: khi đến lượt, người đang giữ vị trí duyệt (người giữ chính, nếu trống thì người "
            "quyền trưởng) nhận một việc trong Hộp việc. Người được ủy quyền cùng công ty thấy cùng việc; ai duyệt "
            "trước thì việc đóng và lịch sử ghi duyệt thay. Người duyệt chọn Duyệt, Trả lại hoặc Từ chối. Quy chế yêu "
            "cầu ghi lý do khi trả lại hoặc từ chối. "
            "Bước 4. Kết quả: duyệt hết các bước thì đề nghị Đã duyệt. Trả lại thì đề nghị về trạng thái Bị trả về, các "
            "bước chưa tới bị hủy, người lập sửa dòng hàng rồi gửi lại. Từ chối thì đề nghị Bị từ chối và đóng, không "
            "gửi lại được. "
            "Hủy: chỉ người lập hủy được, khi đề nghị đang Nháp, Chờ duyệt hoặc Bị trả về, và bắt buộc ghi lý do. Đề "
            "nghị đã duyệt, bị từ chối hoặc đã hủy không hủy được nữa. "
            "Ràng buộc người duyệt: người lập, hoặc người đứng ở phía bên kia của cùng một giao dịch nội bộ, không "
            "được duyệt. Chỉ người nhận việc hoặc người được ủy quyền hợp lệ mới xử lý được việc. Việc đã đóng không "
            "xử lý lại. Khi bổ nhiệm vào vị trí duyệt thay đổi, việc đang chờ tự chuyển sang người giữ mới. "
            "Tệp đính kèm: mỗi tệp tối đa 25 MB, phải quét sạch mới tải về được; đề nghị đã có kết quả thì không thêm "
            "hoặc xóa tệp. Mọi thay đổi được ghi vào nhật ký kiểm toán chỉ cho ghi thêm."
        ),
        [
            "Bước 1. Lập đề nghị",
            "Bước 2. Gửi duyệt",
            "Bước 3. Duyệt từng bước",
            "Bước 4. Kết quả",
            "Hủy đề nghị",
            "Ràng buộc người duyệt",
            "Tệp đính kèm và nhật ký",
        ],
    ),
    (
        "TDX",
        "TDX_PC.S1",
        "Quy trình đơn hàng nội bộ giữa các công ty trong Tập đoàn",
        "sop",
        "group",
        (
            "Điều 1. Khởi tạo: bên mua lập đề nghị mua sắm và chọn nhà cung cấp nội bộ (Công ty Chip X, Công ty Điện "
            "thoại X hoặc Công ty Gia dụng X). Đề nghị đi qua chuỗi duyệt theo hạn mức của bên mua như mọi đề nghị. "
            "Không đặt hàng nội bộ từ chính công ty của đơn vị lập đề nghị. "
            "Điều 2. Sinh đơn: khi đề nghị được duyệt xong, hệ thống tự sinh đơn hàng nội bộ số IC-năm-số, trạng thái "
            "Chờ xác nhận, chép các dòng hàng của đề nghị và gắn vào đề nghị. "
            "Điều 3. Xác nhận: người có quyền xác nhận đơn hàng nội bộ (ic.order.confirm) ở công ty bán xác nhận kèm lô "
            "xuất cho từng dòng. Người đặt hàng không tự xác nhận đơn của mình. Lô phải thuộc công ty bán, đúng mặt "
            "hàng, đang ở trạng thái xuất được (lô bị giữ không xuất), và còn đủ số lượng; tổng số lượng các dòng dùng "
            "cùng một lô không vượt số lượng của lô. Mặt hàng bên bán có quản lý lô thì bắt buộc chọn lô. Dòng hàng "
            "chỉ ghi một lô. "
            "Điều 4. Đơn mua: xác nhận xong, hệ thống tự sinh đơn mua số PO-năm-số cho bên mua, dòng hàng mang lô nhận "
            "về; đơn hàng nội bộ chuyển sang Đã xác nhận. Đơn mua hiện chỉ sinh từ đơn hàng nội bộ. "
            "Điều 5. Từ chối và hủy: bên bán từ chối khi đơn còn chờ và phải ghi lý do; chỉ người đặt hàng hủy được "
            "đơn khi còn chờ và cũng phải ghi lý do. Đơn đã xác nhận, đã đóng hoặc đã hủy không xử lý lại. "
            "Điều 6. Thông báo và xem đơn: mỗi bước sinh thông báo. Bên mua (người đặt và người xem được đề nghị "
            "nguồn) và bên bán (người có quyền ic.order.read hoặc ic.order.confirm) xem được đơn. "
            "Điều 7. Truy xuất: vì lô được ghi ở bước xác nhận nên từ một lô có vấn đề truy ngược được tới đơn hàng nội "
            "bộ và đơn mua của công ty nhận hàng. "
            "Điều 8. Giới hạn hiện tại: chưa đối trừ công nợ, chưa nhận hàng và hóa đơn trên đơn mua, chưa trừ tồn kho "
            "theo lô."
        ),
        [
            "Điều 1. Khởi tạo đơn",
            "Điều 2. Sinh đơn hàng nội bộ",
            "Điều 3. Xác nhận và lô xuất",
            "Điều 4. Đơn mua",
            "Điều 5. Từ chối và hủy",
            "Điều 6. Thông báo và quyền xem",
            "Điều 7. Truy xuất lô",
            "Điều 8. Giới hạn hiện tại",
        ],
    ),
    (
        "TDX",
        "TDX_CDS.HEAD",
        "Cơ cấu tổ chức Tập đoàn X và ràng buộc về vị trí, bổ nhiệm, quyền",
        "regulation",
        "group",
        (
            "Điều 1. Cơ cấu: Tập đoàn X gồm Hội đồng quản trị, Khối Tài chính, Khối Nhân sự, Khối Pháp chế, Văn phòng "
            "Chuyển đổi số và ba công ty thành viên. Công ty Chip X có Khối R&D, Khối Sản xuất (Nhà máy 1 với Phòng sạch "
            "và Phân xưởng), Khối Chất lượng, Khối Kinh doanh B2B. Công ty Điện thoại X có Khối R&D, Khối Chuỗi cung ứng "
            "(Phòng Mua hàng, Phòng Kho vận), Nhà máy lắp ráp, Khối Kinh doanh. Công ty Gia dụng X có Nhà máy, Khối Phân "
            "phối (Miền Bắc, Miền Nam và các chi nhánh), Trung tâm Bảo hành. Bệnh viện X là công ty con tách riêng vì dữ "
            "liệu y tế, có Khối Lâm sàng, Khối Cận lâm sàng, Khoa Dược, Phòng Kế hoạch tổng hợp, Phòng Tài chính. "
            "Điều 2. Vị trí: quyền gắn với vị trí chứ không gắn với người. Mỗi đơn vị có đúng một vị trí trưởng; tại "
            "một thời điểm một vị trí có tối đa một người giữ. "
            "Điều 3. Bổ nhiệm có bốn loại: giữ chính (mỗi người một vị trí chính tại một thời điểm), kiêm nhiệm, quyền "
            "trưởng (tạm thời vào vị trí trưởng đang trống, mang đủ quyền của vị trí) và hợp đồng (bắt buộc có ngày kết "
            "thúc, không giữ vị trí trưởng nên không bao giờ là người duyệt). Hiệu lực tính theo ngày. Khi bổ nhiệm kết "
            "thúc, chứng từ chưa duyệt xong dưới vị trí đó chuyển cho người giữ vị trí kế tiếp; riêng bổ nhiệm hợp "
            "đồng kết thúc thì chứng từ chưa duyệt xong do người đó lập tự hủy. "
            "Điều 4. Không xóa dữ liệu tổ chức: đơn vị, vị trí, bổ nhiệm và cấp quyền chỉ kết thúc hiệu lực theo ngày để "
            "giữ lịch sử cho chuỗi duyệt và nhật ký kiểm toán. Chỉ người thêm nhầm và chưa phát sinh dấu vết nghiệp "
            "vụ mới được xóa hẳn. "
            "Điều 5. Vai trò và quyền: vai trò là tập hợp quyền, gán cho vị trí, đơn vị hoặc nhóm; gán thẳng cho người "
            "chỉ là ngoại lệ có thời hạn. Quyền lập đề nghị, duyệt, xác nhận đơn hàng nội bộ, quản lý thư viện, quản "
            "trị tác tử AI đều là quyền riêng gán qua vai trò. "
            "Điều 6. Ủy quyền: người giữ vị trí tạm giao một phần quyền cho người khác cùng công ty, có thời hạn; người "
            "giữ vị trí vẫn giữ quyền của mình. "
            "Điều 7. Một tài khoản đăng nhập dùng chung cho mọi công ty cùng tập đoàn, mỗi phiên làm việc chọn đúng một "
            "công ty; dữ liệu mỗi công ty tách biệt."
        ),
        [
            "Điều 1. Cơ cấu tổ chức",
            "Điều 2. Vị trí",
            "Điều 3. Các loại bổ nhiệm",
            "Điều 4. Không xóa dữ liệu tổ chức",
            "Điều 5. Vai trò và quyền",
            "Điều 6. Ủy quyền",
            "Điều 7. Tài khoản và công ty",
        ],
    ),
    (
        "BVX",
        "BVX_KHTH.HEAD",
        "Quy định mua sắm của Bệnh viện X: nhóm hàng và hạn mức phê duyệt",
        "regulation",
        "company",
        (
            "Điều 1. Nhóm hàng của Bệnh viện X gồm ba nhóm: Thiết bị y tế (TBYT), Vật tư y tế (VAT_TU_YT) và Văn phòng "
            "phẩm (VAN_PHONG). Danh mục vật tư có Máy siêu âm 4D, nhóm Thiết bị y tế, giá tham khảo 200.000.000 đồng/máy. "
            "Nhà cung cấp trong danh mục: Công ty CP Thiết bị Y tế E. "
            "Điều 2. Hạn mức cho nhóm hàng thông thường: dưới 50 triệu đồng một bước, do quản lý trực tiếp của vị trí "
            "người lập duyệt (trưởng đơn vị nếu vị trí không có quan hệ báo cáo); từ 50 triệu đồng trở lên một bước, do "
            "giám đốc bệnh viện duyệt. "
            "Điều 3. Nhóm Thiết bị y tế có hạn mức riêng và thắng hạn mức chung: mọi đề nghị thuộc nhóm này, bất kể số "
            "tiền, đều đi hai bước, quản lý trực tiếp duyệt trước rồi giám đốc bệnh viện duyệt sau. Vì vậy người lập "
            "phải chọn đúng nhóm hàng; không chọn nhóm thì đề nghị đi theo hạn mức chung. "
            "Điều 4. Bệnh viện X là công ty con tách riêng nên chứng từ của bệnh viện không hiển thị cho công ty mẹ; "
            "Tập đoàn X chỉ nhận số tổng hợp hành chính (nhân sự, vị trí trống, mua sắm, tiếp nhận, việc duyệt). "
            "Điều 5. Các quy tắc chung về luồng duyệt (người lập không tự duyệt, đẩy lên cấp trên khi thiếu người duyệt, "
            "ủy quyền, hủy và trả về) áp dụng như Tập đoàn X; mỗi việc duyệt có thời hạn 48 giờ."
        ),
        [
            "Điều 1. Nhóm hàng và vật tư",
            "Điều 2. Hạn mức thông thường",
            "Điều 3. Hạn mức riêng của Thiết bị y tế",
            "Điều 4. Phạm vi dữ liệu",
            "Điều 5. Quy tắc chung",
        ],
    ),
]
