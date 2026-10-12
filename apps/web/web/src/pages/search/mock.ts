// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Chỉ mục MẪU cho các phân hệ chưa nối API tìm kiếm (Bản sao số, Thư viện, Ổ đĩa, Dịch vụ dữ liệu, hồ sơ e-Office mẫu).
// Đề nghị mua sắm và tệp đính kèm thì tìm THẬT qua Action search_documents (xem ./useDocumentSearch).
// Điểm "khớp ý nghĩa" ở đây thay cho Qdrant; nội dung khớp số liệu các trang khác (CR-02, SMT-TN-02, TL-HD-02…).
import type { Company, Concept, IndexedItem, ResultType } from "./types";

export const CONCEPTS: Concept[] = [
  {
    key: "heat",
    label: "nhiệt độ thiết bị vượt ngưỡng",
    synonyms: ["quá nhiệt", "nhiệt độ phòng sạch cao"],
    triggers: ["nong", "nhiet", "qua nhiet", "tan nhiet", "toa nhiet"],
    highlights: ["nhiệt độ buồng tăng", "quá nhiệt", "quá nóng", "nóng", "nhiệt độ", "vượt ngưỡng"],
  },
  {
    key: "dust",
    label: "hạt bụi phòng sạch vượt ngưỡng",
    synonyms: ["phòng sạch bẩn", "vượt cấp sạch ISO 5"],
    triggers: ["bui", "phong sach", "iso 5", "cap sach"],
    highlights: ["hạt bụi", "phòng sạch", "vượt ngưỡng", "ISO 5"],
  },
  {
    key: "oee",
    label: "hiệu suất dây chuyền giảm",
    synonyms: ["dừng máy", "OEE thấp"],
    triggers: ["oee", "dung may", "hieu suat", "nang suat", "dung chuyen"],
    highlights: ["OEE", "dừng", "hiệu suất"],
  },
];

export const TYPE_LABEL: Record<ResultType, string> = {
  record: "Hồ sơ",
  document: "Tài liệu",
  knowledge: "Tri thức",
  twin: "Bản sao số",
  data: "Dữ liệu",
};

export const COMPANY_LABEL: Record<Company, string> = {
  chip: "Chip & Linh kiện",
  phone: "Điện thoại",
  appliance: "Gia dụng",
  hospital: "Bệnh viện",
};

/** Bộ lọc mặc định như thiết kế: bỏ chọn "Dữ liệu" (và "Gia dụng" khi được xem nhiều công ty). */
export const DEFAULT_TYPES: ResultType[] = ["record", "document", "knowledge", "twin"];
export const DEFAULT_QUERY = "máy bị nóng quá";
export const EXAMPLE_QUERIES = ["máy bị nóng quá", "hạt bụi phòng sạch", "OEE giảm"];

export const SEARCH_INDEX: IndexedItem[] = [
  // ---- Ý định "nhiệt độ thiết bị vượt ngưỡng" ----
  {
    id: "tw-smt-tn-02", type: "twin", company: "phone", title: "Dây chuyền SMT TN-02 · Nhà máy điện thoại Thái Nguyên",
    breadcrumb: "Bản sao số › Dây chuyền SMT", snippet: "Nhiệt độ đỉnh lò reflow 252 °C, vượt ngưỡng tối đa 250 °C từ 10:27.",
    to: "/d/twin?entity=SMT-TN-02", concepts: { heat: 0.91, oee: 0.42 }, daysAgo: 0, updatedLabel: "Cập nhật 10:42",
  },
  {
    id: "rec-00131", type: "record", company: "chip", title: "Báo cáo sự cố quá nhiệt máy khắc PE-04",
    breadcrumb: "Hồ sơ › HS-SEMI-2026-00131", snippet: "Máy khắc plasma PE-04 báo lỗi E-217, nhiệt độ buồng tăng bất thường trong ca đêm, đã dừng máy để kiểm tra.",
    to: "/p/records", concepts: { heat: 0.88 }, daysAgo: 3,
  },
  {
    id: "kb-qt-kt-07", type: "knowledge", company: "chip", title: "Quy trình xử lý thiết bị quá nhiệt (QT-KT-07)",
    breadcrumb: "Thư viện tri thức › Quy trình chuẩn", snippet: "Điều 4: khi nhiệt độ vượt ngưỡng vận hành, tắt nguồn cấp nhiệt và ghi nhận vào nhật ký ca trước khi khởi động lại.",
    to: "/h/library", concepts: { heat: 0.84 }, daysAgo: 12,
  },
  {
    id: "rec-00106", type: "record", company: "chip", title: "Báo cáo nhiệt độ lò khuếch tán F-3",
    breadcrumb: "Hồ sơ › HS-SEMI-2026-00106", snippet: "Nhiệt độ lò khuếch tán F-3 dao động ±4 °C, vượt dung sai quy trình trong 2 mẻ liên tiếp.",
    to: "/p/records", concepts: { heat: 0.8 }, daysAgo: 6,
  },
  {
    id: "tw-cr-02", type: "twin", company: "chip", title: "Phòng sạch CR-02 · Nhà máy chip Bắc Ninh",
    breadcrumb: "Bản sao số › Phòng sạch", snippet: "Hạt bụi ≥0,5 µm vượt ngưỡng ISO 5 trong 18 phút; chênh áp thấp 8 Pa, nhiệt độ 21,4 °C vẫn trong ngưỡng.",
    to: "/d/twin?entity=CR-02", concepts: { heat: 0.64, dust: 0.95 }, daysAgo: 0, updatedLabel: "Cập nhật 10:42",
  },
  {
    id: "doc-reflow-09", type: "document", company: "phone", title: "bien-ban-bao-tri-reflow-thang-9.pdf", mono: true,
    breadcrumb: "Ổ đĩa tài liệu › Báo cáo bảo trì", snippet: "…lò hàn reflow nóng quá mức ở vùng 6, đã thay cảm biến nhiệt và hiệu chỉnh lại cấu hình nhiệt.",
    to: "/h/drive", concepts: { heat: 0.71 }, daysAgo: 19,
  },
  {
    id: "rec-00412", type: "record", company: "phone", title: "Đề nghị thay quạt tản nhiệt SMT-02",
    breadcrumb: "Hồ sơ › HS-MOB-2026-00412 · Công ty Điện thoại", snippet: "Quạt tản nhiệt hỏng khiến máy gắp linh kiện quá nóng sau 2 giờ chạy liên tục.",
    to: "/p/records", concepts: { heat: 0.69, oee: 0.35 }, daysAgo: 8,
  },
  {
    id: "kb-cleanroom-7", type: "knowledge", company: "chip", title: "Quy chế vận hành phòng sạch · Điều 7 Giám sát môi trường",
    breadcrumb: "Thư viện tri thức › Quy chế", snippet: "Nhiệt độ phòng sạch duy trì 20–22 °C; vượt ngưỡng quá 15 phút phải lập biên bản xử lý tạm thời.",
    to: "/h/library", concepts: { heat: 0.66, dust: 0.85 }, daysAgo: 41,
  },
  {
    id: "doc-shift-0110", type: "document", company: "chip", title: "nhat-ky-ca-dem-01-10.xlsx", mono: true,
    breadcrumb: "Ổ đĩa tài liệu › Nhật ký ca", snippet: "Ghi nhận nhiệt độ phòng sạch CR-03 cao hơn bình thường 0,6 °C trong 40 phút, độ ẩm 52%.",
    to: "/h/drive", concepts: { heat: 0.6, dust: 0.4 }, daysAgo: 11,
  },
  {
    id: "data-temp-hourly", type: "data", company: "phone", title: "mart.smt_oee_hourly · cột temp_max", mono: true,
    breadcrumb: "Dịch vụ dữ liệu", snippet: "Nhiệt độ tối đa theo giờ của từng dây chuyền SMT, dùng cho cảnh báo quá nhiệt.",
    to: "/d/services?dataset=ds-smt-oee", concepts: { heat: 0.62, oee: 0.7 }, daysAgo: 1,
  },
  {
    id: "rec-00305", type: "record", company: "phone", title: "Báo cáo lỗi dây chuyền SMT-02",
    breadcrumb: "Hồ sơ › HS-MOB-2026-00305 · Công ty Điện thoại", snippet: "SMT-02 dừng 9 giờ ngày 01/10 do lỗi cấp linh kiện; OEE tuần 40 giảm 3,2 điểm.",
    to: "/p/tasks", concepts: { oee: 0.93, heat: 0.3 }, daysAgo: 2,
  },
  {
    id: "rec-00052", type: "record", company: "chip", title: "Báo cáo nhiệt độ lò khuếch tán",
    breadcrumb: "Hồ sơ › HS-SEMI-2026-00052", snippet: "Nhiệt độ lò khuếch tán tăng 3 °C so với hồ sơ chuẩn, đã hiệu chỉnh bộ điều nhiệt.",
    to: "/p/records", concepts: { heat: 0.64 }, daysAgo: 52,
  },
  {
    id: "doc-press-check", type: "document", company: "appliance", title: "Phiếu kiểm tra máy ép nhựa quá nhiệt.docx", mono: true,
    breadcrumb: "Ổ đĩa tài liệu › Công ty Gia dụng", snippet: "Máy ép nhựa số 3 quá nhiệt ở vùng gia nhiệt 2, cần thay cặp nhiệt điện.",
    to: "/h/drive", concepts: { heat: 0.67 }, daysAgo: 9,
  },
  {
    id: "kb-press-faq", type: "knowledge", company: "appliance", title: "Hỏi đáp: máy ép nhựa nóng bất thường",
    breadcrumb: "Thư viện tri thức › Hỏi đáp", snippet: "Máy ép nóng bất thường thường do cặp nhiệt điện lệch hoặc quạt làm mát bị tắc.",
    to: "/h/library", concepts: { heat: 0.58 }, daysAgo: 25,
  },
  {
    id: "tw-dryer-02", type: "twin", company: "chip", title: "Tủ sấy wafer DO-02",
    breadcrumb: "Bản sao số › Thiết bị phụ trợ", snippet: "Nhiệt độ tủ sấy 182 °C, trong ngưỡng 175–185 °C; quạt tuần hoàn hoạt động bình thường.",
    to: "/d/twin", concepts: { heat: 0.52 }, daysAgo: 0, updatedLabel: "Cập nhật 10:41",
  },
  // Bệnh viện: tenant riêng → ẩn với người dùng Tập đoàn / công ty con (đếm vào "bị ẩn").
  {
    id: "tw-tl-hd-02", type: "twin", company: "hospital", title: "Tủ bảo quản vắc-xin TL-HD-02",
    breadcrumb: "Bản sao số › Thiết bị y tế", snippet: "Nhiệt độ tủ vượt ngưỡng 8 °C trong 24 phút, hiện 7,4 °C.",
    to: "/d/twin?entity=TL-HD-02", concepts: { heat: 0.89 }, daysAgo: 0, updatedLabel: "Cập nhật 10:42",
  },
  {
    id: "rec-hos-0088", type: "record", company: "hospital", title: "Báo cáo nhiệt độ phòng mổ số 3",
    breadcrumb: "Hồ sơ › HS-HOS-2026-00088", snippet: "Nhiệt độ phòng mổ số 3 lên 27 °C do điều hòa trung tâm quá tải.",
    to: "/p/records", concepts: { heat: 0.74 }, daysAgo: 5,
  },
  {
    id: "kb-hos-vaccine", type: "knowledge", company: "hospital", title: "Quy định bảo quản vắc-xin 2–8 °C",
    breadcrumb: "Thư viện tri thức › Quy định", snippet: "Khi nhiệt độ tủ vượt ngưỡng, chuyển vắc-xin sang tủ dự phòng trong 30 phút và ghi sổ theo dõi.",
    to: "/h/library", concepts: { heat: 0.7 }, daysAgo: 30,
  },

  // ---- Ý định "hạt bụi phòng sạch" ----
  {
    id: "rec-00125", type: "record", company: "chip", title: "Báo cáo sự cố phòng sạch CR-02",
    breadcrumb: "Hồ sơ › HS-SEMI-2026-00125", snippet: "Hạt bụi ≥0,5 µm vượt ngưỡng ISO 5 trong 18 phút (10:12–10:29), đỉnh 3.683 hạt/m³.",
    to: "/p/tasks", concepts: { dust: 0.94 }, daysAgo: 2,
  },
  {
    id: "rec-00118", type: "record", company: "chip", title: "Yêu cầu hiệu chuẩn máy đếm hạt bụi",
    breadcrumb: "Hồ sơ › HS-SEMI-2026-00118", snippet: "Máy đếm hạt PC-07 lệch 6% so với chuẩn, đề nghị hiệu chuẩn trước ca sản xuất.",
    to: "/p/records", concepts: { dust: 0.8 }, daysAgo: 1,
  },
  {
    id: "kb-particle-faq", type: "knowledge", company: "chip", title: "Hỏi đáp: hiệu chuẩn máy đếm hạt bụi",
    breadcrumb: "Thư viện tri thức › Hỏi đáp", snippet: "Chu kỳ hiệu chuẩn máy đếm hạt bụi là 12 tháng, hoặc sớm hơn khi lệch quá 5%.",
    to: "/h/library", concepts: { dust: 0.78 }, daysAgo: 60,
  },
  {
    id: "rec-00109", type: "record", company: "chip", title: "Đề xuất thay bộ lọc HEPA phòng sạch CR-01",
    breadcrumb: "Hồ sơ › HS-SEMI-2026-00109", snippet: "Bộ lọc HEPA CR-01 đạt 92% tuổi thọ, chênh áp qua lọc tăng dần.",
    to: "/p/records", concepts: { dust: 0.7 }, daysAgo: 2,
  },

  // ---- Ý định "hiệu suất dây chuyền" ----
  {
    id: "data-oee", type: "data", company: "phone", title: "mart.smt_oee_hourly", mono: true,
    breadcrumb: "Dịch vụ dữ liệu", snippet: "OEE theo giờ cho từng dây chuyền SMT = Sẵn sàng × Hiệu năng × Chất lượng.",
    to: "/d/services?dataset=ds-smt-oee", concepts: { oee: 0.86 }, daysAgo: 1,
  },
  {
    id: "tw-smt-bg-03", type: "twin", company: "phone", title: "Dây chuyền SMT BG-03 · Nhà máy điện thoại Bắc Giang",
    breadcrumb: "Bản sao số › Dây chuyền SMT", snippet: "Tỷ lệ lỗi AOI vượt ngưỡng 0,5% trong 21 phút, hiện 0,41%; dây chuyền vẫn chạy.",
    to: "/d/twin?entity=SMT-BG-03", concepts: { oee: 0.6 }, daysAgo: 0, updatedLabel: "Cập nhật 10:42",
  },
  {
    id: "kb-sop-l2", type: "knowledge", company: "chip", title: "SOP xử lý sự cố cấp 2",
    breadcrumb: "Thư viện tri thức › Quy trình chuẩn", snippet: "Sự cố cấp 2 làm dừng dây chuyền quá 2 giờ phải báo Ban điều hành trong ca.",
    to: "/h/library", concepts: { oee: 0.55, heat: 0.33 }, daysAgo: 70,
  },
];
