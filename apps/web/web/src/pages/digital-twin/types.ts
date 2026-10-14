// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
export type EntityCategory = "smt" | "cleanroom" | "medical";
export type CategoryFilter = "all" | EntityCategory;

/** Trạng thái thực thể (chấm màu trong danh sách, tag ở đầu chi tiết). */
export type EntityStatus = "critical" | "warning" | "ok" | "offline";
/** Trạng thái một chỉ số. "stale" = thiết bị mất tín hiệu, đang hiện giá trị cuối cùng nhận được. */
export type MetricStatus = "critical" | "warning" | "ok" | "stale";

export type TimeRange = "1h" | "24h" | "7d";

/** Ngưỡng vận hành. Chỉ có `max` (hạt bụi), chỉ có `min` (chênh áp) hoặc cả hai (nhiệt độ). */
export type Threshold = { min?: number; max?: number };

/** Khai báo thuộc tính NGSI-LD của một mô hình (bảng iot.model, dùng chung cho mọi thực thể cùng loại). */
export type MetricDef = {
  /** Tên thuộc tính NGSI-LD, ví dụ `particles05`. */
  key: string;
  label: string;
  /** Đơn vị ngắn trên thẻ chỉ số ("/m³"). */
  unit: string;
  /** Đơn vị đầy đủ trên tiêu đề biểu đồ ("hạt/m³"). Mặc định = unit. */
  unitLong?: string;
  decimals: number;
  threshold: Threshold;
  /** Tên ngưỡng trên biểu đồ, ví dụ "Ngưỡng ISO 5". */
  limitLabel?: string;
};

/** Một lần vượt ngưỡng (iot.incident). */
export type Incident = {
  id: string;
  code: string;
  attribute: string;
  side: "above" | "below";
  threshold: number;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  peak: number;
  severity: "critical" | "warning";
  open: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ackNote: string | null;
};

/** Một chỉ số đã tính sẵn trạng thái, sẵn sàng hiển thị trên thẻ. */
export type Metric = MetricDef & {
  value: number;
  observedAt: string | null;
  status: MetricStatus;
  note: string;
  /** Sự cố nghiêm trọng chưa ghi nhận làm chỉ số "Nguy cấp". */
  incident?: Incident;
};

export type TwinEntity = {
  /** Mã thực thể (CR-02), dùng trên URL `?entity=`. */
  id: string;
  /** Khóa iot.entity.id. */
  uuid: string;
  category: EntityCategory;
  /** Loại thực thể NGSI-LD (CleanRoom, SmtLine, Ventilator...). */
  type: string;
  urn: string;
  /** Loại thiết bị bằng tiếng Việt, ví dụ "Phòng sạch", "Máy thở". */
  kind: string;
  name: string;
  site: string;
  /** Mã cơ sở (iot.site.code), mở thẳng bằng `?site=`. */
  siteId: string;
  province: string;
  /** Hạng / phân loại hiển thị cạnh trạng thái, ví dụ "ISO 5". */
  grade: string;
  /** Mất tín hiệu bao nhiêu phút (không có = đang trực tuyến). */
  offlineMinutes?: number;
  lastSeenAt: string | null;
  status: EntityStatus;
  /** Dòng phụ trên thẻ danh sách, ví dụ "Nguy cấp · Bắc Ninh". */
  subtitle: string;
  metrics: Metric[];
  incidents: Incident[];
};

export type SeriesPoint = { t: number; v: number | null };

/** Một đoạn liên tục vượt ngưỡng, tính bằng mốc thời gian (ms). */
export type BreachSpan = { start: number; end: number; minutes: number; side: "above" | "below" };
