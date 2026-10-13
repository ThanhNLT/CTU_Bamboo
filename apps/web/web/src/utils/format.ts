// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import dayjs from "dayjs"; // Day.js
import relativeTime from "dayjs/plugin/relativeTime"; // Day.js

// ===== Khởi tạo =====
dayjs.extend(relativeTime);

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

// ===== Hàm tiện ích =====
export const formatMoney = (value?: number | string | null) => (value == null ? "—" : money.format(Number(value)));
export const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—");
/** "5 phút trước" trong 1 ngày, sau đó "Hôm qua", rồi ngày tháng. */
export const formatAgo = (iso: string, now = dayjs()) => {
  const t = dayjs(iso);
  if (now.diff(t, "hour") < 24) return t.from(now);
  if (now.startOf("day").diff(t.startOf("day"), "day") === 1) return "Hôm qua";
  return t.format("DD/MM/YYYY");
};
/**
 * Mốc thời gian dạng văn bản của PostgreSQL ("2026-10-01 05:00:00+00", cận của tstzrange) → dayjs.
 * Safari/Firefox không đọc được dấu cách thay cho "T" và múi giờ rút gọn "+00", nên chuẩn hóa về ISO-8601.
 */
export const parsePgTimestamp = (value: string) =>
  dayjs(
    value
      .trim()
      .replace(" ", "T")
      .replace(/([+-]\d{2})$/, "$1:00"),
  );
export const formatDay = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");

// ===== Hằng số =====
export const STEP_STATUS: Record<string, string> = {
  WAITING: "Chờ tới lượt",
  ACTIVE: "Đang chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  RETURNED: "Trả về",
  CANCELLED: "Đã hủy",
};

export const HISTORY_EVENT: Record<string, string> = {
  SUBMITTED: "Gửi duyệt",
  ASSIGNED: "Giao việc duyệt",
  ESCALATED: "Đẩy lên cấp trên",
  MERGED: "Gộp bước",
  TRANSFERRED: "Chuyển việc",
  APPROVED: "Duyệt",
  REJECTED: "Từ chối",
  RETURNED: "Trả về",
  CANCELLED: "Hủy",
  OWNER_TRANSFERRED: "Chuyển người lập",
  COMPLETED: "Hoàn tất duyệt",
};

export const ESCALATION_REASON: Record<string, string> = {
  VACANT: "vị trí trống",
  CONTRACT: "người giữ là hợp đồng",
  REQUESTER: "trùng người lập",
  CONFLICT: "đứng ở phía bên kia giao dịch nội bộ",
};
