// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu mẫu cho trang Bản sao số: 26 thực thể NGSI-LD (8 dây chuyền SMT, 4 phòng sạch, 14 thiết bị y tế).
// Mỗi mô hình (CleanRoom, SmtLine...) khai báo thuộc tính + ngưỡng một lần; từng thực thể chỉ ghi phần khác biệt.
// Trạng thái thẻ (Nguy cấp / Cảnh báo / Bình thường) được TÍNH từ dữ liệu, không ghi tay, nên luôn khớp với biểu đồ.

// ===== Module nội bộ =====
import { breachSpans, latestValue, minuteSeries } from "./signal";
import type { CategoryFilter, EntitySeed, Metric, MetricDef, MetricSeed, MetricStatus, TwinEntity } from "./types";
import { ENTITY_STATUS, formatDuration, formatNumber, thresholdText, worstStatus } from "./utils";

type Template = MetricDef & { base: number };

// ===== Mô hình dữ liệu (thuộc tính NGSI-LD + ngưỡng vận hành) =====
const CLEANROOM: Template[] = [
  {
    key: "particles05",
    label: "Hạt bụi ≥0,5 µm",
    unit: "/m³",
    unitLong: "hạt/m³",
    decimals: 0,
    threshold: { max: 3520 },
    limitLabel: "Ngưỡng ISO 5",
    noise: 70,
    base: 1300,
  },
  {
    key: "particles5",
    label: "Hạt bụi ≥5 µm",
    unit: "/m³",
    unitLong: "hạt/m³",
    decimals: 0,
    threshold: { max: 29 },
    limitLabel: "Ngưỡng ISO 5",
    noise: 3,
    base: 10,
  },
  {
    key: "differentialPressure",
    label: "Chênh áp",
    unit: "Pa",
    decimals: 0,
    threshold: { min: 10 },
    noise: 0.8,
    base: 14,
  },
  {
    key: "temperature",
    label: "Nhiệt độ",
    unit: "°C",
    decimals: 1,
    threshold: { min: 20, max: 22 },
    noise: 0.25,
    base: 21.1,
  },
  {
    key: "relativeHumidity",
    label: "Độ ẩm",
    unit: "%",
    decimals: 0,
    threshold: { min: 40, max: 50 },
    noise: 1.2,
    base: 45,
  },
  {
    key: "airVelocity",
    label: "Tốc độ gió",
    unit: "m/s",
    decimals: 2,
    threshold: { min: 0.36, max: 0.54 },
    noise: 0.02,
    base: 0.45,
  },
];

const SMT_LINE: Template[] = [
  {
    key: "reflowPeakTemperature",
    label: "Nhiệt độ đỉnh lò reflow",
    unit: "°C",
    decimals: 0,
    threshold: { min: 235, max: 250 },
    noise: 2,
    base: 242,
  },
  {
    key: "conveyorSpeed",
    label: "Tốc độ băng tải",
    unit: "cm/phút",
    decimals: 0,
    threshold: { min: 80, max: 100 },
    noise: 1.5,
    base: 90,
  },
  {
    key: "aoiDefectRate",
    label: "Tỷ lệ lỗi AOI",
    unit: "%",
    decimals: 2,
    threshold: { max: 0.5 },
    noise: 0.04,
    base: 0.18,
  },
  {
    key: "placementRate",
    label: "Tốc độ gắp đặt",
    unit: "k CPH",
    unitLong: "nghìn linh kiện/giờ",
    decimals: 0,
    threshold: { min: 60 },
    noise: 2,
    base: 72,
  },
  {
    key: "floorHumidity",
    label: "Độ ẩm xưởng",
    unit: "%",
    decimals: 0,
    threshold: { min: 30, max: 60 },
    noise: 1.5,
    base: 45,
  },
  {
    key: "floorTemperature",
    label: "Nhiệt độ xưởng",
    unit: "°C",
    decimals: 1,
    threshold: { min: 22, max: 26 },
    noise: 0.3,
    base: 24,
  },
];

// Thuộc tính kỹ thuật dùng chung cho thiết bị y tế nối mạng.
const battery: Template = {
  key: "batteryLevel",
  label: "Pin dự phòng",
  unit: "%",
  decimals: 0,
  threshold: { min: 30 },
  noise: 0.5,
  base: 95,
};
const boardTemp: Template = {
  key: "boardTemperature",
  label: "Nhiệt độ bo mạch",
  unit: "°C",
  decimals: 0,
  threshold: { max: 60 },
  noise: 1.5,
  base: 41,
};
const wifi: Template = {
  key: "wifiSignal",
  label: "Tín hiệu Wi-Fi",
  unit: "dBm",
  decimals: 0,
  threshold: { min: -75 },
  noise: 2,
  base: -58,
};
const latency: Template = {
  key: "syncLatency",
  label: "Độ trễ đồng bộ",
  unit: "ms",
  decimals: 0,
  threshold: { max: 500 },
  noise: 25,
  base: 180,
};

const VENTILATOR: Template[] = [
  {
    key: "airwayPressure",
    label: "Áp lực đường thở",
    unit: "cmH₂O",
    decimals: 0,
    threshold: { min: 5, max: 30 },
    noise: 1.5,
    base: 18,
  },
  {
    key: "oxygenFlow",
    label: "Lưu lượng O₂",
    unit: "L/phút",
    decimals: 1,
    threshold: { min: 2, max: 15 },
    noise: 0.3,
    base: 6,
  },
  {
    key: "gasTemperature",
    label: "Nhiệt độ khí thở",
    unit: "°C",
    decimals: 1,
    threshold: { min: 32, max: 37 },
    noise: 0.3,
    base: 34.5,
  },
  { key: "leakRate", label: "Tỷ lệ rò rỉ", unit: "%", decimals: 0, threshold: { max: 10 }, noise: 1, base: 4 },
  battery,
  boardTemp,
];

const MONITOR: Template[] = [
  battery,
  boardTemp,
  wifi,
  latency,
  {
    key: "sensorErrorRate",
    label: "Lỗi cảm biến",
    unit: "lần/giờ",
    decimals: 0,
    threshold: { max: 3 },
    noise: 0.4,
    base: 0.6,
  },
  { key: "cpuLoad", label: "Tải CPU", unit: "%", decimals: 0, threshold: { max: 85 }, noise: 4, base: 37 },
];

const COLD_STORAGE: Template[] = [
  {
    key: "temperature",
    label: "Nhiệt độ tủ",
    unit: "°C",
    decimals: 1,
    threshold: { min: 2, max: 8 },
    noise: 0.4,
    base: 4.6,
  },
  { key: "relativeHumidity", label: "Độ ẩm", unit: "%", decimals: 0, threshold: { max: 70 }, noise: 2, base: 52 },
  {
    key: "doorOpenings",
    label: "Số lần mở cửa",
    unit: "lần/giờ",
    decimals: 0,
    threshold: { max: 6 },
    noise: 0.8,
    base: 2,
  },
  {
    key: "supplyVoltage",
    label: "Điện áp nguồn",
    unit: "V",
    decimals: 0,
    threshold: { min: 207, max: 242 },
    noise: 2,
    base: 226,
  },
  { ...battery, base: 94 },
  { key: "compressorDuty", label: "Tải máy nén", unit: "%", decimals: 0, threshold: { max: 80 }, noise: 4, base: 46 },
];

const INFUSION_PUMP: Template[] = [
  {
    key: "occlusionPressure",
    label: "Áp lực tắc nghẽn",
    unit: "mmHg",
    decimals: 0,
    threshold: { max: 300 },
    noise: 8,
    base: 95,
  },
  {
    key: "flowDeviation",
    label: "Sai lệch lưu lượng",
    unit: "%",
    decimals: 1,
    threshold: { max: 5 },
    noise: 0.3,
    base: 1.6,
  },
  { ...battery, base: 76 },
  { ...boardTemp, base: 38 },
  { ...wifi, base: -61 },
  { ...latency, base: 210 },
];

const TEMPLATES: Record<string, Template[]> = {
  CleanRoom: CLEANROOM,
  SmtLine: SMT_LINE,
  Ventilator: VENTILATOR,
  PatientMonitor: MONITOR,
  ColdStorage: COLD_STORAGE,
  InfusionPump: INFUSION_PUMP,
};

// ===== Thực thể =====
const CHIP_BN = { site: "Nhà máy chip Bắc Ninh", siteId: "chip-bn", province: "Bắc Ninh" };
const PHONE_BG = { site: "Nhà máy điện thoại Bắc Giang", siteId: "phone-bg", province: "Bắc Giang" };
const PHONE_TN = { site: "Nhà máy điện thoại Thái Nguyên", siteId: "phone-tn", province: "Thái Nguyên" };
const HOSPITAL = { site: "Bệnh viện Hà Đông", siteId: "hospital-hd", province: "Hà Nội" };

const cleanRoom = (id: string, metrics: Record<string, MetricSeed>, extra: Partial<EntitySeed> = {}): EntitySeed => ({
  id,
  category: "cleanroom",
  type: "CleanRoom",
  urn: `urn:ngsi-ld:CleanRoom:semicon:${id}`,
  kind: "Phòng sạch",
  name: `Phòng sạch ${id}`,
  grade: "ISO 5",
  ...CHIP_BN,
  metrics,
  ...extra,
});

const smtLine = (code: string, place: typeof PHONE_BG, metrics: Record<string, MetricSeed> = {}): EntitySeed => ({
  id: `SMT-${code}`,
  category: "smt",
  type: "SmtLine",
  urn: `urn:ngsi-ld:SmtLine:phone:${code}`,
  kind: "Dây chuyền SMT",
  name: `Dây chuyền SMT ${code}`,
  grade: "IPC-A-610 loại 2",
  ...place,
  metrics,
});

const MEDICAL_KIND = {
  Ventilator: { prefix: "MT", name: "Máy thở", grade: "TTBYT loại C" },
  PatientMonitor: { prefix: "MON", name: "Máy theo dõi bệnh nhân", grade: "TTBYT loại B" },
  ColdStorage: { prefix: "TL", name: "Tủ bảo quản vắc-xin", grade: "TTBYT loại B" },
  InfusionPump: { prefix: "BT", name: "Bơm tiêm điện", grade: "TTBYT loại C" },
} as const;

const device = (
  type: keyof typeof MEDICAL_KIND,
  n: number,
  metrics: Record<string, MetricSeed> = {},
  extra: Partial<EntitySeed> = {},
): EntitySeed => {
  const k = MEDICAL_KIND[type];
  const id = `${k.prefix}-HD-${String(n).padStart(2, "0")}`;
  return {
    id,
    category: "medical",
    type,
    urn: `urn:ngsi-ld:${type}:hospital:${id}`,
    kind: k.name,
    name: `${k.name} ${id}`,
    grade: k.grade,
    ...HOSPITAL,
    metrics,
    ...extra,
  };
};

const SEEDS: EntitySeed[] = [
  // Phòng sạch: CR-02 có sự cố hạt bụi 18 phút (10:12–10:29) do chênh áp tụt từ 10:08 và chưa hồi.
  cleanRoom("CR-01", {}),
  cleanRoom("CR-02", {
    particles05: {
      base: 2950,
      value: 3120,
      incident: true,
      excursions: [
        { from: 30, to: 13, level: 3660 },
        { from: 4380, to: 4373, level: 3600 },
      ],
    },
    particles5: { base: 16, value: 18 },
    differentialPressure: { base: 12, value: 8, excursions: [{ from: 34, level: 8 }] },
    temperature: { base: 21.3, value: 21.4 },
    relativeHumidity: { base: 45, value: 45 },
    airVelocity: { base: 0.43, value: 0.42 },
  }),
  cleanRoom("CR-03", {
    particles05: { base: 2400 },
    relativeHumidity: { base: 47, value: 52, excursions: [{ from: 50, level: 52 }] },
  }),
  cleanRoom("CR-04", { particles05: { base: 1600 } }, { offlineMinutes: 2 }),

  // Dây chuyền SMT: BG-03 có sự cố lỗi AOI, TN-02 lò reflow quá nhiệt.
  smtLine("BG-01", PHONE_BG),
  smtLine("BG-02", PHONE_BG),
  smtLine("BG-03", PHONE_BG, {
    aoiDefectRate: { base: 0.2, value: 0.41, incident: true, excursions: [{ from: 26, to: 9, level: 0.72 }] },
  }),
  smtLine("BG-04", PHONE_BG),
  smtLine("BG-05", PHONE_BG, { placementRate: { base: 70 } }),
  smtLine("TN-01", PHONE_TN),
  smtLine("TN-02", PHONE_TN, {
    reflowPeakTemperature: { base: 244, value: 252, excursions: [{ from: 15, level: 252 }] },
  }),
  smtLine("TN-03", PHONE_TN),

  // Thiết bị y tế tại Bệnh viện Hà Đông.
  device("Ventilator", 1),
  device("Ventilator", 2),
  device("Ventilator", 3),
  device("Ventilator", 4, { batteryLevel: { base: 40, value: 24, excursions: [{ from: 40, level: 24 }] } }),
  device("PatientMonitor", 1),
  device("PatientMonitor", 2),
  device("PatientMonitor", 3, { wifiSignal: { base: -66, value: -79, excursions: [{ from: 20, level: -79 }] } }),
  device("PatientMonitor", 4),
  device("ColdStorage", 1),
  device("ColdStorage", 2, {
    temperature: { base: 4.8, value: 7.4, incident: true, excursions: [{ from: 47, to: 25, level: 9.1 }] },
    doorOpenings: { base: 5 },
  }),
  device("ColdStorage", 3),
  device("InfusionPump", 1),
  device("InfusionPump", 2, {}, { offlineMinutes: 6 }),
  device("InfusionPump", 3),
];

// ===== Tính trạng thái từ dữ liệu =====
const buildMetric = (entity: EntitySeed, tpl: Template): Metric => {
  const { base: defaultBase, ...def } = tpl;
  const seed = entity.metrics[tpl.key] ?? {};
  const signal = {
    seed: `${entity.id}:${tpl.key}`,
    base: seed.base ?? defaultBase,
    noise: tpl.noise,
    decimals: tpl.decimals,
    excursions: seed.excursions ?? [],
    pin: seed.value,
    gapMinutes: entity.offlineMinutes ?? 0,
  };
  const value = latestValue(signal);
  const th = tpl.threshold;

  let status: MetricStatus = "ok";
  let note = `Bình thường · ${thresholdText(th)}`;
  if (entity.offlineMinutes) {
    status = "stale";
    note = `Giá trị cuối · ${entity.offlineMinutes} phút trước`;
  } else if (seed.incident) {
    const spans = breachSpans(minuteSeries(signal, 60), th);
    const minutes = spans.reduce((a, s) => a + s.minutes, 0);
    const limit = spans[0]?.side === "below" ? th.min : th.max;
    status = "critical";
    note = `${spans[0]?.side === "below" ? "Dưới" : "Vượt"} ${formatDuration(minutes)} · ngưỡng ${formatNumber(limit ?? 0)}`;
  } else if (th.max != null && value > th.max) {
    status = "warning";
    note = `Cao · tối đa ${formatNumber(th.max)}`;
  } else if (th.min != null && value < th.min) {
    status = "warning";
    note = `Thấp · tối thiểu ${formatNumber(th.min)}`;
  }
  return { ...def, value, status, note, signal };
};

const buildEntity = (seed: EntitySeed): TwinEntity => {
  const metrics = (TEMPLATES[seed.type] ?? []).map((tpl) => buildMetric(seed, tpl));
  const status = seed.offlineMinutes ? "offline" : worstStatus(metrics.map((m) => m.status));
  const entityStatus = status === "stale" ? "offline" : status;
  return {
    ...seed,
    metrics,
    status: entityStatus,
    subtitle: seed.offlineMinutes
      ? `Mất tín hiệu ${seed.offlineMinutes} phút`
      : `${ENTITY_STATUS[entityStatus].label} · ${seed.province}`,
  };
};

export const MOCK_ENTITIES: TwinEntity[] = SEEDS.map(buildEntity);

export const DEFAULT_CATEGORY: CategoryFilter = "cleanroom";
export const DEFAULT_ENTITY_ID = "CR-02";
