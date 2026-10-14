// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { AssistantMode, ChartSpec, ChatSession, Citation } from "./types";

export const MODES: Array<{ key: AssistantMode; label: string }> = [
  { key: "auto", label: "Tự động" },
  { key: "knowledge", label: "Tri thức" },
  { key: "eoffice", label: "e-Office" },
  { key: "analytics", label: "Phân tích & dự báo" },
  { key: "operations", label: "Vận hành" },
  { key: "documents", label: "Tài liệu" },
];

export const MODEL_LABEL = "Qwen3 · chạy nội bộ";
export const SCOPE_NOTE = "Chỉ trả lời trong phạm vi quyền của bạn · dữ liệu không rời hệ thống";
export const RETENTION_NOTE = "Lưu 30 ngày · không dùng để huấn luyện mô hình";

export const SRC_INCIDENT: Citation = { id: 1, label: "Biên bản sự cố SMT-02 · 01/10", to: "/p/records" };
export const SRC_CLEANROOM_RULE: Citation = { id: 1, label: "Quy chế vận hành phòng sạch · v3", to: "/h/library" };
export const LIB_CLEANROOM_TEXT =
  "Quy chế vận hành phòng sạch (v3, hiệu lực 01/09/2026) quy định kiểm soát ra vào qua khóa khí và giám sát liên tục hạt bụi, " +
  "nhiệt độ, độ ẩm, chênh áp [1]. Khi hạt bụi vượt ngưỡng cấp sạch quá **15 phút**, trưởng ca lập biên bản xử lý tạm thời " +
  "trong **2 giờ** và gửi hồ sơ “Báo cáo sự cố phòng sạch” trên e-Office (Điều 12) [1].";
export const SRC_OEE_DEF: Citation = { id: 2, label: "Từ điển chỉ số · mfg.oee", to: "/d/services?dataset=ds-smt-oee" };

export const OEE_CHART: ChartSpec = {
  title: "OEE dây chuyền SMT theo tuần (%)",
  link: { label: "Mở trong Điều hành", to: "/d/ops" },
  data: [
    { label: "T33", actual: 84.6 },
    { label: "T34", actual: 85.2 },
    { label: "T35", actual: 84.0 },
    { label: "T36", actual: 85.4 },
    { label: "T37", actual: 84.9 },
    { label: "T38", actual: 85.5 },
    { label: "T39", actual: 84.2 },
    { label: "T40", actual: 81.0, forecast: 81.0, band: [81.0, 81.0] },
    { label: "T41", actual: null, forecast: 81.5, band: [80.0, 83.0] },
  ],
  yDomain: [80, 88],
  yTicks: [80, 82, 84, 86, 88],
  legend: { actual: "Thực tế", forecast: "Dự báo", band: "Khoảng tin cậy 80%" },
  decimals: 1,
  method: "Phương pháp: hồi quy tuyến tính 12 tuần · dữ liệu đến 06/10 23:59",
};

export const OEE_STEPS = [
  { name: "query_metric", args: 'metric="mfg.oee", line="SMT-*", weeks=12', ms: 400 },
  { name: "get_twin_history", args: 'entity="SMT-02", from="01/10"', ms: 600 },
  { name: "forecast_metric", args: 'method="linear", horizon=1, interval=0.8', ms: 900 },
];

export const SESSIONS: ChatSession[] = [
  {
    id: "s-oee",
    title: "OEE tuần này giảm",
    group: "today",
    context: "Trung tâm điều hành · OEE",
    messages: [
      { id: "m1", role: "user", text: "Vì sao OEE tuần này giảm? Dự báo tuần tới thế nào?" },
      {
        id: "m2",
        role: "assistant",
        text:
          "OEE dây chuyền SMT tuần 40 là **81,0%**, giảm 3,2 điểm so với tuần 39. Nguyên nhân chính là SMT-02 dừng 9 giờ " +
          "ngày 01/10 do lỗi cấp linh kiện [1]; hai dây chuyền còn lại vẫn ổn định. Dự báo tuần 41 khoảng **80–83%** " +
          "nếu SMT-02 không dừng thêm [2].",
        chart: OEE_CHART,
        steps: OEE_STEPS,
        sources: [SRC_INCIDENT, SRC_OEE_DEF],
        action: {
          title: "Trợ lý đề xuất: tạo hồ sơ nháp",
          recordType: "Báo cáo lỗi dây chuyền",
          device: "SMT-02 · Nhà máy điện thoại",
          description: "Dừng 9 giờ ngày 01/10 do lỗi cấp linh kiện; OEE tuần 40 giảm 3,2 điểm.",
          note: "Chỉ tạo ở trạng thái Nháp khi bạn xác nhận · trợ lý không tự gửi duyệt.",
        },
      },
    ],
  },
  {
    id: "s-l2",
    title: "Hồ sơ chờ duyệt cấp 2",
    group: "today",
    messages: [
      { id: "m1", role: "user", text: "Tôi còn bao nhiêu hồ sơ chờ duyệt cấp 2?" },
      {
        id: "m2",
        role: "assistant",
        text:
          "Bạn có **5** việc trong Hộp việc, trong đó **2** hồ sơ đang chờ bạn duyệt cấp 2. Gấp nhất là HS-SEMI-2026-00125 " +
          "“Báo cáo sự cố phòng sạch CR-02”, còn khoảng 3 giờ trước hạn [1].",
        steps: [{ name: "list_tasks", args: 'assignee="me", step="Cấp 2"', ms: 300 }],
        sources: [{ id: 1, label: "Hộp việc · hạn xử lý", to: "/p/tasks" }],
      },
    ],
  },
  {
    id: "s-cleanroom",
    title: "Quy chế cấp phòng sạch",
    group: "yesterday",
    context: "Thư viện tri thức",
    messages: [
      { id: "m1", role: "user", text: "Quy chế phòng sạch quy định gì khi hạt bụi vượt ngưỡng?" },
      {
        id: "m2",
        role: "assistant",
        text: LIB_CLEANROOM_TEXT,
        steps: [{ name: "search_library", args: 'query="phòng sạch vượt ngưỡng", top_k=5', ms: 500 }],
        sources: [SRC_CLEANROOM_RULE],
      },
    ],
  },
  {
    id: "s-ecr",
    title: "Tóm tắt ECR-88",
    group: "yesterday",
    messages: [
      { id: "m1", role: "user", text: "Tóm tắt yêu cầu thay đổi ECR-88 giúp tôi." },
      {
        id: "m2",
        role: "assistant",
        text:
          "ECR-88 (hồ sơ HS-MOB-2026-00311) đề nghị đổi vật liệu khung trong từ nhôm 6061 sang 6013 để giảm **8%** khối lượng. " +
          "Hồ sơ đang chờ duyệt cấp 2 và đã quá hạn 5 giờ; đã niêm phong phiên bản 2 trên sổ cái [1].",
        steps: [{ name: "get_record", args: 'code="HS-MOB-2026-00311"', ms: 300 }],
        sources: [{ id: 1, label: "Sổ cái · HS-MOB-2026-00311 v2", to: "/d/ledger?doc=HS-MOB-2026-00311" }],
      },
    ],
  },
  {
    id: "s-stock",
    title: "Dự báo tồn kho chip",
    group: "lastWeek",
    messages: [
      { id: "m1", role: "user", text: "Dự báo tồn kho chip PMIC tháng 11?" },
      {
        id: "m2",
        role: "assistant",
        text: "Tồn kho PMIC dự kiến cuối tháng 11 khoảng **42.000–48.000** con, đủ cho khoảng 3 tuần sản xuất [1].",
        steps: [{ name: "forecast_metric", args: 'metric="inv.pmic", horizon=8', ms: 800 }],
        sources: [{ id: 1, label: "Tập dữ liệu tồn kho · inv.stock_daily", to: "/d/services" }],
      },
    ],
  },
  {
    id: "s-letter",
    title: "Soạn công văn gửi nhà cung cấp",
    group: "lastWeek",
    messages: [
      { id: "m1", role: "user", text: "Soạn công văn nhắc nhà cung cấp hóa chất CMP giao hàng trễ." },
      {
        id: "m2",
        role: "assistant",
        text:
          "Tôi đã soạn bản nháp công văn theo mẫu CV-NCC-02, nêu lô hàng trễ 6 ngày và đề nghị phản hồi trước 15/10 [1]. " +
          "Bạn mở Ổ đĩa tài liệu để sửa và trình ký.",
        steps: [{ name: "draft_document", args: 'template="CV-NCC-02"', ms: 1200 }],
        sources: [{ id: 1, label: "Mẫu công văn CV-NCC-02", to: "/h/drive" }],
      },
    ],
  },
  {
    id: "s-pe04",
    title: "Sự cố máy khắc PE-04",
    group: "lastWeek",
    messages: [
      { id: "m1", role: "user", text: "Máy khắc PE-04 báo lỗi RF, có tiền lệ không?" },
      {
        id: "m2",
        role: "assistant",
        text: "Có **2** lần tương tự trong 12 tháng, cả hai do bộ khớp trở kháng RF; lần gần nhất xử lý trong 6 giờ [1].",
        steps: [{ name: "search_records", args: 'query="PE-04 RF", months=12', ms: 600 }],
        sources: [{ id: 1, label: "Hồ sơ sự cố thiết bị khắc", to: "/p/records" }],
      },
    ],
  },
];

export const GROUP_LABEL = { today: "Hôm nay", yesterday: "Hôm qua", lastWeek: "Tuần trước" } as const;

export const DEFAULT_SUGGESTIONS = [
  "Tạo báo cáo tuần cho SMT-02",
  "So sánh với cùng kỳ năm trước",
  "Ai đang xử lý sự cố SMT-02?",
];

export const NEXT_DRAFT_CODE = "HS-MOB-2026-00320";
