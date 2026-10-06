// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export const PR_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp", PENDING: "Chờ duyệt", RETURNED: "Bị trả về", APPROVED: "Đã duyệt", REJECTED: "Từ chối", CANCELLED: "Đã hủy",
};

// Đơn hàng nội bộ (ADR #42): chờ bên bán xác nhận.
export const IC_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp", PENDING: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", REJECTED: "Bị từ chối", CANCELLED: "Đã hủy",
  SETTLED: "Đã đối trừ",
};
