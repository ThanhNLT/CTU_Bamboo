// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { tr, trs } from "../i18n";

export const PR_STATUS_LABEL: Record<string, string> = {
  DRAFT: tr("Nháp"),
  PENDING: tr("Chờ duyệt"),
  RETURNED: tr("Bị trả về"),
  APPROVED: tr("Đã duyệt"),
  REJECTED: trs("Từ chối"),
  CANCELLED: tr("Đã hủy"),
};

export const IC_STATUS_LABEL: Record<string, string> = {
  DRAFT: tr("Nháp"),
  PENDING: tr("Chờ xác nhận"),
  CONFIRMED: tr("Đã xác nhận"),
  REJECTED: tr("Bị từ chối"),
  CANCELLED: tr("Đã hủy"),
  SETTLED: tr("Đã đối trừ"),
};
