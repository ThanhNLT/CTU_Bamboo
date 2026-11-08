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
import { tr, trf } from "../../i18n";

export const STATUS_VIEW: Record<RecordStatus, { tone: Tone; locked?: boolean }> = {
  draft: { tone: "neutral" },
  pending: { tone: "warning" },
  returned: { tone: "danger" },
  approved: { tone: "success" },
  closed: { tone: "neutral", locked: true },
};

export const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "all", label: tr("Tất cả") },
  { key: "draft", label: tr("Nháp") },
  { key: "reviewing", label: tr("Đang duyệt") },
  { key: "returned", label: tr("Trả lại") },
  { key: "approved", label: tr("Đã duyệt") },
  { key: "closed", label: tr("Đã đóng") },
];

export const TIME_OPTIONS: Array<{ label: string; value: TimeRange }> = [
  { label: tr("7 ngày"), value: "7d" },
  { label: tr("30 ngày"), value: "30d" },
  { label: tr("90 ngày"), value: "90d" },
  { label: tr("Mọi thời gian"), value: "all" },
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

export const toRecord = (d: DocSummary): EofficeRecord => {
  const status = STATUS_OF[d.status] ?? "draft";
  const active = d.steps.find((s) => s.status === "ACTIVE");
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    type: d.kind,
    status,
    statusLabel: status === "pending" && active ? trf("Chờ duyệt cấp {0}", [active.order]) : d.statusLabel,
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

const STEP_STATE: Record<string, StepState> = {
  APPROVED: "done",
  ACTIVE: "current",
  RETURNED: "returned",
  REJECTED: "returned",
  WAITING: "pending",
  CANCELLED: "pending",
};
const STEP_SUFFIX: Record<string, string> = {
  ACTIVE: tr(" · đang xử lý"),
  RETURNED: tr(" · trả lại bổ sung"),
  REJECTED: tr(" · từ chối"),
  CANCELLED: tr(" · đã hủy"),
};

export const buildWorkflow = (r: EofficeRecord): WorkflowStep[] => {
  const submitted = r.status !== "draft";
  const submit: WorkflowStep = {
    key: "submit",
    label: submitted ? tr("Nộp") : tr("Nộp · đang soạn"),
    state: submitted ? "done" : "current",
    meta: submitted ? `${formatDate(r.createdAt)} · ${r.submitter}` : r.submitter,
  };
  const middle: WorkflowStep[] =
    r.type === "ic_order"
      ? [
          {
            key: "confirm",
            label: r.status === "pending" ? tr("Bên bán xác nhận · đang chờ") : tr("Bên bán xác nhận"),
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
          label: trf("Duyệt cấp {0}{1}", [s.order, STEP_SUFFIX[s.status] ?? ""]),
          state: STEP_STATE[s.status] ?? "pending",
          meta: [s.actedBy ?? s.position, s.actedAt && formatDate(s.actedAt)].filter(Boolean).join(" · "),
        }));
  return [
    submit,
    ...middle,
    {
      key: "result",
      label: r.status === "closed" ? tr("Kết quả · đã đóng") : tr("Kết quả"),
      state: r.status === "approved" ? "done" : "pending",
    },
  ];
};

export const pageList = (current: number, total: number): Array<number | null> => {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total));
  if (current <= 3) [2, 3].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2].forEach((p) => pages.add(p));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
};
