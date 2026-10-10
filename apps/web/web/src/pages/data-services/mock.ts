// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Dịch vụ dữ liệu (DaaS). Khi có API: danh mục lấy từ kho siêu dữ liệu (catalog),
// dữ liệu mẫu qua Trino view đã che PII, chất lượng từ kết quả kiểm tra hằng ngày.
import type { Dataset, DomainFilter } from "./types";

export const DOMAIN_LABEL: Record<Exclude<DomainFilter, "all">, string> = {
  process: "Quy trình",
  production: "Sản xuất",
  health: "Y tế",
  security: "An ninh",
};

/** Tổng số tập dữ liệu theo lĩnh vực trong toàn danh mục (máy chủ đếm; danh sách bên dưới là một trang). */
export const DOMAIN_TOTALS: Record<DomainFilter, number> = {
  all: 18, process: 6, production: 5, health: 3, security: 2,
};

export const MOCK_DATASETS: Dataset[] = [
  {
    id: "ds-approval-daily",
    table: "mart.approval_daily",
    title: "Hồ sơ duyệt theo ngày",
    description: "Số hồ sơ nộp, duyệt, trả lại theo ngày, công ty, loại hồ sơ. Nguồn của KPI “Duyệt đúng hạn”.",
    domain: "process",
    owner: "Nhóm dữ liệu (B)",
    refresh: "15 phút / lần",
    rows: 48210,
    access: "GraphQL · Trino view",
    updatedLabel: "10 phút trước",
    certified: false,
    pii: "none",
    tier: "warm",
    columns: [
      { name: "day", type: "date", description: "Ngày (Asia/Ho_Chi_Minh)" },
      { name: "tenant_id", type: "text", description: "Công ty · lọc theo quyền" },
      { name: "document_type", type: "text", description: "Loại hồ sơ" },
      { name: "submitted", type: "int", description: "Số hồ sơ nộp trong ngày" },
      { name: "approved", type: "int", description: "Số hồ sơ duyệt xong" },
      { name: "returned", type: "int", description: "Số hồ sơ bị trả lại" },
      { name: "approved_on_time", type: "int", description: "Số hồ sơ duyệt đúng hạn" },
    ],
    sample: [
      { day: "2026-10-06", tenant_id: "SEMI", document_type: "incident", submitted: 9, approved: 7, returned: 1, approved_on_time: 7 },
      { day: "2026-10-06", tenant_id: "MOB", document_type: "release", submitted: 14, approved: 12, returned: 2, approved_on_time: 11 },
      { day: "2026-10-06", tenant_id: "APP", document_type: "purchase", submitted: 6, approved: 5, returned: 0, approved_on_time: 5 },
      { day: "2026-10-05", tenant_id: "HOS", document_type: "purchase", submitted: 4, approved: 3, returned: 1, approved_on_time: 2 },
      { day: "2026-10-05", tenant_id: "SEMI", document_type: "calibration", submitted: 3, approved: 3, returned: 0, approved_on_time: 3 },
    ],
    checks: [
      { name: "Không trùng khóa (day, tenant_id, document_type)", passed: true, detail: "0 dòng trùng" },
      { name: "approved ≤ submitted", passed: true, detail: "48.210 / 48.210 dòng đạt" },
      { name: "Độ tươi ≤ 30 phút", passed: false, detail: "Lần làm mới gần nhất trễ 42 phút (job wf_daily_rollup)" },
      { name: "Không giá trị rỗng ở cột khóa", passed: true, detail: "0 dòng rỗng" },
    ],
    upstream: ["wf.task_history", "proc.purchase_request", "hr.onboarding_request"],
    downstream: ["KPI “Duyệt đúng hạn”", "Trung tâm điều hành · Hồ sơ được duyệt mỗi ngày", "Metabase · Hồ sơ duyệt theo tháng"],
    graphql: `query {
  approval_daily(where: { day: { _gte: "2026-10-01" } }) {
    day  tenant_id  approved_on_time
  }
}`,
    sql: `SELECT day, tenant_id, sum(approved_on_time) AS on_time
FROM mart.approval_daily
WHERE day >= DATE '2026-10-01'
GROUP BY 1, 2
ORDER BY 1;`,
  },
  {
    id: "ds-smt-oee",
    table: "mart.smt_oee_hourly",
    title: "OEE dây chuyền SMT theo giờ",
    description: "Sẵn sàng × Hiệu năng × Chất lượng theo giờ cho từng dây chuyền SMT, tính từ dữ liệu máy.",
    domain: "production",
    owner: "Nhóm Sản xuất số",
    refresh: "1 giờ / lần",
    rows: 182400,
    access: "GraphQL · Trino view",
    updatedLabel: "5 phút trước",
    certified: true,
    pii: "none",
    tier: "warm",
    columns: [
      { name: "hour", type: "timestamptz", description: "Mốc giờ" },
      { name: "line_id", type: "text", description: "Dây chuyền (SMT-01…SMT-08)" },
      { name: "availability", type: "numeric", description: "Tỷ lệ sẵn sàng (0–1)" },
      { name: "performance", type: "numeric", description: "Tỷ lệ hiệu năng (0–1)" },
      { name: "quality", type: "numeric", description: "Tỷ lệ đạt chất lượng (0–1)" },
      { name: "oee", type: "numeric", description: "OEE = A × P × Q" },
    ],
    checks: [
      { name: "0 ≤ oee ≤ 1", passed: true, detail: "Tất cả dòng đạt" },
      { name: "Đủ 24 giờ mỗi ngày mỗi dây chuyền", passed: true, detail: "Đạt 7 ngày gần nhất" },
    ],
    upstream: ["iot.machine_events", "mes.production_orders"],
    downstream: ["Trung tâm điều hành · OEE dây chuyền", "Bản sao số · SMT"],
    graphql: `query {
  smt_oee_hourly(where: { line_id: { _eq: "SMT-02" } }, order_by: { hour: desc }, limit: 24) {
    hour  oee
  }
}`,
    sql: `SELECT line_id, avg(oee) AS oee_7d
FROM mart.smt_oee_hourly
WHERE hour >= now() - INTERVAL '7' DAY
GROUP BY 1;`,
  },
  {
    id: "ds-medical-device",
    table: "mart.medical_device_util",
    title: "Sử dụng thiết bị y tế",
    description: "Giờ sử dụng và thời gian chờ của thiết bị y tế theo khoa. Bệnh nhân đã được che; nhóm dưới 5 lần bị ẩn.",
    domain: "health",
    owner: "Phòng Vật tư Bệnh viện",
    refresh: "Hằng giờ",
    rows: 9640,
    access: "Trino view (đã che PII)",
    updatedLabel: "1 giờ trước",
    certified: true,
    pii: "masked",
    piiNote: "nhóm < 5 ẩn",
    tier: "warm",
    columns: [
      { name: "day", type: "date", description: "Ngày" },
      { name: "department", type: "text", description: "Khoa" },
      { name: "device_id", type: "text", description: "Mã thiết bị (MD-…)" },
      { name: "used_hours", type: "numeric", description: "Giờ sử dụng" },
      { name: "patient_ref", type: "text", description: "Mã bệnh nhân đã băm (không đảo ngược được)", pii: true },
    ],
    checks: [
      { name: "k-ẩn danh ≥ 5", passed: true, detail: "Nhóm nhỏ hơn 5 đã bị ẩn" },
      { name: "used_hours ≤ 24", passed: true, detail: "Tất cả dòng đạt" },
    ],
    upstream: ["his.device_usage", "his.encounters (đã che)"],
    downstream: ["Báo cáo vật tư bệnh viện"],
    graphql: `query {
  medical_device_util(where: { department: { _eq: "ICU" } }) {
    day  device_id  used_hours
  }
}`,
    sql: `SELECT department, sum(used_hours) AS hours
FROM mart.medical_device_util
GROUP BY 1;`,
  },
  {
    id: "ds-kpi-monthly",
    table: "lake.kpi_monthly_snapshot",
    title: "KPI chốt kỳ theo tháng",
    description: "Ảnh chụp KPI toàn tập đoàn tại thời điểm chốt kỳ. Bất biến — dùng cho báo cáo và kiểm toán.",
    domain: "process",
    owner: "Ban Kế hoạch",
    refresh: "Chốt cuối tháng",
    rows: 1188,
    access: "Trino view",
    updatedLabel: "Chốt 30/09/2026",
    certified: true,
    pii: "none",
    tier: "cold",
    columns: [
      { name: "period", type: "text", description: "Kỳ (YYYY-MM)" },
      { name: "tenant_id", type: "text", description: "Công ty" },
      { name: "kpi_code", type: "text", description: "Mã KPI" },
      { name: "value", type: "numeric", description: "Giá trị chốt" },
      { name: "sealed_hash", type: "text", description: "Mã băm niêm phong sổ cái" },
    ],
    checks: [{ name: "Băm khớp sổ cái", passed: true, detail: "Đối chiếu 1.188 / 1.188 dòng" }],
    upstream: ["mart.approval_daily", "mart.smt_oee_hourly", "Sổ cái"],
    downstream: ["Báo cáo HĐQT", "Kiểm toán nội bộ"],
    graphql: `query {
  kpi_monthly_snapshot(where: { period: { _eq: "2026-09" } }) {
    tenant_id  kpi_code  value
  }
}`,
    sql: `SELECT tenant_id, kpi_code, value
FROM lake.kpi_monthly_snapshot
WHERE period = '2026-09';`,
  },
  {
    id: "ds-wafer-yield",
    table: "mart.wafer_yield_daily",
    title: "Hiệu suất wafer theo ngày",
    description: "Tỷ lệ die đạt theo lô wafer và ngày, kèm nguyên nhân lỗi chính.",
    domain: "production",
    owner: "Nhóm Sản xuất số",
    refresh: "Hằng ngày",
    rows: 22310,
    access: "GraphQL · Trino view",
    updatedLabel: "Hôm qua",
    certified: true,
    pii: "none",
    tier: "warm",
    columns: [
      { name: "day", type: "date", description: "Ngày" },
      { name: "lot_id", type: "text", description: "Lô wafer (W-…)" },
      { name: "yield", type: "numeric", description: "Tỷ lệ die đạt (0–1)" },
      { name: "top_defect", type: "text", description: "Nguyên nhân lỗi chính" },
    ],
    checks: [{ name: "0 ≤ yield ≤ 1", passed: true, detail: "Tất cả dòng đạt" }],
    upstream: ["mes.wafer_test_results"],
    downstream: ["Phiếu xuất xưởng"],
    graphql: `query {
  wafer_yield_daily(where: { lot_id: { _eq: "W-77" } }) { day  yield  top_defect }
}`,
    sql: `SELECT lot_id, avg(yield) FROM mart.wafer_yield_daily GROUP BY 1;`,
  },
  {
    id: "ds-auth-events",
    table: "mart.auth_events_daily",
    title: "Sự kiện đăng nhập theo ngày",
    description: "Số lần đăng nhập, thất bại, MFA theo ngày và công ty. Không chứa địa chỉ IP hay tên người dùng.",
    domain: "security",
    owner: "Nhóm Nền tảng (A)",
    refresh: "Hằng giờ",
    rows: 3650,
    access: "Trino view",
    updatedLabel: "30 phút trước",
    certified: true,
    pii: "none",
    tier: "hot",
    columns: [
      { name: "day", type: "date", description: "Ngày" },
      { name: "tenant_id", type: "text", description: "Công ty" },
      { name: "logins", type: "int", description: "Số lần đăng nhập thành công" },
      { name: "failures", type: "int", description: "Số lần thất bại" },
      { name: "mfa_rate", type: "numeric", description: "Tỷ lệ phiên có MFA" },
    ],
    checks: [{ name: "failures ≥ 0", passed: true, detail: "Tất cả dòng đạt" }],
    upstream: ["keycloak.events"],
    downstream: ["Bảng an ninh nền tảng"],
    graphql: `query {
  auth_events_daily(order_by: { day: desc }, limit: 7) { day  tenant_id  failures }
}`,
    sql: `SELECT day, sum(failures) FROM mart.auth_events_daily GROUP BY 1 ORDER BY 1 DESC;`,
  },
];
