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

/**
 * Một lần lệch khỏi trạng thái nền (dùng để sinh chuỗi dữ liệu mẫu).
 * Tính bằng phút so với "bây giờ": `from: 30` là 30 phút trước; không có `to` nghĩa là vẫn đang diễn ra.
 */
export type Excursion = { from: number; to?: number; level: number };

/** Khai báo thuộc tính NGSI-LD của một mô hình (dùng chung cho mọi thực thể cùng loại). */
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
  /** Biên độ dao động tự nhiên quanh giá trị nền. */
  noise: number;
};

/** Cấu hình chỉ số của một thực thể trong dữ liệu mẫu: giá trị nền, giá trị hiện tại, các lần lệch. */
export type MetricSeed = {
  base?: number;
  /** Giá trị đọc gần nhất (điểm cuối của chuỗi được "ghim" vào giá trị này). */
  value?: number;
  excursions?: Excursion[];
  /** Có sự cố vượt ngưỡng chưa đóng → thẻ chỉ số chuyển "Nguy cấp". */
  incident?: boolean;
};

/** Đủ thông tin để dựng lại chuỗi dữ liệu lịch sử (thay cho lời gọi Scorpio Temporal API). */
export type SignalSpec = {
  seed: string;
  base: number;
  noise: number;
  decimals: number;
  excursions: Excursion[];
  /** Giá trị ghim tại điểm dữ liệu cuối cùng. */
  pin?: number;
  /** Số phút không có dữ liệu ở cuối chuỗi (thiết bị mất tín hiệu). */
  gapMinutes: number;
};

export type EntitySeed = {
  id: string;
  category: EntityCategory;
  /** Loại thực thể NGSI-LD (CleanRoom, SmtLine, Ventilator...). */
  type: string;
  urn: string;
  /** Loại thiết bị bằng tiếng Việt, ví dụ "Phòng sạch", "Máy thở". */
  kind: string;
  name: string;
  site: string;
  /** Mã địa điểm trên trang Bản đồ (/d/map), để mở thẳng từ bản đồ. */
  siteId: string;
  province: string;
  /** Hạng / phân loại hiển thị cạnh trạng thái, ví dụ "ISO 5". */
  grade: string;
  /** Mất tín hiệu bao nhiêu phút (không có = đang trực tuyến). */
  offlineMinutes?: number;
  metrics: Record<string, MetricSeed>;
};

/** Một chỉ số đã tính sẵn trạng thái, sẵn sàng hiển thị trên thẻ. */
export type Metric = MetricDef & {
  value: number;
  status: MetricStatus;
  note: string;
  signal: SignalSpec;
};

export type TwinEntity = Omit<EntitySeed, "metrics"> & {
  status: EntityStatus;
  /** Dòng phụ trên thẻ danh sách, ví dụ "Nguy cấp · Bắc Ninh". */
  subtitle: string;
  metrics: Metric[];
};

export type SeriesPoint = { t: number; v: number | null };

/** Một đoạn liên tục vượt ngưỡng, tính bằng mốc thời gian (ms). */
export type BreachSpan = { start: number; end: number; minutes: number; side: "above" | "below" };
