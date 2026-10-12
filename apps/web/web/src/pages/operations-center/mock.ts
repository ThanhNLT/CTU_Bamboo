// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Trung tâm điều hành. Khi có API: KPI và biểu đồ ngày lấy từ dịch vụ dữ liệu (nóng),
// biểu đồ tháng nhúng từ Metabase (ấm). Các số khớp nhau: 37 hồ sơ chờ = 13 + 13 + 7 + 4 theo công ty.
import type { Company, CompanyKey, Kpi, OverdueRow, Site } from "./types";

/**
 * Màu nhận diện công ty — 4 ô đầu của bảng màu phân loại đã kiểm định (thứ tự cố định, không đổi theo hạng).
 * Xanh ngọc và vàng có tương phản < 3:1 trên nền trắng → luôn kèm nhãn trực tiếp hoặc dạng bảng.
 */
export const COMPANIES: Company[] = [
  { key: "phone", name: "Điện thoại", short: "Điện thoại", color: "#2a78d6" },
  { key: "chip", name: "Chip & Linh kiện", short: "Chip", color: "#eb6834" },
  { key: "appliance", name: "Gia dụng", short: "Gia dụng", color: "#1baf7a" },
  { key: "hospital", name: "Bệnh viện", short: "Bệnh viện", color: "#eda100" },
];

export const COMPANY: Record<CompanyKey, Company> = Object.fromEntries(COMPANIES.map((c) => [c.key, c])) as Record<
  CompanyKey,
  Company
>;

export const KPIS: Kpi[] = [
  {
    key: "pending", label: "Hồ sơ chờ duyệt", value: "37",
    delta: { dir: "up", tone: "good", text: "12% so với hôm qua" },
    freshness: { tier: "Nóng", at: "10:42" },
    definition: "Số hồ sơ đang ở một bước duyệt bất kỳ, toàn tập đoàn, tại thời điểm cập nhật.",
  },
  {
    key: "ontime", label: "Duyệt đúng hạn", value: "92,4%",
    delta: { dir: "down", tone: "bad", text: "1,1 điểm" },
    freshness: { tier: "Nóng", at: "10:42" },
    definition: "Tỷ lệ bước duyệt hoàn tất trước hạn SLA trong kỳ đang chọn.",
  },
  {
    key: "oee", label: "OEE dây chuyền", value: "81,0%",
    delta: { dir: "down", tone: "bad", text: "3,2 điểm" },
    freshness: { tier: "Ấm", at: "10:30" },
    definition: "Hiệu suất thiết bị tổng thể = Sẵn sàng × Hiệu năng × Chất lượng, bình quân các dây chuyền.",
  },
  {
    key: "alerts", label: "Thiết bị cảnh báo", value: "4",
    delta: { dir: "dot", tone: "bad", text: "1 nguy cấp" },
    freshness: { tier: "Nóng", at: "10:42" },
    definition: "Thiết bị có cảnh báo đang mở từ Bản sao số (ngưỡng cảm biến, bảo trì quá hạn).",
  },
  {
    key: "blocked", label: "Tệp bị chặn · 7 ngày", value: "2",
    delta: { dir: "none", tone: "neutral", text: "Kiểm dịch ClamAV" },
    freshness: { tier: "Nóng", at: "10:42" },
    definition: "Tệp tải lên bị kiểm dịch tại biên chặn vì chứa mã độc trong 7 ngày gần nhất.",
  },
];

const DAYS = ["23/09", "24/09", "25/09", "26/09", "27/09", "28/09", "29/09", "30/09", "01/10", "02/10", "03/10", "04/10", "05/10", "06/10"];
const SERIES: Record<CompanyKey, number[]> = {
  phone: [16, 17, 15, 18, 17, 19, 18, 20, 19, 18, 20, 19, 21, 19],
  chip: [10, 11, 10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17],
  appliance: [8, 9, 9, 10, 9, 10, 11, 10, 11, 10, 11, 12, 11, 11],
  hospital: [5, 6, 6, 5, 7, 6, 7, 6, 8, 7, 7, 8, 7, 8],
};

/** Hồ sơ được duyệt mỗi ngày, theo công ty (mỗi phần tử một ngày). */
export const DAILY_APPROVALS = DAYS.map((day, i) => ({
  day,
  phone: SERIES.phone[i],
  chip: SERIES.chip[i],
  appliance: SERIES.appliance[i],
  hospital: SERIES.hospital[i],
}));

/** Hồ sơ đang chờ theo công ty, tách theo cấp duyệt. */
export const PENDING_BY_COMPANY: Array<{ company: CompanyKey; l1: number; l2: number }> = [
  { company: "phone", l1: 9, l2: 4 },
  { company: "chip", l1: 10, l2: 3 },
  { company: "appliance", l1: 5, l2: 2 },
  { company: "hospital", l1: 3, l2: 1 },
];

/** Hồ sơ duyệt theo tháng (nhúng Metabase): năm nay dạng cột, năm trước dạng đường đứt nét. */
export const MONTHLY_APPROVALS = [
  [305, 290], [298, 295], [325, 305], [332, 312], [340, 318], [330, 322],
  [355, 330], [348, 336], [362, 342], [371, 350], [null, 356],
].map(([y2026, y2025], i) => ({ month: `T${i + 1}`, y2026, y2025 }));

export const SITES: Site[] = [
  { id: "s1", company: "phone", name: "Nhà máy Thái Nguyên", province: "Thái Nguyên", x: 24, y: 24, status: "ok" },
  { id: "s2", company: "phone", name: "Trung tâm R&D", province: "Hà Nội", x: 31, y: 40, status: "warning", alert: "Phòng thử nghiệm: độ ẩm cao" },
  { id: "s3", company: "chip", name: "CR-02", province: "Bắc Ninh", x: 44, y: 55, status: "critical", alert: "Hạt bụi vượt ngưỡng ISO 5" },
  { id: "s4", company: "chip", name: "Fab 1", province: "Bắc Ninh", x: 52, y: 47, status: "warning", alert: "Bảo trì bơm chân không quá hạn" },
  { id: "s5", company: "appliance", name: "Nhà máy Hải Dương", province: "Hải Dương", x: 66, y: 30, status: "ok" },
  { id: "s6", company: "hospital", name: "Bệnh viện Hà Đông", province: "Hà Nội", x: 74, y: 66, status: "warning", alert: "Máy MRI: nhiệt độ heli tăng" },
];

export const OVERDUE: OverdueRow[] = [
  { code: "HS-HOS-2026-00072", company: "hospital", type: "Đề xuất mua máy thở ICU", step: "Cấp 2", overdueMinutes: 1440, overdueLabel: "1 ngày" },
  { code: "HS-MOB-2026-00311", company: "phone", type: "Yêu cầu thay đổi thiết kế ECR-88", step: "Cấp 2", overdueMinutes: 300, overdueLabel: "5 giờ" },
  { code: "HS-SEMI-2026-00109", company: "chip", type: "Đề xuất thay bộ lọc HEPA", step: "Cấp 1", overdueMinutes: 180, overdueLabel: "3 giờ" },
  { code: "HS-APP-2026-00140", company: "appliance", type: "Đề xuất chương trình khuyến mại", step: "Cấp 1", overdueMinutes: 120, overdueLabel: "2 giờ" },
  { code: "HS-MOB-2026-00305", company: "phone", type: "Báo cáo lỗi dây chuyền SMT-02", step: "Cấp 1", overdueMinutes: 60, overdueLabel: "1 giờ" },
];

/** Định nghĩa và nguồn cho từng khối (nút "Định nghĩa và nguồn"). */
export const DEFINITIONS = {
  daily: "Số bước duyệt cuối cùng hoàn tất mỗi ngày, theo công ty nộp hồ sơ. Nguồn: wf.v_task_history (nóng, 5 phút).",
  pending: "Hồ sơ đang chờ tại thời điểm cập nhật, tách theo cấp duyệt. Nguồn: wf.v_inbox (nóng).",
  monthly: "Hồ sơ duyệt xong theo tháng, so với cùng kỳ năm trước. Nguồn: kho dữ liệu analytics.approvals_monthly (ấm, hằng đêm).",
  overdue: "5 hồ sơ quá hạn SLA lâu nhất tại bước hiện tại. Nguồn: wf.v_inbox + lịch làm việc từng công ty.",
};
