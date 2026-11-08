import { tr } from "../../i18n";

/** Văn bản mẫu: ghi quy trình theo mẫu này vào tài liệu trong thư viện tri thức thì dựng được sơ đồ BPMN tự động. */
export const SAMPLE_REGULATION = tr(
  "QUY TRÌNH: Phê duyệt đề nghị mua sắm\nMã quy trình: phe_duyet_mua_sam\nMục đích: Thống nhất cách lập, duyệt và đặt hàng các đề nghị mua sắm.\nPhạm vi áp dụng: Toàn công ty.\n\nCÁC BƯỚC THỰC HIỆN\n\nBước 1. Lập đề nghị mua sắm\n  Người thực hiện: Nhân viên mua hàng\n  Thời hạn: 2 ngày\n  Mô tả: Điền đủ nhà cung cấp, số lượng và đơn giá.\n  Tiếp theo: Bước 2\n\nBước 2. Trưởng phòng duyệt [Phê duyệt]\n  Người thực hiện: Trưởng phòng\n  Nếu đồng ý: chuyển Bước 3\n  Nếu từ chối: kết thúc (Từ chối)\n  Nếu cần bổ sung: quay lại Bước 1\n\nBước 3. Đặt hàng\n  Người thực hiện: Nhân viên mua hàng\n  Thời hạn: 48 giờ\n  Tiếp theo: kết thúc (Hoàn thành)\n",
);
