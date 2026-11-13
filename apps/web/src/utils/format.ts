/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { tr, trs } from "../i18n";

dayjs.extend(relativeTime);

const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatMoney = (value?: number | string | null) =>
  value == null ? "—" : `${money.format(Number(value))} ₫`;
export const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD-MMM-YYYY HH:mm") : "—");
export const formatAgo = (iso: string, now = dayjs()) => {
  const t = dayjs(iso);
  if (now.diff(t, "hour") < 24) return t.from(now);
  if (now.startOf("day").diff(t.startOf("day"), "day") === 1) return tr("Hôm qua");
  return t.format("DD-MMM-YYYY");
};
export const parsePgTimestamp = (value: string) =>
  dayjs(
    value
      .trim()
      .replace(" ", "T")
      .replace(/([+-]\d{2})$/, "$1:00"),
  );
export const formatDay = (value?: string | null) => (value ? dayjs(value).format("DD-MMM-YYYY") : "—");

export const STEP_STATUS: Record<string, string> = {
  WAITING: trs("Chờ tới lượt"),
  ACTIVE: trs("Đang chờ duyệt"),
  APPROVED: trs("Đã duyệt"),
  REJECTED: trs("Từ chối"),
  RETURNED: trs("Trả về"),
  CANCELLED: trs("Đã hủy"),
};

export const HISTORY_EVENT: Record<string, string> = {
  SUBMITTED: trs("Gửi duyệt"),
  ASSIGNED: trs("Giao việc duyệt"),
  ESCALATED: trs("Đẩy lên cấp trên"),
  MERGED: trs("Gộp bước"),
  TRANSFERRED: trs("Chuyển việc"),
  APPROVED: trs("Duyệt"),
  REJECTED: trs("Từ chối"),
  RETURNED: trs("Trả về"),
  CANCELLED: trs("Hủy"),
  OWNER_TRANSFERRED: trs("Chuyển người lập"),
  COMPLETED: trs("Hoàn tất duyệt"),
};

export const ESCALATION_REASON: Record<string, string> = {
  VACANT: tr("vị trí trống"),
  CONTRACT: tr("người giữ là hợp đồng"),
  REQUESTER: tr("trùng người lập"),
  CONFLICT: tr("đứng ở phía bên kia giao dịch nội bộ"),
};
