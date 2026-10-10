// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho trang Hồ sơ: 7 hồ sơ đầu đúng như bản thiết kế, phần còn lại sinh tự động (cố định,
// không ngẫu nhiên) để đủ 128 hồ sơ theo đúng tỷ lệ các tab. Khi có API, thay bằng useTable/useList của
// Refine (lọc + phân trang phía máy chủ) trả về cùng kiểu ./types.
import type { EofficeRecord, RecordStatus, RecordType, Sla } from "./types";

/** Người đang đăng nhập (minh họa) — dùng cho "Chỉ của tôi" và quyền "Mở để duyệt". */
export const MOCK_ME = "Nguyễn Ngọc Anh";

/** Mốc "bây giờ" của dữ liệu minh họa. */
export const MOCK_NOW = "2026-10-07T09:00:00+07:00";

export const COMPANY = "Công ty Chip & Linh kiện";

export const TYPE_LABEL: Record<RecordType, string> = {
  incident: "Báo cáo sự cố",
  release: "Phiếu xuất xưởng",
  calibration: "Yêu cầu hiệu chuẩn",
  purchase: "Đề xuất mua sắm",
  operation: "Báo cáo vận hành",
};

const APPROVER_L1 = MOCK_ME;
const APPROVER_L2 = "Hoàng Minh Đức";

const DESIGN_ROWS: EofficeRecord[] = [
  {
    id: "r-00125", code: "HS-SEMI-2026-00125", title: "Báo cáo sự cố phòng sạch CR-02", type: "incident",
    status: "pending_l1", submitter: "Trần Minh Quân", submittedLabel: "06/10 07:12",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "remaining", label: "Còn 3 giờ 20 phút" },
    updatedAt: "2026-10-07T08:50:00+07:00", updatedLabel: "10 phút trước",
    versions: [
      { version: 3, note: "bổ sung tệp", at: "10 phút" },
      { version: 2, note: "sửa mô tả", at: "1 giờ" },
      { version: 1, note: "nộp lần đầu", at: "06/10" },
    ],
    ledgerHash: "3f9a7d0e5b14c21e",
  },
  {
    id: "r-00124", code: "HS-SEMI-2026-00124", title: "Phiếu xuất xưởng lô wafer W-78", type: "release",
    status: "pending_l2", submitter: "Lê Thu Hà", submittedLabel: "06/10 15:40",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "remaining", label: "Còn 1 ngày" },
    updatedAt: "2026-10-07T08:30:00+07:00", updatedLabel: "30 phút trước",
    versions: [{ version: 1, note: "nộp lần đầu", at: "06/10" }],
    ledgerHash: "a81c44f09be27d53",
  },
  {
    id: "r-00118", code: "HS-SEMI-2026-00118", title: "Yêu cầu hiệu chuẩn máy đếm hạt bụi", type: "calibration",
    status: "returned", submitter: "Phạm Đức Long", submittedLabel: "05/10 10:05",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "remaining", label: "Còn 2 ngày" },
    updatedAt: "2026-10-07T08:55:00+07:00", updatedLabel: "5 phút trước",
    versions: [
      { version: 2, note: "bổ sung chứng chỉ", at: "5 phút" },
      { version: 1, note: "nộp lần đầu", at: "05/10" },
    ],
    ledgerHash: "5c02e9ab71d4f386",
  },
  {
    id: "r-00109", code: "HS-SEMI-2026-00109", title: "Đề xuất thay bộ lọc HEPA phòng sạch CR-01", type: "purchase",
    status: "pending_l1", submitter: "Nguyễn Văn Tùng", submittedLabel: "05/10 08:20",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "overdue", label: "Quá hạn 3 giờ" },
    updatedAt: "2026-10-06T16:10:00+07:00", updatedLabel: "Hôm qua",
    versions: [{ version: 1, note: "nộp lần đầu", at: "05/10" }],
    ledgerHash: "e47b10c3d92a8f61",
  },
  {
    id: "r-00106", code: "HS-SEMI-2026-00106", title: "Báo cáo nhiệt độ lò khuếch tán F-3", type: "operation",
    status: "draft", submitter: "Trần Minh Quân",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "none" },
    updatedAt: "2026-10-05T17:30:00+07:00", updatedLabel: "05/10/2026",
    versions: [{ version: 1, note: "bản nháp", at: "05/10" }],
  },
  {
    id: "r-00097", code: "HS-SEMI-2026-00097", title: "Phiếu xuất xưởng lô wafer W-71", type: "release",
    status: "approved", submitter: "Lê Thu Hà", submittedLabel: "03/10 09:15",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "ontime" },
    updatedAt: "2026-10-06T11:00:00+07:00", updatedLabel: "Hôm qua",
    versions: [{ version: 1, note: "nộp lần đầu", at: "03/10" }],
    ledgerHash: "0d6f3b8e2a19c754",
  },
  {
    id: "r-00052", code: "HS-SEMI-2026-00052", title: "Báo cáo nhiệt độ lò khuếch tán", type: "operation",
    status: "archived", submitter: "Trần Minh Quân", submittedLabel: "02/08 14:00",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "ontime" },
    updatedAt: "2026-08-12T10:00:00+07:00", updatedLabel: "12/08/2026",
    activityAt: "2026-10-01T09:00:00+07:00", // đưa vào lưu trữ 01/10
    versions: [{ version: 1, note: "nộp lần đầu", at: "02/08" }],
    ledgerHash: "9b2e61f0c8a47d35",
  },
];

// ——— Sinh phần còn lại (xác định, không ngẫu nhiên) ———

const TITLES: Array<[RecordType, string]> = [
  ["incident", "Báo cáo sự cố phòng sạch CR-0"],
  ["release", "Phiếu xuất xưởng lô wafer W-"],
  ["calibration", "Yêu cầu hiệu chuẩn cảm biến áp suất P-"],
  ["purchase", "Đề xuất mua hóa chất CMP đợt "],
  ["operation", "Báo cáo vận hành lò khuếch tán F-"],
];
const PEOPLE = ["Trần Minh Quân", "Lê Thu Hà", "Phạm Đức Long", "Nguyễn Văn Tùng", "Đặng Văn Long", "Bùi Thị Ngọc"];

/** Số lượng cần sinh thêm cho từng trạng thái để tổng = 128 (Nháp 6, Đang duyệt 23, Trả lại 4, Đã duyệt 89, Lưu trữ 6). */
const EXTRA: Array<[RecordStatus, number]> = [
  ["pending_l1", 12], ["pending_l2", 8], ["returned", 3], ["draft", 5], ["approved", 88], ["archived", 5],
];

const pad = (n: number) => String(n).padStart(2, "0");
const hex = (seed: number) => ((seed * 2654435761) >>> 0).toString(16).padStart(8, "0");

const generate = (): EofficeRecord[] => {
  const out: EofficeRecord[] = [];
  let n = 0;
  let code = 40; // số hồ sơ sinh thêm đi lên từ 00040, bỏ qua số đã dùng ở trên
  const used = new Set(DESIGN_ROWS.map((r) => Number(r.code.slice(-5))));
  for (const [status, count] of EXTRA) {
    for (let i = 0; i < count; i += 1, n += 1) {
      while (used.has(code)) code += 1;
      used.add(code);
      const [type, base] = TITLES[n % TITLES.length];
      const active = status === "pending_l1" || status === "pending_l2" || status === "returned" || status === "draft";
      // Hồ sơ đang xử lý: 1–6 ngày trước; đã duyệt: rải 3–29 ngày; lưu trữ: cập nhật 35–95 ngày trước
      // nhưng mới được đưa vào lưu trữ (activityAt) trong 30 ngày qua.
      const daysAgo = active ? 1 + (i % 6) : status === "approved" ? 3 + ((i * 7) % 27) : 35 + i * 12;
      const d = new Date(Date.parse(MOCK_NOW) - daysAgo * 86_400_000 - (i % 9) * 3_600_000);
      const dd = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      const sla: Sla =
        status === "draft" ? { kind: "none" }
          : status === "approved" || status === "archived" ? { kind: "ontime" }
            : i % 5 === 4 ? { kind: "overdue", label: `Quá hạn ${1 + (i % 3)} giờ` }
              : { kind: "remaining", label: `Còn ${1 + (i % 3)} ngày` };
      out.push({
        id: `r-g${code}`,
        code: `HS-SEMI-2026-${String(code).padStart(5, "0")}`,
        title: `${base}${(n % 7) + 1}`,
        type,
        status,
        submitter: PEOPLE[n % PEOPLE.length],
        submittedLabel: status === "draft" ? undefined : `${dd} ${pad(8 + (i % 9))}:${pad((i * 13) % 60)}`,
        approverL1: APPROVER_L1,
        approverL2: APPROVER_L2,
        sla,
        updatedAt: d.toISOString(),
        updatedLabel: daysAgo === 1 ? "Hôm qua" : `${dd}/${d.getFullYear()}`,
        activityAt: status === "archived" ? new Date(Date.parse(MOCK_NOW) - (2 + i * 4) * 86_400_000).toISOString() : undefined,
        versions: [{ version: 1, note: status === "draft" ? "bản nháp" : "nộp lần đầu", at: dd }],
        ledgerHash: status === "draft" ? undefined : `${hex(code)}${hex(code + 7)}`,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const MOCK_RECORDS: EofficeRecord[] = [...DESIGN_ROWS, ...generate()];

/** Hai cập nhật "đến sau" (giả lập luồng trực tiếp) — áp vào khi bấm "Làm mới". */
export const MOCK_INCOMING: EofficeRecord[] = [
  {
    id: "r-00201", code: "HS-SEMI-2026-00201", title: "Đánh giá nhà cung cấp hóa chất CMP", type: "purchase",
    status: "pending_l1", submitter: "Bùi Thị Ngọc", submittedLabel: "07/10 08:58",
    approverL1: APPROVER_L1, approverL2: APPROVER_L2,
    sla: { kind: "remaining", label: "Còn 2 ngày" },
    updatedAt: "2026-10-07T08:58:00+07:00", updatedLabel: "Vừa xong",
    versions: [{ version: 1, note: "nộp lần đầu", at: "vừa xong" }],
    ledgerHash: "c7d1904be3a6f218",
  },
  {
    ...DESIGN_ROWS[2],
    status: "pending_l1",
    updatedAt: "2026-10-07T08:59:00+07:00",
    updatedLabel: "Vừa xong",
    versions: [{ version: 3, note: "nộp lại sau bổ sung", at: "vừa xong" }, ...DESIGN_ROWS[2].versions],
  },
];
