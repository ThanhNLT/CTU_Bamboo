// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Hộp việc (5 việc của tôi + 7 việc khác trong nhóm = 12). Khi có API, thay bằng
// useList(wf_v_inbox) của Refine trả về cùng kiểu ./types; quyết định gọi Action act_on_task như ActModal.
import type { InboxTask } from "./types";

export const MOCK_ME = "Nguyễn Ngọc Anh";

/** Việc chọn sẵn khi URL chưa có ?code= (đúng như ảnh thiết kế). Đặt undefined để mặc định chọn việc gấp nhất. */
export const MOCK_INITIAL_CODE: string | undefined = "HS-SEMI-2026-00125";

const ORG = "Công ty Chip & Linh kiện · Nhà máy Bắc Ninh";
const SHA = "3f9a7d0e5b14c21e8a6c0f4d2b9e1a7c5d3f8b0e2c4a6d8f1b3e5c7a9d0f2c21e";
const CLEANROOM_RULE = { label: "[1] Quy chế vận hành phòng sạch v3", to: "/h/library" };

const pdf = (name: string, pages: number, sha = SHA) => ({ name, kind: "pdf" as const, pages, sha256: sha, scan: "clean" as const });
const png = (name: string, sha = SHA) => ({ name, kind: "image" as const, pages: 1, sha256: sha, scan: "clean" as const });

export const MOCK_TASKS: InboxTask[] = [
  {
    id: "t-00109", code: "HS-SEMI-2026-00109", title: "Đề xuất thay bộ lọc HEPA phòng sạch CR-01", level: 1,
    assignee: MOCK_ME, dueAt: "2026-10-07T06:00:00+07:00", sla: { level: "overdue", label: "quá hạn 3 giờ" },
    attachments: [pdf("de-xuat-hepa-CR01.pdf", 3, "b71c09e2d4a6f8135e7c9a0b2d4f6e81a3c5e7092b4d6f8a1c3e5b7d9f0a24d1"), pdf("bao-gia-hepa.pdf", 2)],
    info: { submitter: "Nguyễn Văn Tùng", unit: "Tổ bảo trì CR", device: { label: "CR-01 · bản sao số", to: "/d/twin?entity=CR-01" }, phone: "0903 *** 214", dataTier: "Nóng" },
    ai: {
      bullets: ["Chênh áp qua bộ lọc tăng 38% trong 30 ngày.", "Bộ lọc hiện tại đã dùng 14 tháng (khuyến nghị 12).", "Báo giá nằm trong hạn mức duyệt cấp 1."],
      citation: CLEANROOM_RULE,
    },
    preview: { org: ORG, heading: "ĐỀ XUẤT THAY BỘ LỌC HEPA CR-01", subline: "Hạng mục: Bảo trì · 05/10/2026 08:20" },
  },
  {
    id: "t-00125", code: "HS-SEMI-2026-00125", title: "Báo cáo sự cố phòng sạch CR-02", level: 1,
    assignee: MOCK_ME, dueAt: "2026-10-07T12:20:00+07:00", sla: { level: "urgent", label: "còn 3 giờ 20 phút" },
    attachments: [pdf("bao-cao-su-co-CR02.pdf", 4), png("nhat-ky-cam-bien.png")],
    info: { submitter: "Trần Minh Quân", unit: "Tổ vận hành CR", device: { label: "CR-02 · bản sao số", to: "/d/twin?entity=CR-02" }, phone: "0912 *** 678", dataTier: "Nóng" },
    ai: {
      bullets: ["Hạt bụi vượt ngưỡng ISO 5 trong 18 phút.", "Nguyên nhân sơ bộ: chênh áp giảm khi mở khóa khí.", "Thiếu biên bản theo Điều 12 [1]."],
      citation: CLEANROOM_RULE,
    },
    preview: { org: ORG, heading: "BÁO CÁO SỰ CỐ PHÒNG SẠCH CR-02", subline: "Mức độ: Cấp 2 · 07/10/2026 06:40" },
  },
  {
    id: "t-00121", code: "HS-SEMI-2026-00121", title: "Phiếu xuất xưởng lô wafer W-77", level: 1,
    assignee: MOCK_ME, dueAt: "2026-10-08T09:00:00+07:00", sla: { level: "ok", label: "còn 1 ngày" },
    attachments: [pdf("phieu-xuat-W77.pdf", 2), pdf("ket-qua-kiem-tra-W77.pdf", 6)],
    info: { submitter: "Lê Thu Hà", unit: "Tổ QA wafer", device: { label: "Line W · bản sao số", to: "/d/twin" }, phone: "0987 *** 102", dataTier: "Ấm" },
    ai: { bullets: ["Tỷ lệ đạt 98,6% — trên ngưỡng xuất xưởng 97%.", "Đủ 3/3 chữ ký kiểm tra chất lượng."] },
    preview: { org: ORG, heading: "PHIẾU XUẤT XƯỞNG LÔ W-77", subline: "Số lượng: 25 wafer · 06/10/2026 15:40" },
  },
  {
    id: "t-00118", code: "HS-SEMI-2026-00118", title: "Yêu cầu hiệu chuẩn máy đếm hạt bụi", level: 1,
    assignee: MOCK_ME, dueAt: "2026-10-09T09:00:00+07:00", sla: { level: "ok", label: "còn 2 ngày" },
    attachments: [pdf("yeu-cau-hieu-chuan.pdf", 2), pdf("chung-chi-hieu-chuan-2025.pdf", 1)],
    info: { submitter: "Phạm Đức Long", unit: "Tổ Đo lường", device: { label: "PC-07 · máy đếm hạt", to: "/d/twin" }, phone: "0935 *** 447", dataTier: "Nóng" },
    ai: {
      bullets: ["Chứng chỉ hiệu chuẩn hết hạn 15/10/2026.", "Đơn vị đề xuất nằm trong danh sách được chấp nhận."],
      citation: { label: "[1] Hỏi đáp: hiệu chuẩn máy đếm hạt bụi", to: "/h/library" },
    },
    preview: { org: ORG, heading: "YÊU CẦU HIỆU CHUẨN MÁY ĐẾM HẠT BỤI", subline: "Thiết bị: PC-07 · 05/10/2026 10:05" },
  },
  {
    id: "t-00116", code: "HS-SEMI-2026-00116", title: "Đề nghị cấp thẻ ra vào khu fab", level: 1,
    assignee: MOCK_ME, dueAt: "2026-10-10T09:00:00+07:00", sla: { level: "ok", label: "còn 3 ngày" },
    attachments: [pdf("de-nghi-cap-the.pdf", 1)],
    info: { submitter: "Bùi Thị Ngọc", unit: "Phòng Kinh doanh", phone: "0968 *** 530", dataTier: "Ấm" },
    ai: { bullets: ["Người đề nghị đã hoàn thành khóa an toàn fab (04/10).", "Khu vực xin cấp: Fab 1 — tầng 2."] },
    preview: { org: ORG, heading: "ĐỀ NGHỊ CẤP THẺ RA VÀO KHU FAB", subline: "Khu vực: Fab 1 · 04/10/2026 16:30" },
  },
  // ——— Việc của người khác trong nhóm (chế độ "Cả nhóm": chỉ xem) ———
  ...[
    ["00124", "Phiếu xuất xưởng lô wafer W-78", "Hoàng Minh Đức", "2026-10-08T15:00:00+07:00", "ok", "còn 1 ngày", 2],
    ["00122", "Báo cáo nhiệt độ lò khuếch tán F-2", "Đặng Văn Long", "2026-10-07T10:30:00+07:00", "overdue", "quá hạn 1 giờ", 1],
    ["00120", "Đề xuất mua hóa chất CMP đợt 4", "Đặng Văn Long", "2026-10-07T17:00:00+07:00", "urgent", "còn 8 giờ", 1],
    ["00117", "Yêu cầu hiệu chuẩn cảm biến áp suất P-3", "Đặng Văn Long", "2026-10-09T12:00:00+07:00", "ok", "còn 2 ngày", 1],
    ["00115", "Báo cáo vận hành lò khuếch tán F-1", "Hoàng Minh Đức", "2026-10-10T12:00:00+07:00", "ok", "còn 3 ngày", 2],
    ["00114", "Phiếu xuất xưởng lô wafer W-76", "Hoàng Minh Đức", "2026-10-11T09:00:00+07:00", "ok", "còn 4 ngày", 2],
    ["00112", "Báo cáo sự cố phòng sạch CR-03", "Đặng Văn Long", "2026-10-08T11:00:00+07:00", "ok", "còn 1 ngày", 1],
  ].map(([n, title, assignee, dueAt, level, label, lv]) => ({
    id: `t-${n}`,
    code: `HS-SEMI-2026-${n}`,
    title: title as string,
    level: lv as 1 | 2,
    assignee: assignee as string,
    dueAt: dueAt as string,
    sla: { level: level as InboxTask["sla"]["level"], label: label as string },
    attachments: [pdf(`ho-so-${n}.pdf`, 2)],
    info: { submitter: "Lê Thu Hà", unit: "Tổ vận hành CR", phone: "0977 *** 315", dataTier: "Ấm" },
    preview: { org: ORG, heading: (title as string).toUpperCase(), subline: "06/10/2026" },
  })),
];
