// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import type { Tone } from "../../components/ui";
import type { DocSummary } from "../../api/documents";
import { formatDate } from "../../utils/format";
import { fold } from "../../utils/text";
import type {
  EofficeRecord,
  RecordFilters,
  RecordStatus,
  StatusTab,
  StepState,
  TimeRange,
  WorkflowStep,
} from "./types";

// ===== Hằng số =====
export const STATUS_VIEW: Record<RecordStatus, { tone: Tone; locked?: boolean }> = {
  draft: { tone: "neutral" },
  pending: { tone: "warning" },
  returned: { tone: "danger" },
  approved: { tone: "success" },
  closed: { tone: "neutral", locked: true },
};

export const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "draft", label: "Nháp" },
  { key: "reviewing", label: "Đang duyệt" },
  { key: "returned", label: "Trả lại" },
  { key: "approved", label: "Đã duyệt" },
  { key: "closed", label: "Đã đóng" },
];

export const TIME_OPTIONS: Array<{ label: string; value: TimeRange }> = [
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "90 ngày", value: "90d" },
  { label: "Mọi thời gian", value: "all" },
];

const RANGE_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90, all: Infinity };

const STATUS_OF: Record<string, RecordStatus> = {
  DRAFT: "draft",
  PENDING: "pending",
  RETURNED: "returned",
  APPROVED: "approved",
  CONFIRMED: "approved",
  SETTLED: "approved",
  REJECTED: "closed",
  CANCELLED: "closed",
  RETIRED: "closed",
};

// ===== Hàm tiện ích =====
/** Chứng từ thật → dòng của trang Hồ sơ. Đang chờ duyệt thì ghi rõ cấp đang xử lý. */
export const toRecord = (d: DocSummary): EofficeRecord => {
  const status = STATUS_OF[d.status] ?? "draft";
  const active = d.steps.find((s) => s.status === "ACTIVE");
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    type: d.kind,
    status,
    statusLabel: status === "pending" && active ? `Chờ duyệt cấp ${active.order}` : d.statusLabel,
    submitter: d.requester,
    submitterId: d.requesterId,
    unit: d.unit,
    amount: d.amount,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    steps: d.steps,
    to: d.to,
  };
};

export const matchesTab = (status: RecordStatus, tab: StatusTab) =>
  tab === "all" || (tab === "reviewing" ? status === "pending" : status === tab);

/** Lọc mọi điều kiện TRỪ tab trạng thái — để đếm số trên từng tab. "Của tôi" = tôi lập hoặc đang chờ tôi duyệt. */
export const filterExceptTab = (
  records: EofficeRecord[],
  { query, type, range, mineOnly }: Omit<RecordFilters, "tab">,
  ctx: { me: string; now: number; myTasks: Set<string> },
) => {
  const q = fold(query.trim());
  const since = ctx.now - RANGE_DAYS[range] * 86_400_000;
  return records.filter(
    (r) =>
      (type === "all" || r.type === type) &&
      (range === "all" || Date.parse(r.updatedAt) >= since) &&
      (!mineOnly || r.submitterId === ctx.me || ctx.myTasks.has(r.code)) &&
      (!q || fold(`${r.code} ${r.title} ${r.submitter}`).includes(q)),
  );
};

export const countByTab = (records: EofficeRecord[]) =>
  Object.fromEntries(
    STATUS_TABS.map(({ key }) => [key, records.filter((r) => matchesTab(r.status, key)).length]),
  ) as Record<StatusTab, number>;

// ===== Hằng số =====
const STEP_STATE: Record<string, StepState> = {
  APPROVED: "done",
  ACTIVE: "current",
  RETURNED: "returned",
  REJECTED: "returned",
  WAITING: "pending",
  CANCELLED: "pending",
};
const STEP_SUFFIX: Record<string, string> = {
  ACTIVE: " · đang xử lý",
  RETURNED: " · trả lại bổ sung",
  REJECTED: " · từ chối",
  CANCELLED: " · đã hủy",
};

// ===== Hàm tiện ích =====
/** Nộp → các bước duyệt của lần gửi hiện tại (đơn nội bộ: bên bán xác nhận) → Kết quả. */
export const buildWorkflow = (r: EofficeRecord): WorkflowStep[] => {
  const submitted = r.status !== "draft";
  const submit: WorkflowStep = {
    key: "submit",
    label: submitted ? "Nộp" : "Nộp · đang soạn",
    state: submitted ? "done" : "current",
    meta: submitted ? `${formatDate(r.createdAt)} · ${r.submitter}` : r.submitter,
  };
  const middle: WorkflowStep[] =
    r.type === "ic_order"
      ? [
          {
            key: "confirm",
            label: r.status === "pending" ? "Bên bán xác nhận · đang chờ" : "Bên bán xác nhận",
            state:
              r.status === "approved"
                ? "done"
                : r.status === "pending"
                  ? "current"
                  : r.status === "closed"
                    ? "returned"
                    : "pending",
          },
        ]
      : r.steps.map((s) => ({
          key: `l${s.order}`,
          label: `Duyệt cấp ${s.order}${STEP_SUFFIX[s.status] ?? ""}`,
          state: STEP_STATE[s.status] ?? "pending",
          meta: [s.actedBy ?? s.position, s.actedAt && formatDate(s.actedAt)].filter(Boolean).join(" · "),
        }));
  return [
    submit,
    ...middle,
    {
      key: "result",
      label: r.status === "closed" ? "Kết quả · đã đóng" : "Kết quả",
      state: r.status === "approved" ? "done" : "pending",
    },
  ];
};

/** Danh sách nút trang gọn: 1 2 3 … 7 (null = dấu …). */
export const pageList = (current: number, total: number): Array<number | null> => {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total));
  if (current <= 3) [2, 3].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2].forEach((p) => pages.add(p));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
};
