// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

/** Văn bản mẫu: ghi quy trình theo mẫu này vào tài liệu trong thư viện tri thức thì dựng được sơ đồ BPMN tự động. */
export const SAMPLE_REGULATION = `QUY TRÌNH: Phê duyệt đề nghị mua sắm
Mã quy trình: phe_duyet_mua_sam
Mục đích: Thống nhất cách lập, duyệt và đặt hàng các đề nghị mua sắm.
Phạm vi áp dụng: Toàn công ty.

CÁC BƯỚC THỰC HIỆN

Bước 1. Lập đề nghị mua sắm
  Người thực hiện: Nhân viên mua hàng
  Thời hạn: 2 ngày
  Mô tả: Điền đủ nhà cung cấp, số lượng và đơn giá.
  Tiếp theo: Bước 2

Bước 2. Trưởng phòng duyệt [Phê duyệt]
  Người thực hiện: Trưởng phòng
  Nếu đồng ý: chuyển Bước 3
  Nếu từ chối: kết thúc (Từ chối)
  Nếu cần bổ sung: quay lại Bước 1

Bước 3. Đặt hàng
  Người thực hiện: Nhân viên mua hàng
  Thời hạn: 48 giờ
  Tiếp theo: kết thúc (Hoàn thành)
`;
