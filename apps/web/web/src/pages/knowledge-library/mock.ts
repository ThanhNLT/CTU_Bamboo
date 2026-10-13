// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Thư viện tri thức. Khi có API, thay bằng useList của Refine trả về cùng kiểu ./types.

// ===== Module nội bộ =====
import type { CategoryFilter, DocCategory, LibraryDoc, ScopeFilter } from "./types";

// ===== Hằng số =====
export const CATEGORY_LABEL: Record<DocCategory, string> = {
  regulation: "Quy chế",
  sop: "Quy trình chuẩn (SOP)",
  guide: "Hướng dẫn",
  faq: "Hỏi đáp",
};

/** Nhãn ngắn dùng trong dòng meta và thẻ loại. */
export const CATEGORY_SHORT: Record<DocCategory, string> = {
  regulation: "Quy chế",
  sop: "Quy trình chuẩn",
  guide: "Hướng dẫn",
  faq: "Hỏi đáp",
};

export const SCOPE_OPTIONS: Array<{ label: string; value: ScopeFilter }> = [
  { label: "Tất cả", value: "all" },
  { label: "Tập đoàn", value: "group" },
  { label: "Công ty của tôi", value: "company" },
];

/** Tổng số tài liệu toàn thư viện theo loại (máy chủ đếm; danh sách bên dưới chỉ là một trang). */
export const CATEGORY_TOTALS: Record<CategoryFilter, number> = {
  all: 125,
  regulation: 24,
  sop: 18,
  guide: 31,
  faq: 52,
};

const CLEANROOM_TOC = [
  "Phạm vi áp dụng và cấp độ sạch",
  "Kiểm soát ra vào khóa khí",
  "Giám sát hạt bụi, nhiệt độ, độ ẩm, chênh áp",
  "Phân cấp sự cố và thời hạn báo cáo",
  "Điều 12 – Biên bản xử lý tạm thời",
];

export const MOCK_DOCS: LibraryDoc[] = [
  {
    id: "kb-001",
    title: "Quy chế vận hành phòng sạch",
    category: "regulation",
    scope: "company",
    issuer: "Công ty Chip & Linh kiện",
    version: 3,
    note: "hiệu lực 01/09/2026",
    index: { status: "indexed", chunks: 128, at: "05/10/2026 22:10" },
    owner: "Phòng KT phòng sạch",
    versionLabel: "v3 (2 bản trước)",
    effectiveDate: "01/09/2026",
    pages: 12,
    format: "PDF",
    toc: CLEANROOM_TOC,
    excerpt: {
      heading: "Điều 12 – Biên bản xử lý tạm thời",
      body:
        "Khi chỉ số hạt bụi vượt ngưỡng cấp sạch quá 15 phút, trưởng ca lập biên bản xử lý tạm thời trong vòng 2 giờ, " +
        "đính kèm nhật ký cảm biến và gửi hồ sơ “Báo cáo sự cố phòng sạch” trên e-Office.",
    },
  },
  {
    id: "kb-002",
    title: "SOP xử lý sự cố cấp 2",
    category: "sop",
    scope: "company",
    issuer: "Công ty Chip & Linh kiện",
    version: 2,
    index: { status: "indexed", chunks: 46, at: "28/09/2026 09:30" },
    owner: "Phòng KT phòng sạch",
    versionLabel: "v2 (1 bản trước)",
    effectiveDate: "15/08/2026",
    pages: 6,
    format: "DOCX",
    toc: ["Định nghĩa sự cố cấp 2", "Phân công trực ca", "Các bước khoanh vùng", "Báo cáo và đóng sự cố"],
    excerpt: {
      heading: "Bước 3 – Khoanh vùng",
      body: "Dừng nạp wafer vào khu vực bị ảnh hưởng, gắn biển cảnh báo và chuyển lô đang xử lý sang khu dự phòng trong 30 phút.",
    },
  },
  {
    id: "kb-003",
    title: "Hướng dẫn nộp hồ sơ trên e-Office",
    category: "guide",
    scope: "group",
    issuer: "Tập đoàn",
    version: 5,
    index: { status: "indexed", chunks: 74, at: "01/10/2026 14:05" },
    owner: "Ban Chuyển đổi số",
    versionLabel: "v5 (4 bản trước)",
    effectiveDate: "01/07/2026",
    pages: 18,
    format: "PDF",
    toc: ["Tạo hồ sơ mới", "Đính kèm và kiểm dịch tệp", "Chọn luồng duyệt", "Theo dõi SLA", "Ủy quyền khi vắng mặt"],
    excerpt: {
      heading: "Mục 2 – Đính kèm tệp",
      body: "Mọi tệp đính kèm được quét mã độc tại biên trước khi lưu. Tệp bị chặn sẽ không xuất hiện trong hồ sơ và người nộp nhận thông báo.",
    },
  },
  {
    id: "kb-004",
    title: "Quy chế bảo mật thông tin người bệnh",
    category: "regulation",
    scope: "group",
    issuer: "Tập đoàn",
    version: 1,
    note: "cập nhật 10 phút trước",
    index: { status: "indexing", progress: 42 },
    owner: "Ban Pháp chế",
    versionLabel: "v1 (bản đầu)",
    effectiveDate: "15/10/2026",
    pages: 22,
    format: "PDF",
    toc: ["Phạm vi dữ liệu người bệnh", "Phân quyền truy cập", "Nhật ký truy cập và kiểm toán", "Xử lý vi phạm"],
  },
  {
    id: "kb-005",
    title: "Hỏi đáp: hiệu chuẩn máy đếm hạt bụi",
    category: "faq",
    scope: "company",
    issuer: "Công ty Chip & Linh kiện",
    note: "tệp scan thiếu lớp chữ",
    index: { status: "failed", reason: "Tệp scan thiếu lớp chữ — cần chạy Nhập liệu OCR trước khi nạp" },
    owner: "Tổ Đo lường",
    versionLabel: "v1 (bản đầu)",
    effectiveDate: "20/09/2026",
    pages: 4,
    format: "PDF (scan)",
    toc: ["Chu kỳ hiệu chuẩn", "Đơn vị hiệu chuẩn được chấp nhận", "Xử lý khi lệch số đo"],
  },
  {
    id: "kb-006",
    title: "Quy định an toàn hóa chất trong fab",
    category: "regulation",
    scope: "company",
    issuer: "Công ty Chip & Linh kiện",
    version: 4,
    index: { status: "indexed", chunks: 91, at: "22/09/2026 16:40" },
    owner: "Phòng An toàn – Môi trường",
    versionLabel: "v4 (3 bản trước)",
    effectiveDate: "01/06/2026",
    pages: 15,
    format: "PDF",
    toc: ["Danh mục hóa chất nguy hại", "Lưu trữ và vận chuyển", "Trang bị bảo hộ", "Ứng phó tràn đổ"],
    excerpt: {
      heading: "Điều 9 – Ứng phó tràn đổ",
      body: "Sơ tán bán kính 5 m, kích hoạt hút khí cục bộ và dùng bộ hấp thụ chuyên dụng; báo trưởng ca trong vòng 5 phút.",
    },
  },
];
