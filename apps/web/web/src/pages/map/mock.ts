// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho trang Bản đồ. Nền bản đồ là hình vẽ SVG giả lập; khi nối thật, thay bằng lớp WMS/WMTS
// của GeoServer nội bộ (chạy được khi không có Internet) và lấy cơ sở/cảnh báo từ Bản sao số.
import type { CompanyKey, LayerKey, MapSite } from "./types";

/** Màu nhận diện công ty — trùng Trung tâm điều hành; luôn đi kèm hình dạng riêng (vuông/thoi/tròn/chữ thập). */
export const COMPANY_STYLE: Record<CompanyKey, { name: string; color: string }> = {
  phone: { name: "Điện thoại", color: "#2a78d6" },
  chip: { name: "Chip", color: "#eb6834" },
  appliance: { name: "Gia dụng", color: "#1baf7a" },
  hospital: { name: "Bệnh viện", color: "#eda100" },
};

export const LAYERS: Array<{ key: LayerKey; label: string }> = [
  { key: "phone", label: "Nhà máy điện thoại" },
  { key: "chip", label: "Nhà máy chip" },
  { key: "warehouse", label: "Kho & cửa hàng" },
  { key: "hospital", label: "Bệnh viện" },
  { key: "boundary", label: "Ranh giới hành chính" },
];

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  phone: true, chip: true, warehouse: true, hospital: true, boundary: false,
};

// 12 kho & cửa hàng Gia dụng: hiện thành một cụm "12", tách ra khi phóng to.
const STORES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const r = i % 2 ? 5.5 : 3.5;
  return { name: `Kho/cửa hàng Gia dụng #${i + 1}`, dx: Math.cos(angle) * r, dy: Math.sin(angle) * r * 1.3 };
});

export const MOCK_SITES: MapSite[] = [
  {
    id: "chip-bn", layer: "chip", company: "chip", name: "Nhà máy chip Bắc Ninh", address: "KCN Yên Phong, Bắc Ninh",
    x: 45, y: 42, devices: 14, openRecords: 6,
    alerts: [{ code: "CR-02", text: "hạt bụi vượt ngưỡng", status: "critical", age: "18 phút" }],
  },
  {
    id: "phone-bg", layer: "phone", company: "phone", name: "Nhà máy điện thoại Bắc Giang", address: "KCN Quang Châu, Bắc Giang",
    x: 23, y: 30, devices: 22, openRecords: 9,
    alerts: [{ code: "SMT-02", text: "dừng máy", status: "warning", age: "42 phút" }],
  },
  {
    id: "phone-tn", layer: "phone", company: "phone", name: "Nhà máy điện thoại Thái Nguyên", address: "KCN Yên Bình, Thái Nguyên",
    x: 31, y: 63, devices: 31, openRecords: 4, alerts: [],
  },
  {
    id: "stores", layer: "warehouse", company: "appliance", name: "Kho & cửa hàng Gia dụng", address: "Hà Nội và vùng lân cận",
    x: 64, y: 70, devices: 48, openRecords: 7, alerts: [], cluster: STORES,
  },
  {
    id: "hospital-hd", layer: "hospital", company: "hospital", name: "Bệnh viện Hà Đông", address: "Hà Đông, Hà Nội",
    x: 87, y: 24, devices: 120, openRecords: 11,
    alerts: [{ code: "MD-ICU-07", text: "pin yếu", status: "warning", age: "1 giờ" }],
  },
];

/** Số điểm theo lớp (cụm tính theo số điểm bên trong). */
export const layerCount = (layer: LayerKey) =>
  MOCK_SITES.filter((s) => s.layer === layer).reduce((n, s) => n + (s.cluster?.length ?? 1), 0);

export const ATTRIBUTION = "© OpenStreetMap contributors · GeoServer";
