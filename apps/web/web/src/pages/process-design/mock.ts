// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Thiết kế quy trình. Quy trình thật nằm ở platform/workflow/flowable/processes/
// (Git là nguồn sự thật); trang này chỉ soạn bản nháp rồi xuất tệp BPMN.
import type { BpmnNode, FormDef, NodeType, ProcessDef } from "./types";

export const PROCESSES_PATH = "platform/workflow/flowable/processes/";

/** Kiểu dữ liệu kéo–thả từ bảng thành phần sang canvas. */
export const DND_MIME = "application/x-bamboo-bpmn";

/** Kích thước vùng vẽ (mức zoom 100%). */
export const WORLD = { width: 560, height: 540 };

export const GROUPS = [
  { value: "reviewer_l1", label: "reviewer_l1 (đơn vị)" },
  { value: "reviewer_l2", label: "reviewer_l2 (công ty)" },
  { value: "ceo", label: "ceo (tổng giám đốc)" },
  { value: "data_owner", label: "data_owner (chủ dữ liệu)" },
];

export const FORMS: FormDef[] = [
  {
    id: "record_default",
    name: "Duyệt hồ sơ – mặc định",
    fields: [
      { label: "Tiêu đề", type: "Chữ", required: true },
      { label: "Loại hồ sơ", type: "Danh mục", required: true },
      { label: "Mô tả", type: "Đoạn văn" },
      { label: "Tệp đính kèm", type: "Tệp (kiểm dịch)", required: true },
      { label: "Thiết bị liên quan", type: "Tham chiếu bản sao số" },
    ],
  },
  {
    id: "incident_ext",
    name: "Báo cáo sự cố – mở rộng",
    fields: [
      { label: "Mức độ", type: "Danh mục", required: true },
      { label: "Thời điểm phát hiện", type: "Ngày giờ", required: true },
      { label: "Nhật ký cảm biến", type: "Tệp (kiểm dịch)" },
      { label: "Biện pháp tạm thời", type: "Đoạn văn", required: true },
    ],
  },
  {
    id: "access_request",
    name: "Yêu cầu cấp quyền dữ liệu",
    fields: [
      { label: "Tập dữ liệu", type: "Tham chiếu dịch vụ dữ liệu", required: true },
      { label: "Mục đích", type: "Đoạn văn", required: true },
      { label: "Thời hạn", type: "Ngày", required: true },
    ],
  },
];

export const SERVICES = [
  { value: "generate_result_sheet", label: "Sinh phiếu kết quả (PDF + niêm phong sổ cái)" },
  { value: "grant_data_access", label: "Cấp quyền trên dịch vụ dữ liệu" },
  { value: "notify_submitter", label: "Gửi thông báo cho người nộp" },
];

export const PALETTE: Array<{ type: NodeType; label: string }> = [
  { type: "start", label: "Sự kiện bắt đầu" },
  { type: "userTask", label: "Tác vụ người dùng" },
  { type: "serviceTask", label: "Tác vụ dịch vụ" },
  { type: "gateway", label: "Cổng rẽ nhánh" },
  { type: "end", label: "Sự kiện kết thúc" },
];

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  start: "Sự kiện bắt đầu",
  userTask: "Tác vụ người dùng",
  serviceTask: "Tác vụ dịch vụ",
  gateway: "Cổng rẽ nhánh",
  end: "Sự kiện kết thúc",
};

const ALL_DECISIONS: BpmnNode["decisions"] = ["approve", "return", "reject"];

// Bố cục theo trục dọc x = 300, giống bản thiết kế.
const TWO_LEVEL: ProcessDef = {
  id: "p-record-2l",
  key: "record_review_2l",
  name: "Duyệt hồ sơ 2 cấp",
  version: 4,
  status: "draft",
  note: "v3 đang chạy · 23 hồ sơ",
  model: {
    nodes: [
      { id: "start", type: "start", name: "Nộp hồ sơ", x: 300, y: 40, labelPos: "right" },
      { id: "l1", type: "userTask", name: "Duyệt cấp 1", x: 300, y: 130, group: "reviewer_l1", sla: "8 giờ làm việc", form: "record_default", decisions: ALL_DECISIONS },
      { id: "gw1", type: "gateway", name: "Quyết định cấp 1", x: 300, y: 222 },
      { id: "end_reject", type: "end", name: "Kết thúc", x: 470, y: 222, labelPos: "below", endTone: "danger" },
      { id: "l2", type: "userTask", name: "Duyệt cấp 2", x: 300, y: 320, group: "reviewer_l2", sla: "1 ngày", form: "record_default", decisions: ALL_DECISIONS },
      { id: "result", type: "serviceTask", name: "Sinh phiếu kết quả", x: 300, y: 420, service: "generate_result_sheet" },
      { id: "end_ok", type: "end", name: "Hoàn tất", x: 300, y: 505, labelPos: "right", endTone: "success" },
    ],
    edges: [
      { id: "f1", from: "start", to: "l1", points: [[300, 56], [300, 102]] },
      { id: "f2", from: "l1", to: "gw1", points: [[300, 158], [300, 205]] },
      { id: "f3", from: "gw1", to: "end_reject", label: "Từ chối", labelAt: [385, 208], points: [[317, 222], [454, 222]], notifySubmitter: false },
      { id: "f4", from: "gw1", to: "l2", label: "Duyệt", labelAt: [324, 262], points: [[300, 239], [300, 292]] },
      { id: "f5", from: "gw1", to: "start", label: "Trả lại", labelAt: [146, 208], dashed: true, points: [[283, 222], [120, 222], [120, 40], [284, 40]], notifySubmitter: true },
      { id: "f6", from: "l2", to: "result", points: [[300, 348], [300, 392]] },
      { id: "f7", from: "result", to: "end_ok", points: [[300, 448], [300, 489]] },
    ],
  },
};

/** Quy trình thẳng đơn giản: các bước xếp dọc, nối liền. */
const linear = (steps: Array<Omit<BpmnNode, "x" | "y">>) => {
  const gap = 100;
  const nodes = steps.map((s, i) => ({ ...s, x: 300, y: 50 + i * gap }));
  const half = (n: BpmnNode) => (n.type === "userTask" || n.type === "serviceTask" ? 28 : 16);
  const edges = nodes.slice(1).map((n, i) => {
    const prev = nodes[i];
    return {
      id: `f${i + 1}`,
      from: prev.id,
      to: n.id,
      points: [[300, prev.y + half(prev)], [300, n.y - half(n)]] as Array<[number, number]>,
    };
  });
  return { nodes, edges };
};

export const MOCK_PROCESSES: ProcessDef[] = [
  TWO_LEVEL,
  {
    id: "p-ic-purchase",
    key: "ic_purchase",
    name: "Mua sắm liên công ty",
    version: 1,
    status: "draft",
    note: "v1 · bản nháp",
    model: linear([
      { id: "start", type: "start", name: "Bên mua lập đơn", labelPos: "right" },
      { id: "buyer", type: "userTask", name: "Duyệt bên mua", group: "reviewer_l2", sla: "1 ngày", form: "record_default", decisions: ALL_DECISIONS },
      { id: "seller", type: "userTask", name: "Xác nhận bên bán", group: "reviewer_l2", sla: "2 ngày", form: "record_default", decisions: ["approve", "reject"] },
      { id: "end", type: "end", name: "Đối trừ công nợ", labelPos: "right", endTone: "success" },
    ]),
  },
  {
    id: "p-data-access",
    key: "data_access",
    name: "Cấp quyền dữ liệu",
    version: 1,
    status: "running",
    note: "v1 đang chạy · 2 hồ sơ",
    model: linear([
      { id: "start", type: "start", name: "Gửi yêu cầu", labelPos: "right" },
      { id: "owner", type: "userTask", name: "Chủ dữ liệu duyệt", group: "data_owner", sla: "2 ngày", form: "access_request", decisions: ["approve", "reject"] },
      { id: "grant", type: "serviceTask", name: "Cấp quyền", service: "grant_data_access" },
      { id: "end", type: "end", name: "Hoàn tất", labelPos: "right", endTone: "success" },
    ]),
  },
];
