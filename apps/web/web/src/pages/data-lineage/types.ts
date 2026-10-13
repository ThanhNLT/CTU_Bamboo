// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
/** 5 tầng của sơ đồ, theo thứ tự trái → phải. */
export type Layer = "source" | "stream" | "lake" | "serving" | "consumer";

export type Direction = "upstream" | "both" | "downstream";

/** Trạng thái nút: tự tính từ kiểm tra chất lượng (lỗi) và quan hệ phía sau (bị ảnh hưởng). */
export type NodeStatus = "healthy" | "failed" | "affected";

/** Một kiểm tra chất lượng Soda. */
export type QualityCheck = {
  /** Biểu thức kiểm tra, hiển thị bằng font mono: `row_count > 0`. */
  rule: string;
  /** Tên dễ đọc, dùng trên banner: "approved_at không rỗng". */
  name: string;
  passed: boolean;
  /** "Đạt · 48.210 dòng", "Lỗi · 37 dòng rỗng". */
  detail: string;
  /** Giờ phát hiện lỗi (chỉ với kiểm tra lỗi). */
  failedAt?: string;
};

export type LineageNode = {
  id: string;
  layer: Layer;
  /** Vị trí theo hàng (có thể lẻ, vd 0.5 = giữa hàng 0 và 1). */
  row: number;
  /** Công nghệ / loại hiển thị phía trên tên: PostgreSQL, Kafka, Iceberg, KPI... */
  tech: string;
  name: string;
  /** Tên kỹ thuật (bảng, topic) → font mono; tên báo cáo/KPI → font thường, đậm. */
  mono: boolean;
  /** Tên đầy đủ trong OpenMetadata. */
  fqn: string;
  title: string;
  owner: string;
  updated: string;
  checks: QualityCheck[];
  /** Cột được theo dõi khi bật "Phả hệ mức cột". */
  columns?: string[];
  /** Mô tả nơi dùng, cho danh sách "Tác động phía sau": "KPI · Trung tâm điều hành". */
  usedBy?: string;
  /** Mở trong ứng dụng (vd. KPI → Trung tâm điều hành). */
  appLink?: string;
  /** Mã tập dữ liệu trên trang Dịch vụ dữ liệu (nếu có). */
  datasetId?: string;
};

export type LineageEdge = { from: string; to: string };

export type RunResult = "success" | "check_failed" | "failed" | "running";

export type RunRow = {
  id: string;
  task: string;
  engine: string;
  start: string;
  duration: string;
  result: RunResult;
  nodeId: string;
};
