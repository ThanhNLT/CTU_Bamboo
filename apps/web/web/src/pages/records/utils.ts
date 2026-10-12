// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Tone } from "../../components/ui";
import { fold } from "../../utils/text";
import type {
  EofficeRecord, RecordFilters, RecordStatus, StatusTab, TimeRange, WorkflowStep,
} from "./types";

export const STATUS_VIEW: Record<RecordStatus, { label: string; tone: Tone; locked?: boolean }> = {
  draft: { label: "Nháp", tone: "neutral" },
  pending_l1: { label: "Chờ duyệt cấp 1", tone: "warning" },
  pending_l2: { label: "Chờ duyệt cấp 2", tone: "warning" },
  returned: { label: "Trả lại bổ sung", tone: "danger" },
  approved: { label: "Đã duyệt", tone: "success" },
  archived: { label: "Lưu trữ", tone: "neutral", locked: true },
};

export const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "draft", label: "Nháp" },
  { key: "reviewing", label: "Đang duyệt" },
  { key: "returned", label: "Trả lại" },
  { key: "approved", label: "Đã duyệt" },
  { key: "archived", label: "Lưu trữ" },
];

export const TIME_OPTIONS: Array<{ label: string; value: TimeRange }> = [
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "90 ngày", value: "90d" },
  { label: "Mọi thời gian", value: "all" },
];

const RANGE_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90, all: Infinity };

export const matchesTab = (status: RecordStatus, tab: StatusTab) =>
  tab === "all" ||
  (tab === "reviewing" ? status === "pending_l1" || status === "pending_l2" : status === tab);

/** Người phải xử lý bước hiện tại (nếu có). */
export const currentAssignee = (r: EofficeRecord) =>
  r.status === "pending_l1" ? r.approverL1 : r.status === "pending_l2" ? r.approverL2
    : r.status === "returned" || r.status === "draft" ? r.submitter : undefined;

/** Lọc mọi điều kiện TRỪ tab trạng thái — để đếm số trên từng tab. */
export const filterExceptTab = (
  records: EofficeRecord[],
  { query, type, range, mineOnly }: Omit<RecordFilters, "tab">,
  ctx: { me: string; now: string },
) => {
  const q = fold(query.trim());
  const since = Date.parse(ctx.now) - RANGE_DAYS[range] * 86_400_000;
  return records.filter(
    (r) =>
      (type === "all" || r.type === type) &&
      (range === "all" || Date.parse(r.activityAt ?? r.updatedAt) >= since) &&
      (!mineOnly || r.submitter === ctx.me || currentAssignee(r) === ctx.me) &&
      (!q || fold(`${r.code} ${r.title} ${r.submitter}`).includes(q)),
  );
};

export const countByTab = (records: EofficeRecord[]) =>
  Object.fromEntries(
    STATUS_TABS.map(({ key }) => [key, records.filter((r) => matchesTab(r.status, key)).length]),
  ) as Record<StatusTab, number>;

/** Dựng các bước quy trình từ trạng thái hồ sơ: Nộp → Duyệt cấp 1 → Duyệt cấp 2 → Phiếu kết quả. */
export const buildWorkflow = (r: EofficeRecord): WorkflowStep[] => {
  const submitted = r.status !== "draft";
  const l1Done = r.status === "pending_l2" || r.status === "approved" || r.status === "archived";
  const l2Done = r.status === "approved" || r.status === "archived";
  return [
    {
      key: "submit",
      label: submitted ? "Nộp" : "Nộp · đang soạn",
      state: submitted ? "done" : "current",
      meta: submitted ? `${r.submittedLabel ?? ""} · ${r.submitter}` : r.submitter,
    },
    {
      key: "l1",
      label:
        r.status === "pending_l1" ? "Duyệt cấp 1 · đang xử lý"
          : r.status === "returned" ? "Duyệt cấp 1 · trả lại bổ sung" : "Duyệt cấp 1",
      state: l1Done ? "done" : r.status === "pending_l1" ? "current" : r.status === "returned" ? "returned" : "pending",
      meta: r.status === "pending_l1" || r.status === "returned" || l1Done ? r.approverL1 : undefined,
    },
    {
      key: "l2",
      label: r.status === "pending_l2" ? "Duyệt cấp 2 · đang xử lý" : "Duyệt cấp 2",
      state: l2Done ? "done" : r.status === "pending_l2" ? "current" : "pending",
      meta: r.status === "pending_l2" || l2Done ? r.approverL2 : undefined,
    },
    { key: "result", label: "Phiếu kết quả", state: l2Done ? "done" : "pending" },
  ];
};

/** "3f9a7d0e5b14c21e" → "3f9a…c21e" */
export const shortHash = (h: string) => (h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h);

/** Danh sách nút trang gọn: 1 2 3 … 7 (null = dấu …). */
export const pageList = (current: number, total: number): Array<number | null> => {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total));
  if (current <= 3) [2, 3].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2].forEach((p) => pages.add(p));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
};
