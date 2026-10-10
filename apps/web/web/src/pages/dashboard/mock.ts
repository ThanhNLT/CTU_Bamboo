// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Trang chủ. Khi có API, thay từng hằng số bằng useList/useCustom của Refine
// với cùng kiểu dữ liệu trong ./types — các component con không cần đổi.
import type {
  DashboardUser, NotificationItem, PinnedKpi, RecentRecord, SummaryStat, TaskItem,
} from "./types";

export const MOCK_USER: DashboardUser = {
  name: "Ngọc Anh",
  title: "Trưởng bộ phận Kỹ thuật phòng sạch",
  company: "Công ty Chip & Linh kiện",
};

export const MOCK_SUMMARY: SummaryStat[] = [
  { key: "waiting", label: "Việc chờ tôi", value: 5, hint: "2 việc đến hạn hôm nay", to: "/p/tasks" },
  { key: "processing", label: "Hồ sơ của tôi đang xử lý", value: 3, hint: "1 hồ sơ chờ duyệt cấp 2", to: "/p/records" },
  { key: "sla", label: "Quá hạn SLA", value: 1, hint: "Nguy cấp · HS-SEMI-2026-00109", tone: "danger", to: "/p/tasks?code=HS-SEMI-2026-00109" },
  { key: "unread", label: "Thông báo chưa đọc", value: 4, hint: "Mới nhất 5 phút trước" },
];

export const MOCK_TASKS: TaskItem[] = [
  { code: "HS-SEMI-2026-00109", title: "Đề xuất thay bộ lọc HEPA phòng sạch CR-01", dueLabel: "Quá hạn 3 giờ", dueLevel: "overdue", dueDay: "Hôm nay" },
  { code: "HS-SEMI-2026-00125", title: "Báo cáo sự cố phòng sạch CR-02", dueLabel: "Còn 3 giờ 20 phút", dueLevel: "urgent", dueDay: "Hôm nay" },
  { code: "HS-SEMI-2026-00121", title: "Phiếu xuất xưởng lô wafer W-77", dueLabel: "Còn 1 ngày", dueLevel: "ok", dueDay: "Ngày mai" },
  { code: "HS-SEMI-2026-00118", title: "Yêu cầu hiệu chuẩn máy đếm hạt bụi", dueLabel: "Còn 2 ngày", dueLevel: "ok", dueDay: "Thứ Sáu, 09/10" },
  { code: "HS-SEMI-2026-00131", title: "Đánh giá nhà cung cấp hóa chất CMP", dueLabel: "Còn 4 ngày", dueLevel: "ok", dueDay: "Chủ Nhật, 11/10" },
];

export const MOCK_RECENT_RECORDS: RecentRecord[] = [
  { code: "HS-SEMI-2026-00125", title: "Báo cáo sự cố phòng sạch CR-02", status: "pending_l1", updatedAt: "10 phút trước", tier: "hot" },
  { code: "HS-SEMI-2026-00118", title: "Yêu cầu hiệu chuẩn máy đếm hạt bụi", status: "returned", updatedAt: "5 phút trước", tier: "hot" },
  { code: "HS-SEMI-2026-00109", title: "Thay bộ lọc HEPA phòng sạch CR-01", status: "pending_l1", updatedAt: "Hôm qua", tier: "hot" },
  { code: "HS-SEMI-2026-00106", title: "Báo cáo nhiệt độ lò khuếch tán F-3", status: "draft", updatedAt: "05/10/2026", tier: "warm" },
  { code: "HS-SEMI-2026-00097", title: "Phiếu xuất xưởng lô wafer W-71", status: "approved", updatedAt: "Hôm qua", tier: "warm" },
  { code: "HS-SEMI-2026-00052", title: "Báo cáo nhiệt độ lò khuếch tán", status: "archived", updatedAt: "12/08/2026", tier: "cold" },
];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", title: "HS-SEMI-2026-00118 đã được bổ sung tệp", time: "5 phút trước", tone: "success", read: false },
  { id: "n2", title: "Tệp “bao-cao-ca-dem.pdf” bị chặn: chứa mã độc", time: "1 giờ trước", source: "Kiểm dịch tại biên", tone: "danger", read: false },
  { id: "n3", title: "Phòng sạch CR-02 gần ngưỡng ISO 5", time: "2 giờ trước", source: "Bản sao số", tone: "warning", read: false },
  { id: "n4", title: "Lịch hiệu chuẩn tháng 11 đã được phê duyệt", time: "Hôm qua", source: "Quy trình số", tone: "success", read: false },
];

export const MOCK_KPIS: PinnedKpi[] = [
  {
    key: "on-time",
    label: "Duyệt đúng hạn · đơn vị",
    value: "92,4%",
    note: "1,1 điểm so với tháng trước",
    noteTone: "danger",
    noteMarker: "down",
    series: [93.9, 93.6, 94.0, 93.7, 93.9, 93.3, 93.5, 93.0, 93.2, 92.7, 92.9, 92.4],
  },
  {
    key: "particles",
    label: "Hạt bụi ≥0,5 µm · CR-02",
    value: "3.120/m³",
    note: "Ngưỡng ISO 5: 3.520",
    noteTone: "warning",
    noteMarker: "dot",
    series: [2840, 2880, 2870, 2930, 2910, 2970, 2990, 2980, 3040, 3060, 3090, 3120],
    threshold: 3520,
  },
];
