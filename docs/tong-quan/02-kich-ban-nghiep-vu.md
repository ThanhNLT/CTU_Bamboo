<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
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

# Kịch bản nghiệp vụ: Tập đoàn X

## 1. Định vị

- DX-OS là nền tảng **trung lập ngành**. Tầng 1 và Tầng 2 không giả định gì về ngành nghề hay cơ cấu tổ chức; đặc thù ngành chỉ nằm ở Tầng 3.
- Kịch bản demo: **Tập đoàn X** (hư cấu, lấy cảm hứng từ mô hình tập đoàn đa ngành kiểu Samsung). Không dùng tên, logo, thương hiệu thật.
- Dữ liệu 100% giả lập: Faker `vi_VN` cho nhân sự và khách hàng, Synthea (FHIR) cho bệnh nhân.

## 2. Các đơn vị và nhóm Tầng 3

| Công ty | Nhóm chính ở Tầng 3 | Nhóm phụ | Điểm nhấn kỹ thuật |
|---|---|---|---|
| Công ty mẹ | (quản trị điều hành) | | IOC hợp nhất, phê duyệt vượt hạn mức |
| Điện thoại | Dòng chảy hàng hóa | Thời gian và dự án | Chuỗi cung ứng, truy xuất theo serial |
| Chip và linh kiện | Tài sản và không gian (MES/SCADA) | Thời gian và dự án | Hội tụ IT/OT: cảm biến phòng sạch → Digital Twin |
| Điện gia dụng | Dòng chảy hàng hóa | Trải nghiệm và thuê bao | Bảo hành, kỹ thuật viên hiện trường, nhà thông minh |
| Bệnh viện | Trải nghiệm và thuê bao (EMR) | Tài sản và không gian | Cách ly dữ liệu nhạy cảm, che PII |

## 3. Mô hình tenant

- **Tenant 1 – Tập đoàn X**: công ty mẹ + 3 công ty công nghiệp, mỗi công ty là `org_unit` loại "Công ty". Lý do: liên thông chặt về mua bán nội bộ và phê duyệt chéo.
- **Tenant 2 – Bệnh viện X**: tenant riêng, cách ly cứng vì dữ liệu sức khỏe là dữ liệu cá nhân nhạy cảm. Công ty mẹ chỉ thấy số liệu tổng hợp đã khử định danh qua Lakehouse.
- Cần bảng `tenant_relation` (mẹ – con) cho báo cáo hợp nhất và luồng liên tenant.

## 4. Cây tổ chức mẫu (mỗi đơn vị tự khai báo, khác nhau)

| Đơn vị | Cây tổ chức |
|---|---|
| Công ty mẹ | HĐQT → Ban TGĐ → Khối Tài chính, Khối Nhân sự, Khối Pháp chế, Văn phòng Chuyển đổi số |
| Chip | Ban GĐ → Khối R&D (Thiết kế vi mạch, Kiểm chứng) → Khối Sản xuất (Nhà máy 1 → Phòng sạch, Phân xưởng) → Khối Chất lượng → Khối Kinh doanh B2B |
| Điện thoại | Ban GĐ → Khối R&D (Phần cứng, Phần mềm, Thiết kế công nghiệp) → Khối Chuỗi cung ứng → Nhà máy lắp ráp → Khối Kinh doanh |
| Gia dụng | Ban GĐ → Nhà máy → Khối Phân phối (Miền Bắc, Miền Nam → Chi nhánh) → Trung tâm Bảo hành → Đội kỹ thuật hiện trường |
| Bệnh viện | Ban Giám đốc → Khối Lâm sàng (Nội, Ngoại, Cấp cứu) → Khối Cận lâm sàng (Xét nghiệm, Chẩn đoán hình ảnh) → Khoa Dược → Phòng KHTH → Phòng Tài chính |

Vai trò chuyển đổi số nên có: CDO/Văn phòng Chuyển đổi số, đội nền tảng (vận hành Tầng 1), chủ quy trình [P], chủ dữ liệu và người quản lý dữ liệu [D], người vận hành tác tử AI [I].

Hiện tượng tổ chức CSDL phải mô tả được: quan hệ ma trận, kiêm nhiệm, quyền và ủy quyền, tái cấu trúc theo thời gian, tách bạch chức danh / vị trí / người / vai trò hệ thống.

## 5. Nhóm nghiệp vụ

| Nhóm | Ví dụ | Tầng |
|---|---|---|
| Quản trị điều hành | Kế hoạch và KPI, quản trị vốn công ty con, báo cáo hợp nhất, rủi ro và kiểm toán, pháp chế và tuân thủ, quản trị dữ liệu, IOC | Tầng 2 ([D], [I]) |
| Hỗ trợ dùng chung | Hành chính văn thư, nhân sự, tài chính kế toán, **mua sắm**, tài sản, hợp đồng, CNTT, truyền thông nội bộ | Tầng 2 ([H], [P]) |
| Cốt lõi theo ngành | Xem mục 6 | Tầng 3 |

Luồng đầu–cuối: Procure-to-Pay, Order-to-Cash, Hire-to-Retire, Record-to-Report, Plan-to-Perform, Issue-to-Resolution.

## 6. Nghiệp vụ cốt lõi từng công ty

- **Công ty mẹ**: phân bổ kế hoạch, KPI; mua sắm tập trung, duyệt vượt hạn mức; báo cáo hợp nhất, loại trừ giao dịch nội bộ; điều hành IOC.
- **Chip**: R&D theo dự án; vận hành nhà máy và phòng sạch (nhiệt độ, độ ẩm, áp suất, mật độ bụi); yield theo lô wafer; bán cho công ty điện thoại, gia dụng và khách ngoài.
- **Điện thoại**: dự án thiết kế, BOM; mua linh kiện (chủ yếu từ công ty chip); lắp ráp, QC, gán serial; phân phối, bảo hành.
- **Gia dụng**: sản xuất, phân phối qua chi nhánh và đại lý; bán lẻ; bảo hành, điều phối kỹ thuật viên; dữ liệu thiết bị nhà thông minh.
- **Bệnh viện**: tiếp đón (định danh, BHYT); khám chữa bệnh trên EMR; xét nghiệm, chẩn đoán hình ảnh; dược; viện phí; trang thiết bị y tế; khám sức khỏe định kỳ cho nhân viên tập đoàn.

## 7. Luồng liên công ty

| Luồng | Mô tả | Năng lực chứng minh |
|---|---|---|
| Mua sắm nội bộ | Đơn bán của công ty chip tự sinh đơn mua của công ty điện thoại; công nợ nội bộ tự đối trừ | Quy trình xuyên đơn vị, sự kiện Kafka, loại trừ khi hợp nhất |
| Phê duyệt theo hạn mức | Đề nghị tự lên đúng cấp duyệt theo số tiền, kể cả lên công ty mẹ | Cây tổ chức + DMN trong Flowable |
| Truy xuất, thu hồi | Lô chip lỗi → lô điện thoại → serial đã bán → khách hàng | Phả hệ dữ liệu, sổ cái bất biến, Lakehouse |
| Khám sức khỏe nhân viên | Nhân sự chỉ nhận kết luận "đủ/không đủ", không thấy bệnh án | Cách ly tenant, che PII |
| Điều hành hợp nhất | IOC: doanh thu, sản lượng, yield, phòng sạch, công suất giường bệnh | Lakehouse, Cube, NGSI-LD |

## 8. Ứng dụng chính: Đề nghị mua sắm – thanh toán qua 4 bậc H-P-D-I

| Bậc | Nội dung |
|---|---|
| [H] | Gửi đề nghị trên cổng nội bộ, trao đổi, đính kèm báo giá |
| [P] | Quy trình BPMN chuẩn; hạn mức duyệt cấu hình theo cây tổ chức (DMN); sinh phiếu, ký số |
| [D] | Dashboard chi tiêu theo công ty, nhà cung cấp, so với ngân sách |
| [I] | OCR báo giá và hóa đơn; RAG hỏi đáp quy chế; cảnh báo giá bất thường hoặc chia nhỏ đơn né hạn mức |

Ví dụ hạn mức (doanh nghiệp tự cấu hình): dưới 50 triệu – trưởng phòng; dưới 500 triệu – giám đốc công ty con; từ 500 triệu – Tổng giám đốc tập đoàn.

## 9. Kịch bản demo 15 phút

1. **Cấu hình tổ chức (2')**: đăng nhập SSO, cho thấy 4 công ty có cây tổ chức khác nhau; thêm phòng ban mới không sửa code.
2. **Sự cố hiện trường (3')**: cảm biến phòng sạch nhà máy chip vượt ngưỡng bụi → Digital Twin đỏ → tự tạo quy trình xử lý sự cố, gắn cờ lô wafer nghi lỗi.
3. **Truy xuất ảnh hưởng (3')**: lô chip đã giao cho công ty điện thoại qua đơn nội bộ; màn hình phả hệ hiển thị lô điện thoại bị ảnh hưởng.
4. **Mua sắm bổ sung (4')**: lập đề nghị mua linh kiện thay thế; báo giá quét đã OCR, tìm và hỏi ra đúng nội dung trong bản quét; RAG trả lời quy chế; vượt hạn mức lên công ty mẹ duyệt; ký số, niêm phong sổ cái.
5. **Bảo mật và nền tảng (3')**: tài khoản công ty mẹ không xem được bệnh án, chỉ thấy số liệu tổng hợp; xóa pod, ArgoCD tự phục hồi.

## 10. Phạm vi 1 tháng

Nguyên tắc: làm sâu phần dùng chung, làm nông phần đặc thù ngành.

- **Bắt buộc**: lược đồ tổ chức + dữ liệu mẫu 5 đơn vị; ứng dụng Refine "Đề nghị mua sắm – thanh toán"; phê duyệt hạn mức bằng DMN; dashboard IOC hợp nhất.
- **Nên có**: cảm biến phòng sạch giả lập → Orion-LD → Digital Twin; đơn hàng nội bộ chip → điện thoại; tenant bệnh viện với dữ liệu Synthea để demo cách ly.
- **Nếu còn thời gian**: truy xuất thu hồi theo serial; app Flutter cho kỹ thuật viên bảo hành; luồng khám sức khỏe nhân viên; app WMS mini tự tạo phiếu nhập kho khi đề nghị mua sắm hoàn tất.
